import { Controller, Post, Put, Param, Body, BadRequestException, Logger, UseGuards, Get } from '@nestjs/common';
import { ApiCreatedResponse, ApiHeader } from '@nestjs/swagger';
import { TwitterClient } from '@elizaos/client-twitter';

import { TasksService } from './tasks.service.js';
import { CreateTaskDto, ErrorReportDto, TaskResponseDto, UpdateTaskDto } from './dto/task.dto.js';
import { autoFixTwitterUsername, fillDefaultToPartialTask, Task, TaskActionName } from './schemas/task.schema.js';
import { AdminApiKeyGuard } from './tasks.guard.js';
import { WatcherService } from '../watcher/watcher.service.js';
import { workerUuid } from '../constant.js';

interface ErrorCacheConfig {
  maxLength: number;
  timeoutMs: number;
  updateIntervalMs: number; // Minimum interval between DB updates
}

interface ErrorEntry {
  message: string;
  timestamp: number;
}

class ErrorCacheService {
  private cache: Map<string, ErrorEntry[]> = new Map();
  private lastUpdateTime: Map<string, number> = new Map();
  private config: ErrorCacheConfig = {
    maxLength: 10,
    timeoutMs: 16 * 1000, // 16 sec timeout
    updateIntervalMs: 15 * 1000 // 15 seconds between updates
  };

  addError(taskTitle: string, errorMessage: string): boolean {
    if (!this.cache.has(taskTitle)) {
      this.cache.set(taskTitle, []);
    }

    const errors = this.cache.get(taskTitle)!;
    const now = Date.now();
    const lastUpdate = this.lastUpdateTime.get(taskTitle) || 0;

    // Clean up old errors but keep errors within the time window
    const recentErrors = errors.filter(
      error => now - error.timestamp < this.config.timeoutMs
    );

    // Add new error
    recentErrors.push({ message: errorMessage, timestamp: now });
    this.cache.set(taskTitle, recentErrors);

    // Check if we should trigger an update based on:
    // 1. Enough time has passed since last update
    // 2. Have enough errors accumulated
    return (now - lastUpdate >= this.config.updateIntervalMs && recentErrors.length > 0) || 
           recentErrors.length >= this.config.maxLength;
  }

  getAggregatedErrors(taskTitle: string): ErrorEntry | null {
    const errors = this.cache.get(taskTitle);
    if (!errors || errors.length === 0) return null;

    const now = Date.now();
    this.lastUpdateTime.set(taskTitle, now);

    // Get all errors within the time window
    const timeWindowErrors = errors.filter(
      error => now - error.timestamp < this.config.timeoutMs
    );

    if (timeWindowErrors.length === 0) {
      this.cache.delete(taskTitle);
      return null;
    }

    // Aggregate errors into a single message
    // Limit to the last 10 errors for aggregation
    const aggregatedMessage = timeWindowErrors.slice(timeWindowErrors.length - 10)
      .map(error => `[${new Date(error.timestamp).toISOString()}] ${error.message}`)
      .join('\n');

    // Clear cache after aggregating
    this.cache.delete(taskTitle);

    return {
      message: aggregatedMessage,
      timestamp: now
    };
  }
}

@ApiHeader({
  name: 'X-ADMIN-API-KEY',
  description: 'API Key needed to access this route',
  required: true,
})
@Controller('client-twitter/tasks')
@UseGuards(AdminApiKeyGuard)
export class TasksController {
  private readonly logger = new Logger(`${TasksController.name}_${workerUuid}`);
  private errorCacheService = new ErrorCacheService();

  constructor(
    private readonly tasksService: TasksService,
    private readonly watcherService: WatcherService,
  ) { }

  // should full update configuration of client-twitter
  async updateTask(
    nftId: string,
    updateTaskDto: UpdateTaskDto
  ) {
    const updatedTask = await this.tasksService.updateTask(nftId, updateTaskDto);
    if (!updatedTask) {
      throw new BadRequestException('the task not exists');
    }

    if (updatedTask.createdBy === workerUuid) {
      const res = await this.watcherService.updateTask(updatedTask);
      if (!res) {
        throw new BadRequestException(`${updatedTask.title} create update task failed`);
      }
    }

    return updatedTask;
  }

  @Post()
  @ApiCreatedResponse({
    type: TaskResponseDto,
    description: 'will full nested object for example configuration, so you should be careful when using this',
  })
  async createOrUpdateTask(
    @Body() createTaskDto: CreateTaskDto
  ) {
    // fix twitter username
    if (createTaskDto.configuration?.TWITTER_USERNAME) {
      createTaskDto.configuration.TWITTER_USERNAME = autoFixTwitterUsername(
        createTaskDto.configuration.TWITTER_USERNAME
      );
    }
    const task: Task = fillDefaultToPartialTask(createTaskDto);

    const dbTask = await this.tasksService.getTaskByTitle(task.title);
    if (dbTask) {
      // if task already exists, update it
      this.logger.warn(`task ${task.title} already exists, update it`);
      return await this.updateTask(dbTask.nftId, createTaskDto);
    }

    const createdTask = await this.tasksService.createTask(task);
    // trigger a create task event
    const res = await this.watcherService.createTask(createdTask);
    if (!res) {
      throw new BadRequestException(`${createdTask.title} create new task event failed`);
    }

    return createdTask;
  }

  @Post(':title/stop')
  @ApiCreatedResponse({
    type: TaskResponseDto,
  })
  async stopTask(
    @Param('title') title: string
  ) {
    const task = await this.tasksService.getTaskByTitle(title);
    if (!task) {
      throw new BadRequestException('the task not exists');
    }

    if (task.action === TaskActionName.STOP) {
      this.logger.warn(`task ${task.title} already stopped`);
      // http 400 error
      throw new BadRequestException(`task ${task.title} already stopped`);
    }

    const updatedTask = await this.tasksService.stopTask(task.nftId);
    if (!updatedTask) {
      throw new BadRequestException('the task not exists');
    }

    // create a stop task event
    const res = await this.watcherService.stopTask(updatedTask);
    if (!res) {
      throw new BadRequestException(`${updatedTask.title} create stop task event failed`);
    }

    return updatedTask;
  }

  @Post('/agent/:agentId/stop')
  @ApiCreatedResponse({
    type: TaskResponseDto,
    description: 'stop the client twitter only. if the task action is start, the Cron will start a new one',
  })
  async stopTaskByAgentId(
    @Param('agentId') agentId: string
  ) {
    const task = await this.tasksService.getTaskByAgentId(agentId);
    if (!task) {
      // http 400 error
      this.logger.debug(`task ${agentId} not found`);
      throw new BadRequestException('the task not exists');
    }

    await TwitterClient.stopByAgentId(agentId);
    return { 'message': 'stopping the client' };
  }

  @Get(':title/status')
  @ApiCreatedResponse({
    type: TaskResponseDto,
  })
  async getTask(@Param('title') title: string) {
    const ret = await this.tasksService.getTaskByTitle(title);
    if (!ret) {
      // http 400 error
      this.logger.debug(`task ${title} not found`);
      throw new BadRequestException('the task not exists');
    }

    return ret;
  }

  @Post('/report/:twitterUserName/suspended')
  @ApiCreatedResponse({
    type: TaskResponseDto,
  })
  async suspendedTask(
    @Param('twitterUserName') twitterUserName: string
  ) {
    // TODO using getTaskByTwitterUserNameAndAgentId
    const tasks = await this.tasksService.getTaskByTwitterUserName(twitterUserName);
    if (tasks.length === 0) {
      this.logger.debug(`task ${twitterUserName} not found`);
      throw new BadRequestException('the task not exists');
    }
    
    const ret: Task[] = [];
    for (const task of tasks) {
      const resp = await this.tasksService.suspendedTask(task.nftId);
      if (resp) ret.push(resp);
    }

    return ret;
  }

  @Post('/report/:twitterUserName/error')
  @ApiCreatedResponse({
    type: TaskResponseDto,
    description: 'Returns the task with updated error information',
  })
  async reportError(
    @Param('twitterUserName') twitterUserName: string,
    @Body() body: ErrorReportDto
  ) {
    const task = await this.tasksService.getTaskByTwitterUserNameAndAgentId(twitterUserName, body.agentId);
    if (!task) {
      this.logger.debug(`task ${twitterUserName} not found`);
      throw new BadRequestException('the task not exists');
    }

    // add error to cache to prevent too many errors
    const shouldUpdate = this.errorCacheService.addError(task.title, body.message);
    if (shouldUpdate) {
      const latestError = this.errorCacheService.getAggregatedErrors(task.title);
      if (latestError) {
        const updatedTask = await this.tasksService.reportError(task.nftId, {
          message: latestError.message,
          updatedAt: new Date(latestError.timestamp),
        });

        return updatedTask;
      }
    }

    return task;
  }
}
