import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';

import { Task } from './schemas/task.schema.js';

@Injectable()
export class TasksBaseService {
  private logger = new Logger(TasksBaseService.name);
  constructor(
    @InjectModel(Task.name) private readonly taskModel: Model<Task>
  ) { }

  async updateByNftId(nftId: string, updateTask: Partial<Task>): Promise<Task | null> {
    return this.taskModel.findOneAndUpdate({ nftId }, updateTask, { new: true });
  }

  async getTaskByNftId(nftId: string): Promise<Required<Task> | null> {
    return this.taskModel.findOne({ nftId });
  }

  async getTasksGroupbyHttpProxy(): Promise<Map<string, Task[]>> {
    const tasks = await this.taskModel.find();

    const map = new Map<string, Task[]>();
    tasks.forEach(task => {
      const proxy = task.configuration.TWITTER_HTTP_PROXY;
      if (!proxy) {
        return;
      }

      if (!map.has(proxy)) {
        map.set(proxy, []);
      }
      map.get(proxy)?.push(task);
    });

    return map;
  }
}
