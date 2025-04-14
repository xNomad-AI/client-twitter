import { Inject, Injectable, Logger } from '@nestjs/common';
import { type IAgentRuntime } from '@elizaos/core';
import { Cron, CronExpression } from '@nestjs/schedule';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { TwitterClient, TwitterClientStatus } from '@elizaos/client-twitter';
import _ from 'lodash';

import { TasksService } from '../tasks/tasks.service.js';
import { taskTimeout, workerUuid } from '../constant.js';
import { IRuntimeCreator, TaskEvent, TaskEventName } from '../tasks/interfaces/task.interface.js';
import { isRunningByAnotherWorker, isTaskPaused, Task, TaskActionName, TaskStatusName } from '../tasks/schemas/task.schema.js';
import { SHARED_SERVICE } from '../shared/shared.service.js';
import { MongodbLockService } from './lock.service.js';

async function randomDelay() {
  // 10s
  const randomDelay = Math.floor(Math.random() * 1000 * 10);

  return new Promise<void>((resolve) => {
    setTimeout(() => {
      resolve();
    }, randomDelay);
  });
}

const CheckLocalTasksStatusCronTime = CronExpression.EVERY_MINUTE;
const CheckLocalTasksStatusTimesOneDay = 60 * 24;
const EVERY_2_MINUTE = "*/2 * * * *";

export function CatchCronError(cronTime: string) {
  const logger = new Logger('CronDecorator');

  return function (target: any, propertyName: string, descriptor: PropertyDescriptor) {
    const originalMethod = descriptor.value;

    descriptor.value = async function (...args: any[]) {
      try {
        // add random delay to avoid all cron job run at the same time
        await randomDelay();
        await originalMethod.apply(this, args);
      } catch (error) {
        logger.error(`Error in cron job "${propertyName}": ${error}`);
        throw error;
      }
    };

    return Cron(cronTime)(target, propertyName, descriptor);
  };
}

class TimeoutMap<K> {
  private map: Map<K, { value: number; createdAt: number }[]>;

  constructor(private timeout: number) {
    this.map = new Map<K, { value: number; createdAt: number }[]>();
  }

  add(key: K, value: number) {
    if (!this.map.has(key)) {
      this.map.set(key, []);
    }

    const list = this.map.get(key)!;
    list.push({ value, createdAt: Date.now() });
    this.map.set(key, list);
  }

  get(key: K): number[] | undefined {
    const list = this.map.get(key);
    if (!list) return undefined;

    // Filter out expired elements
    const now = Date.now();
    const filteredList = list.filter(item => now - item.createdAt < this.timeout);

    if (filteredList.length === 0) {
      this.map.delete(key); // Clean up if the list is empty
      return undefined;
    }

    this.map.set(key, filteredList); // Update the map with non-expired elements
    return filteredList.map(item => item.value);
  }

  delete(key: K) {
    this.map.delete(key);
  }

  has(key: K): boolean {
    const list = this.get(key); // Automatically cleans up expired elements
    return list !== undefined && list.length > 0;
  }

  clear() {
    this.map.clear();
  }
}

@Injectable()
export class WatcherService {
  private readonly logger = new Logger(`${WatcherService.name}_${workerUuid}`);
  // task title as key, failed times in 24h
  private taskCounter: TimeoutMap<string> = new TimeoutMap(1000* 60* 60 * 24);
  private sharedService = SHARED_SERVICE;

  constructor(
    private readonly mongodbLockService: MongodbLockService,
    private readonly tasksService: TasksService,
    private eventEmitter: EventEmitter2,
    @Inject('IRuntimeCreator') private readonly runtimeCreator: IRuntimeCreator
  ) { }

  get tasks(): Map<string, Task> {
    return this.sharedService.tasks;
  }

  // update local task status return task and runtime
  private updateLocalTask(taskTitle: string) {
    const prefix = 'updateLocalTask';

    const task = this.tasks.get(taskTitle);
    if (!task) {
      this.logger.warn(`${prefix} ${taskTitle} not found`);
      return;
    }

    const runtime = this.sharedService.taskRuntime.get(task.title);
    if (!runtime) {
      this.logger.warn(`${prefix} ${task.title} runtime not found`);
      return;
    }

    const status = TwitterClient.getStatus(runtime);
    if (status === TwitterClientStatus.RUNNING) {
      task.status = TaskStatusName.RUNNING;
    } else if (status === TwitterClientStatus.STOPPED) {
      task.status = TaskStatusName.STOPPED;
    } else if (status === TwitterClientStatus.ERROR || status === TwitterClientStatus.STOP_FAILED) {
      task.status = TaskStatusName.STOPPED;
    } else if (status === TwitterClientStatus.STOPPING) {
      task.status = TaskStatusName.RUNNING;
    } else {
      this.logger.error(`${prefix} unknown status ${status}`);
    }

    return { task, runtime, status };
  }

  private clearLocalTask(taskTitle: string) {
    this.tasks.delete(taskTitle);
    // TODO, add function to create a new runtime
    // or else, when the task require retry, can not found the runtime
    // this.taskRuntime.delete(taskTitle);
    this.logger.debug(`local runtime size ${this.sharedService.taskRuntime.size}`);
  }

  /**
   * 
   * @param prefix 
   * @param task 
   * @returns true: continue, false: stop
   */
  private async taskValid(prefix: string, task: Task) {
    this.logger.debug(`${prefix} ${task.title}`);

    const runtime = this.sharedService.taskRuntime.get(task.title);
    if (!runtime) {
      this.logger.error(`${prefix} ${task.title} runtime not found`);
      return false;
    }

    if (isRunningByAnotherWorker(task)) {
      this.logger.warn(`${prefix} ${task.title} is processed by other worker`);
      return false;
    }

    if (!await this.mongodbLockService.isLocked(task.title)) {
      this.logger.warn(`${prefix} ${task.title} lock not acquired`);
      return false;
    }

    return true;
  }

  async stopTask(task: Task): Promise<undefined> {
    if (!await this.taskValid('stopTask', task)) return;

    TaskEvent.createTaskStopEvent(
      this.eventEmitter,
      task,
      this.sharedService.taskRuntime.get(task.title)!,
    );
  }

  private async restartTask(
    task: Task,
    options: { overwriteTask: boolean } = { overwriteTask: true }
  ) {
    if (!await this.taskValid('restartTask', task)) return;

    if (options.overwriteTask) {
      this.tasks.set(task.title, task);
    }

    TaskEvent.createTaskRestartEvent(
      this.eventEmitter,
      task,
      this.sharedService.taskRuntime.get(task.title)!,
    );
  }

  async updateTask(
    task: Task,
    options: { overwriteTask: boolean } = { overwriteTask: true }
  ): Promise<undefined> {
    if (!await this.taskValid('updateTask', task)) return;

    if (options.overwriteTask) {
      this.tasks.set(task.title, task);
    }

    TaskEvent.createTaskUpdatedEvent(
      this.eventEmitter,
      task,
      this.sharedService.taskRuntime.get(task.title)!,
    );
  }

  private async startTask(task: Task) {
    if (!await this.taskValid('startTask', task)) return;

    TaskEvent.createTaskStartEvent(
      this.eventEmitter,
      task,
      this.sharedService.taskRuntime.get(task.title)!,
    );
  }

  async createTask(task: Task): Promise<undefined> {
    if (!await this.taskValid('createTask', task)) return;

    this.tasks.set(task.title, task);

    TaskEvent.createTaskCreatedEvent(
      this.eventEmitter,
      task,
      this.sharedService.taskRuntime.get(task.title)!,
    );
  }

  @CatchCronError(CronExpression.EVERY_MINUTE)
  async getNewTasks() {
    const prefix = 'getNewTasks';
    this.logger.debug(`${prefix} start`);

    const tasks = await this.tasksService.getTasksReqiureStart();
    for (const task of tasks) {
      if (this.tasks.has(task.title)) {
        this.logger.warn(`${prefix} ${task.title} already in local tasks`);
        continue;
      }

      if (!this.sharedService.taskRuntime.has(task.title)) {
        this.logger.error(`${prefix} ${task.title} runtime not found`);
        continue;
      }

      if (!isRunningByAnotherWorker(task)) {
        if (!await this.mongodbLockService.isLocked(task.title)) {
          // TODO create runtime instead of using the existing one
          const runtime = this.sharedService.taskRuntime.get(task.title)!;
          if (runtime.character?.settings?.secrets) {
            for (const key of Object.keys(task.configuration)) {
              if (task.configuration[key] === undefined) {
                delete runtime.character.settings.secrets[key];
              } else {
                runtime.character.settings.secrets[key] = task.configuration[key];
              }
            }
          }

          await this.createTask(task);
        }
      } else {
        this.logger.warn(`${prefix} ${task.title} ${task.updatedAt} is processed by other worker`);
      }
    }

    this.logger.debug(`${prefix} end ${tasks.length}`);
  }

  @CatchCronError(EVERY_2_MINUTE)
  async checkTaskActionOrConfigurationChanged() {
    const prefix = 'checkTaskActionOrConfigurationChanged';
    this.logger.debug(`${prefix} start`);
    const taskTitles = new Set(this.tasks.keys());

    const tasks = await this.tasksService.getTaskByTitles(Array.from(taskTitles));
    for (const task of tasks) {
      taskTitles.delete(task.title);
      const localTask = this.updateLocalTask(task.title);
      if (!localTask) {
        this.logger.error(`${prefix} localTask ${task.title} not found`);
        continue;
      }

      const signals: {
        actionChanged: boolean;
        ownerChanged: boolean;
        configurationChanged: boolean;
        taskPaused: boolean;
      } = {
        ownerChanged: (localTask.task.createdBy !== task.createdBy && localTask.task.createdBy === workerUuid),
        actionChanged: task.action !== this.tasks.get(task.title)!.action,
        configurationChanged: !_.isEqual(task.configuration, this.tasks.get(task.title)!.configuration),
        taskPaused: isTaskPaused(task) || false,
      };
      this.logger.debug(`${prefix} ${task.title} signals: ${JSON.stringify(signals)}`);

      if (
        // if owner changed
        signals.ownerChanged ||
        // if action change to stop
        (signals.actionChanged && task.action === TaskActionName.STOP) || 
        // if configuration changed and twitter configuration not exists
        (signals.configurationChanged && !task.configuration.TWITTER_USERNAME) ||
        // if task paused
        signals.taskPaused
      ) {
        localTask.task.action = TaskActionName.STOP;
        await this.stopTask(localTask.task);
      } else if (
        // if action change to restart
        (signals.actionChanged && task.action === TaskActionName.RESTART) ||
        // if configuration changed and twitter configuration exists
        (signals.configurationChanged && task.configuration.TWITTER_USERNAME)
      ) {
        await this.restartTask(task);
      } else if (
        // running expected
        (task.action === TaskActionName.START || task.action === TaskActionName.RESTART) && 
        task.status === TaskStatusName.RUNNING
      ) {
        // update task update time
        await this.tasksService.taskRunning(task.nftId);
      } else {
        this.logger.warn(`${prefix} ${task.title} unhandled signals: ${JSON.stringify(signals)}`);
      }
    }

    // if task not in db, stop and clear the local task
    for (const taskTitle of taskTitles) {
      const localTask = this.updateLocalTask(taskTitle);
      if (!localTask) {
        this.logger.error(`${prefix} localTask ${taskTitle} not found`);
        continue;
      }

      this.logger.warn(`${prefix} task ${taskTitle} is not in db`);
      if (localTask.task.status === TaskStatusName.RUNNING) {
        // stop the task
        localTask.task.action = TaskActionName.STOP;
        await this.stopTask(localTask.task);
      } else {
        // clear the task
        this.clearLocalTask(localTask.task.title);
      }
    }

    this.logger.debug(`${prefix} end, ${this.tasks.size}`);
  }

  @CatchCronError(CheckLocalTasksStatusCronTime)
  async checkLocalTasksStatus() {
    const prefix = 'checkLocalTasksStatus';
    this.logger.debug(`${prefix} start`);

    for (const task of this.tasks) {
      const localTask = this.updateLocalTask(task[0]);
      if (!localTask) {
        this.logger.error(`${prefix} localTask ${task[0]} not found`);
        continue;
      }

      if (localTask.task.runningSignal.startFailedForMultipleTimes) {
        this.logger.debug(`${prefix} ${localTask.task.title} ignored the task who start failed for multiple times`);
        await this.tasksService.taskStartFailedForMultiTimes(localTask.task.nftId);
        localTask.task.action = TaskActionName.STOP;
      }

      if (
        localTask.status === TwitterClientStatus.STOP_FAILED || 
        (localTask.task.action === TaskActionName.STOP && localTask.task.status !== TaskStatusName.STOPPED)
      ) {
        await this.stopTask(localTask.task);
      } else if (
        localTask.task.action === TaskActionName.START && localTask.task.status !== TaskStatusName.RUNNING
      ) {
        // if task running failed for multi times, block restart until user update the task
        const _continue = await this.onLocalTaskStartFailed(localTask.task);
        if (_continue) await this.startTask(localTask.task);
      } else if (
        localTask.task.action === TaskActionName.RESTART && localTask.task.status !== TaskStatusName.RESTARTED
      ) {
        await this.restartTask(localTask.task, { overwriteTask: false });
      } else if (
        localTask.task.action === TaskActionName.STOP && localTask.task.status === TaskStatusName.STOPPED
      ) {
        this.clearLocalTask(localTask.task.title);
      } else {
        this.logger.debug(`${prefix} ${localTask.task.title} status is expected`);
      }
    }

    this.logger.debug(`${prefix} end ${this.tasks.size}`);
  }

  private async onLocalTaskStartFailed(task: Task) {
    const prefix = 'onLocalTaskStartFailed';
    this.logger.debug(`${prefix} ${task.title}`);

    this.taskCounter.add(task.title, 1);

    const count = this.taskCounter.get(task.title);
    // if failed for more than 25% of the time in one day, stop the task
    if (count && _.sum(count) > CheckLocalTasksStatusTimesOneDay / 4) {
      this.logger.warn(`${prefix} ${task.title} start failed for ${count} times, stop the task`);
      task.runningSignal.startFailedForMultipleTimes = true;
      return false;
    }
    if (count && count.length % 100 === 0) {
      this.logger.log(`${prefix} ${task.title} start failed for ${count} times`);
    }

    return true;
  }
}
