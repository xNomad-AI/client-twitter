import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2, OnEvent } from '@nestjs/event-emitter';
import { TwitterClient } from '@elizaos/client-twitter';

import { TasksService } from '../tasks/tasks.service.js';
import { workerUuid } from '../constant.js';
import { TaskEvent, TaskEventName } from '../tasks/interfaces/task.interface.js';
import { isTaskPaused, isRunningByAnotherWorker, TaskStatusName } from '../tasks/schemas/task.schema.js';
import { MongodbLockService } from './lock.service.js';

@Injectable()
export class ClientTwitterService {
  private readonly logger = new Logger(`${ClientTwitterService.name}_${workerUuid}`);

  constructor(
    private readonly tasksService: TasksService,
    private readonly mongodbLockService: MongodbLockService,
    private eventEmitter: EventEmitter2
  ) { }

  @OnEvent(TaskEventName.TASK_CREATED)
  async onTaskCreated(payload: TaskEvent) {
    return this.taskStart(payload);
  }

  @OnEvent(TaskEventName.TASK_START)
  async onTaskStart(payload: TaskEvent) {
    return this.taskStart(payload);
  }

  @OnEvent(TaskEventName.TASK_RESTART)
  async onTaskRestart(payload: TaskEvent) {
    return this.taskRestart(payload);
  }

  @OnEvent(TaskEventName.TASK_UPDATED)
  async onTaskUpdate(payload: TaskEvent) {
    return this.taskRestart(payload);
  }

  @OnEvent(TaskEventName.TASK_STOP)
  async onTaskStop(payload: TaskEvent) {
    const prefix = 'onTaskStop';
    this.logger.log(`${prefix} ${payload.task.title}`);

    try {
      if (await this.mongodbLockService.acquireLock(payload.task.title)) {
        try {
          if (await this.checkEventOutdated(payload)) {
            return;
          }

          await TwitterClient.stop(payload.runtime);
          await this.tasksService.taskStopped(payload.task.nftId, payload.eventCreatedAt);
        } finally {
          await this.mongodbLockService.releaseLock(payload.task.title);
        }
      } else {
        this.logger.warn(`${prefix} ${payload.task.title} lock not acquired`);
      }
    } catch (error: any) {
      this.logger.error(`${prefix} ${payload.task.title} error: ${error.message}`);
    }
  }

  // can not combine multi event
  private async taskStart(payload: TaskEvent) {
    const prefix = 'taskStart';
    this.logger.log(`${prefix} ${payload.task.title}`);

    try {
      if (await this.mongodbLockService.acquireLock(payload.task.title)) {
        try {
          if (await this.checkEventOutdated(payload)) {
            return;
          }

          // check if the task is already running
          const latestTask = await this.tasksService.getTaskByTitle(payload.task.title);
          if (!latestTask) {
            this.logger.error(`${prefix} ${payload.task.title} error: task not found in db`);
            return;
          }

          if (isTaskPaused(latestTask)) {
            this.logger.warn(`${prefix} ${payload.task.title} task is paused`);
            return
          }

          if (isRunningByAnotherWorker(latestTask)) {
            this.logger.warn(`${prefix} ${payload.task.title} task is already running by another worker`);
            return;
          }

          // update the http proxy
          if (payload?.runtime?.character?.settings?.secrets) {
            payload.runtime.character.settings.secrets.TWITTER_HTTP_PROXY = payload.task.configuration.TWITTER_HTTP_PROXY!;
          }

          if (!payload?.runtime?.character?.settings?.secrets?.TWITTER_USERNAME) {
            this.logger.warn(`${prefix} ${payload.task.title} TWITTER_USERNAME not found in runtime`);
            return;
          }

          await TwitterClient.start(payload.runtime);
          await this.tasksService.taskStarted(payload.task.nftId, payload.eventCreatedAt);
        } finally {
          await this.mongodbLockService.releaseLock(payload.task.title);
        }
      } else {
        this.logger.warn(`${prefix} ${payload.task.title} lock not acquired`);
      }
    } catch (error: any) {
      this.logger.error(`${prefix} ${payload.task.title} msg: ${error.message}`);
    }
  }

  private async taskRestart(payload: TaskEvent) {
    const prefix = 'taskRestart';
    this.logger.log(`${prefix} ${payload.task.title}`);

    try {
      // do not update the db status, so do not invoke this.onTaskStop
      await TwitterClient.stop(payload.runtime);
      // if twitter configuration not exists, stop only
      if (payload.task.configuration.TWITTER_USERNAME) {
        await this.taskStart(payload);
      }
    } catch (error: any) {
      this.logger.error(`${prefix} ${payload.task.title} error: ${error.message}`);
    }
  }

  /**
   * when there are multiple events, the latest one should be used
   * @param payload event
   * @returns true: outdated, false: not outdated
   */
  private async checkEventOutdated(payload: TaskEvent) {
    return false;
  //   const prefix = 'checkEventOutdated';
  //   this.logger.debug(`${prefix} ${payload.task.title}`);

  //   // check if the event is outdated
  //   const latestTask = await this.tasksService.getTaskByTitle(payload.task.title);
  //   if (!latestTask) {
  //     return false;
  //   }

  //   if (latestTask.taskStatusChangedAt && latestTask.taskStatusChangedAt > payload.eventCreatedAt) {
  //     this.logger.debug(JSON.stringify(latestTask));
  //     this.logger.warn(`${prefix} ${payload.task.title} event ${payload.eventCreatedAt.toISOString()} is outdated`);
  //     return true;
  //   }
  //   return false;
  }
}
