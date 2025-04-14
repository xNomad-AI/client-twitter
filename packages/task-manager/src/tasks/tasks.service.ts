import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';

import { isTaskPaused, Task, TaskActionName, TaskStatusName } from './schemas/task.schema.js';
import { startFailedForMultipleTimesRetryInterval, suspendedAccountRetryInterval, taskTimeout, workerUuid } from '../constant.js';
import { TasksBaseService } from './tasks-base.service.js';
import { TaskSettingsService } from './task-settings.service.js';

@Injectable()
export class TasksService {
  private logger = new Logger(TasksService.name);
  constructor(
    private readonly tasksBaseService: TasksBaseService,
    private readonly taskSettingsService: TaskSettingsService,
    @InjectModel(Task.name) private readonly taskModel: Model<Task>
  ) { }

  async reportError(nftId: string, lastError: Task['lastError']) {
    return await this.tasksBaseService.updateByNftId(nftId, {
      updatedAt: new Date(),
      lastError,
    });
  }

  async suspendedTask(nftId: string) {
    const suspendedAccountNextRetry = new Date(Date.now() + suspendedAccountRetryInterval);
    const task = await this.tasksBaseService.getTaskByNftId(nftId);
    if (!task) return null;

    return await this.tasksBaseService.updateByNftId(nftId, {
      updatedAt: new Date(),
      pauseUntil: suspendedAccountNextRetry,
      runningSignal: { ...task.runningSignal, accountSuspended: true }
    });
  }

  async taskStartFailedForMultiTimes(nftId: string) {
    const failedTaskNextRetry = new Date(Date.now() + startFailedForMultipleTimesRetryInterval);
    const task = await this.tasksBaseService.getTaskByNftId(nftId);
    if (!task) return null;

    return await this.tasksBaseService.updateByNftId(nftId, {
      updatedAt: new Date(),
      pauseUntil: failedTaskNextRetry,
      runningSignal: { ...task.runningSignal, startFailedForMultipleTimes: true }
    });
  }

  async stopTask(nftId: string): Promise<Task | null> {
    const resp = await this.tasksBaseService.updateByNftId(nftId, {
      updatedAt: new Date(),
      action: TaskActionName.STOP,
    });

    if (!resp) {
      this.logger.warn(`Task with nftId ${nftId} not found`);
      return null;
    }

    return resp;
  }

  async getTaskByTwitterUserNameAndAgentId(
    twitterUserName: string,
    agentId: string
  ): Promise<Required<Task> | null> {
    return this.taskModel.findOne({
      agentId,
      'configuration.TWITTER_USERNAME': twitterUserName,
    });
  }

  async getTaskByTwitterUserName(twitterUserName: string): Promise<Required<Task[]>> {
    return this.taskModel.find({ 'configuration.TWITTER_USERNAME': twitterUserName });
  }

  async getTaskByTitle(title: string): Promise<Task | null> {
    const resp = await this.taskModel.findOne({ title });

    if (!resp) {
      this.logger.warn(`Task with title ${title} not found`);
      return null;
    }

    return resp;
  }

  async getTaskByAgentId(agentId: string): Promise<Task | null> {
    const resp = this.taskModel.findOne({ agentId });

    if (!resp) {
      this.logger.warn(`Task with agentId ${agentId} not found`);
      return null;
    }

    return resp;
  }

  async createTask(createTask: Task): Promise<Task> {
    // add http proxy to new task
    if (!createTask.configuration.TWITTER_HTTP_PROXY) {
      const proxy = await this.taskSettingsService.randomGetHttpProxy();
      createTask.configuration.TWITTER_HTTP_PROXY = proxy;
    }

    const createdTask = new this.taskModel(createTask);
    return createdTask.save();
  }

  async updateTask(nftId: string, updateTask: Partial<Task>) {
    const dbTask = await this.tasksBaseService.getTaskByNftId(nftId);
    if (!dbTask) {
      this.logger.warn(`Task with nftId ${nftId} not found`);
      return null;
    }

    // assign a new proxy if not exists
    if (!dbTask.configuration.TWITTER_HTTP_PROXY) {
      const proxy = await this.taskSettingsService.randomGetHttpProxy();
      dbTask.configuration.TWITTER_HTTP_PROXY = proxy;
    }

    // using the old http proxy
    if (updateTask.configuration && dbTask.configuration.TWITTER_HTTP_PROXY) {
      updateTask.configuration.TWITTER_HTTP_PROXY = dbTask.configuration.TWITTER_HTTP_PROXY;
    }

    const task: Partial<Task> = {
      ...updateTask,
      // when user trigger a update task, we should reset the pauseUntil time
      pauseUntil: new Date(),
      // full update the configuration
      configuration: updateTask.configuration ? updateTask.configuration : {}
    };
    return await this.tasksBaseService.updateByNftId(dbTask.nftId, task);
  }

  // when task started, we should update the task status
  async taskStarted(nftId: string, eventCreatedAt: Date): Promise<Task | null> {
    const resp = await this.tasksBaseService.updateByNftId(nftId, {
      updatedAt: new Date(),
      createdBy: workerUuid,
      status: TaskStatusName.RUNNING,
      lastEventCreateAt: eventCreatedAt,
    });

    if (!resp) {
      this.logger.warn(`Task with nftId ${nftId} not found`);
      return null;
    }

    return resp;
  }

  async taskStopped(nftId: string, eventCreatedAt: Date): Promise<Task | null> {
    const resp = await this.tasksBaseService.updateByNftId(nftId, {
      updatedAt: new Date(),
      createdBy: workerUuid,
      status: TaskStatusName.STOPPED,
      lastEventCreateAt: eventCreatedAt,
    });

    if (!resp) {
      this.logger.warn(`Task with nftId ${nftId} not found`);
      return null;
    }

    return resp;
  }

  async taskRunning(nftId: string): Promise<Task | null> {
    const resp = await this.tasksBaseService.updateByNftId(nftId, {
      updatedAt: new Date(),
      createdBy: workerUuid,
      status: TaskStatusName.RUNNING,
      eventUpdatedAt: new Date(),
    });

    if (!resp) {
      this.logger.warn(`Task with nftId ${nftId} not found`);
      return null;
    }

    return resp;
  }

  async getTaskByTitles(titles: string[]): Promise<Task[]> {
    const tasks = await this.taskModel.find({ title: { $in: titles } });
    return tasks;
  }

  // private async update(id: string, updateTask: Partial<Task>): Promise<Task | null> {
  //   const task = await this.getTask(id);
  //   // only same user can auto add update time
  //   if (task && task.createdBy === updateTask.createdBy) {
  //     updateTask.updatedAt = new Date();
      
  //   } else {
  //     return this.taskModel.findByIdAndUpdate(id, updateTask, { new: true });
  //   }
  // }

  // private async updateByTitle(title: string, updateTask: Partial<Task>): Promise<Task | null> {
  //   updateTask.updatedAt = new Date();
  //   return this.taskModel.findOneAndUpdate({ title }, updateTask, { new: true });
  // }

  // async updateByNftId(nftId: string, updateTask: Partial<Task>): Promise<Task | null> {
  //   updateTask.updatedAt = new Date();
  //   return this.taskModel.findOneAndUpdate({ nftId }, updateTask, { new: true });
  // }

  // async updateTaskRunningSignalByTitle(title: string, signal: keyof Task['runningSignal'], value: boolean) {
  //   return this.taskModel.updateOne({ title }, {
  //     $set: {
  //       [`runningSignal.${signal}`]: value,
  //       updatedAt: new Date(),
  //     }
  //   });
  // }

  // async getTask(id: string): Promise<Task | null> {
  //   return this.taskModel.findById(id).exec();
  // }

  // async getTasksGroupbyHttpProxy(): Promise<Map<string, Task[]>> {
  //   const tasks = await this.taskModel.find();
  //   const map = new Map<string, Task[]>();
  //   tasks.forEach(task => {
  //     const proxy = task.configuration.TWITTER_HTTP_PROXY;
  //     if (!proxy) {
  //       return;
  //     }

  //     if (!map.has(proxy)) {
  //       map.set(proxy, []);
  //     }
  //     map.get(proxy)?.push(task);
  //   });
  //   return map;
  // }

  // // required by another service
  // async getTaskByNftId(nftId: string): Promise<Required<Task> | null> {
  //   return this.taskModel.findOne({ nftId });
  // }

  // async startTask(id: string): Promise<Task | null> {
  //   return this.update(id, { action: TaskActionName.START });
  // }

  // // required by another service
  // async stopTaskByNftId(nftId: string): Promise<Task | null> {
  //   const task = await this.getTaskByNftId(nftId);
  //   if (!task) {
  //     this.logger.warn(`Task with nftId ${nftId} not found`);
  //     return null;
  //   }

  //   // if the task is already stopped, return it so that to prevent update
  //   if (task.action === TaskActionName.STOP) {
  //     return task;
  //   }

  //   return this.updateByNftId(nftId, { action: TaskActionName.STOP });
  // }

  // async startTaskByNftId(nftId: string): Promise<Task | null> {
  //   const task = await this.getTaskByNftId(nftId);
  //   if (!task) {
  //     this.logger.warn(`Task with nftId ${nftId} not found`);
  //     return null;
  //   }

  //   // if the task is already started, return it so that to prevent update
  //   if (task.action === TaskActionName.START) {
  //     return task;
  //   }

  //   return this.updateByNftId(nftId, { action: TaskActionName.START });
  // }

  // async restartTask(id: string): Promise<Task | null> {
  //   return this.update(id, { action: 'restart' });
  // }

  // async pauseTask(title: string, pauseUntil: Date): Promise<Task | null> {
  //   return this.updateByTitle(title, { status: TaskStatusName.STOPPED, pauseUntil });
  // }

  async getTasksReqiureStart(): Promise<Task[]> {
    const query = {
      $or: [
        // user want to start the task, but the task is stopped
        {
          status: TaskStatusName.STOPPED,
          action: { $in: [TaskActionName.START, TaskActionName.RESTART] },
        },
        // the worker not update the task status for a long time
        {
          status: TaskStatusName.RUNNING,
          action: { $in: [TaskActionName.START, TaskActionName.RESTART] },
          updatedAt: { $lt: new Date(Date.now() - taskTimeout) },
        },
        // user want to stop the task, but the task is still running
        {
          status: TaskStatusName.RUNNING,
          action: TaskActionName.STOP,
          createdBy: workerUuid,
        },
      ]
    };

    let tasks = await this.taskModel.find(query);
    tasks = tasks.filter(task => {
      // remove the task that require pause
      if (isTaskPaused(task)) {
        return false;
      }

      return true;
    });

    return tasks;
  }
}
