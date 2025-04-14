import { TwitterConfig } from '@elizaos/client-twitter';
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';

import { taskMongodbCollectionName, taskTimeout, workerUuid } from '../../constant.js';

// completed mean the task is finished by it self
export enum TaskStatusName {
  RESTARTED = 'restarted',
  RUNNING = 'running',
  COMPLETED = 'completed',
  STOPPED = 'stopped',
}
export type TaskStatus = 'restarted' | 'running' | 'completed' | 'stopped';

export enum TaskActionName {
  RESTART = 'restart',
  STOP = 'stop',
  START = 'start',
}
export type TaskAction = 'restart' | 'stop' | 'start';

export enum TaskTagName {
  SUSPENDED = 'suspended',
}
export type TaskTags = 'suspended';

export function isTaskPaused(task: Task) {
  return task.pauseUntil && task.pauseUntil > new Date();
}

export function isRunningByAnotherWorker(task: Task) {
  return task.status === TaskStatusName.RUNNING &&
    task.createdBy !== workerUuid &&
    (task.updatedAt.getTime() + taskTimeout) > Date.now();
}

export function autoFixTwitterUsername(twitterUsername: string) {
  // remove @ from the username
  if (twitterUsername.startsWith('@')) {
    twitterUsername = twitterUsername.slice(1);
  }
  return twitterUsername;
}

export function getTaskTitle(twitterUsername: string, nftId: string) {
  twitterUsername = autoFixTwitterUsername(twitterUsername);
  return `${twitterUsername}-${nftId}`;
}

export function fillDefaultToPartialTask(task: Partial<Task> = {}): Task {
  const defaultTask: Task = {
    title: task.title!,
    agentId: task.agentId!,
    nftId: task.nftId!,
    action: task.action!,
    description: task.description || '',
    configuration: task.configuration || {},
    status: task.status || TaskStatusName.STOPPED,
    createdAt: task.createdAt || new Date(),
    updatedAt: task.updatedAt || new Date(),
    eventUpdatedAt: task.eventUpdatedAt || new Date(),
    lastEventCreateAt: task.lastEventCreateAt || new Date(),
    createdBy: task.createdBy || workerUuid,
    tags: task.tags || [],
    runningSignal: task.runningSignal || {
      startFailedForMultipleTimes: false,
      accountSuspended: false,
    }
  };

  return defaultTask;
}

@Schema({ collection: taskMongodbCollectionName })
export class Task {
  id?: string;

  @Prop({ type: String, required: true })
  title: string;

  @Prop({ type: String, required: true })
  agentId: string;

  @Prop({ type: String, required: true })
  nftId: string;

  @Prop({ type: String, enum: TaskActionName, required: true })
  // what the user want the task to be
  action: TaskAction;

  @Prop({ type: String })
  description: string;

  @Prop({ type: String, enum: TaskStatusName })
  // what the actual status of the task, only changed by the cron
  status: TaskStatus;

  @Prop({
    type: Object,
    required: true,
    // generate mongodb schema of TwitterConfig
    properties: {
      TWITTER_DRY_RUN: { type: Boolean },
      TWITTER_USERNAME: { type: String, required: true },
      TWITTER_PASSWORD: { type: String, required: true },
      TWITTER_EMAIL: { type: String, required: true },
      MAX_TWEET_LENGTH: { type: Number },
      TWITTER_SEARCH_ENABLE: { type: Boolean },
      TWITTER_2FA_SECRET: { type: String, required: true },
      TWITTER_RETRY_LIMIT: { type: Number },
      TWITTER_POLL_INTERVAL: { type: Number },
      TWITTER_TARGET_USERS: { type: [String] },
      ENABLE_TWITTER_POST_GENERATION: { type: Boolean },
      POST_INTERVAL_MIN: { type: Number },
      POST_INTERVAL_MAX: { type: Number },
      ENABLE_ACTION_PROCESSING: { type: Boolean },
      ACTION_INTERVAL: { type: Number },
      POST_IMMEDIATELY: { type: Boolean },
      TWITTER_SPACES_ENABLE: { type: Boolean },
      MAX_ACTIONS_PROCESSING: { type: Number },
      ACTION_TIMELINE_TYPE: { type: String },
      TWITTER_HTTP_PROXY: { type: String },
      TWITTER_COOKIES_AUTH_TOKEN: { type: String },
      TWITTER_COOKIES_CT0: { type: String },
      TWITTER_COOKIES_GUEST_ID: { type: String },
    },
  })
  configuration: TwitterConfig & Record<string, any>;

  @Prop({
    type: Object,
    required: false,
    properties: {
      message: { type: String, required: true },
      updatedAt: { type: Date, required: true }
    },
  })
  // last error of the task
  lastError?: {
    message: string;
    updatedAt: Date;
  };

  @Prop({ type: Date })
  // the Task.status changed at which time
  lastEventCreateAt: Date;

  @Prop({ type: Date })
  // the task should update this interval
  eventUpdatedAt: Date;

  @Prop({ type: Date })
  // if the program thought the task should be paused, it will set this field to the time when the task should be resumed
  pauseUntil?: Date;

  @Prop({
    type: Object,
    required: true,
    properties: {
      startFailedForMultipleTimes: { type: Boolean, required: true },
      accountSuspended: { type: Boolean, required: true },
    },
  })
  // this field add the reason why the task is paused
  runningSignal: {
    startFailedForMultipleTimes: boolean;
    accountSuspended: boolean;
  }

  @Prop({ type: [String], enum: TaskTagName })
  // tags of the task
  tags: TaskTags[];

  @Prop({ type: Date })
  // the task created at which time
  createdAt: Date;

  @Prop({ type: String })
  // the task created by which worker
  createdBy: string;

  @Prop({ type: Date })
  // the task updated at which time
  updatedAt: Date;
}

export const TaskSchema = SchemaFactory.createForClass(Task);

TaskSchema.index({ title: 1 }, { unique: true });
TaskSchema.index({ agentId: 1 }, { unique: true });
TaskSchema.index({ nftId: 1 }, { unique: true });
TaskSchema.index({ status: 1, action: 1, updatedAt: 1 });
TaskSchema.index({ createdBy: 1, status: 1 });
