import { jest } from '@jest/globals';
import { Test, TestingModule } from '@nestjs/testing';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ScheduleModule } from '@nestjs/schedule';

// // Mock all dependencies that might be imported with .js extension
// jest.mock('../../src/tasks/tasks.service', () => ({
//   TasksService: jest.fn().mockImplementation(() => ({
//     getTasksReqiureStart: jest.fn().mockResolvedValue([]),
//     getTaskByTitles: jest.fn().mockResolvedValue([]),
//     taskRunning: jest.fn().mockResolvedValue(undefined),
//     taskStartFailedForMultiTimes: jest.fn().mockResolvedValue(undefined)
//   }))
// }));

// jest.mock('../../src/tasks/interfaces/task.interface', () => ({
//   TaskEvent: {
//     createTaskStopEvent: jest.fn(),
//     createTaskRestartEvent: jest.fn(),
//     createTaskUpdatedEvent: jest.fn(),
//     createTaskStartEvent: jest.fn(),
//     createTaskCreatedEvent: jest.fn()
//   },
//   TaskEventName: {
//     TASK_CREATED: 'TASK_CREATED',
//     TASK_STARTED: 'TASK_STARTED',
//     TASK_STOPPED: 'TASK_STOPPED',
//     TASK_UPDATED: 'TASK_UPDATED',
//     TASK_RESTARTED: 'TASK_RESTARTED'
//   }
// }));

// // Put mock declarations BEFORE any import that might use them
// jest.mock('@elizaos/client-twitter', () => {
//   // Define mocks inside the factory function
//   return {
//     TwitterClient: {
//       getStatus: jest.fn()
//     },
//     TwitterClientStatus: {
//       RUNNING: 'RUNNING',
//       STOPPED: 'STOPPED',
//       ERROR: 'ERROR',
//       STOP_FAILED: 'STOP_FAILED',
//       STOPPING: 'STOPPING'
//     }
//   };
// }, { virtual: true });

// jest.mock('../../src/shared/shared.service', () => ({
//   SHARED_SERVICE: {
//     tasks: new Map(),
//     taskRuntime: new Map()
//   }
// }));

// jest.mock('../../src/tasks/schemas/task.schema', () => ({
//   TaskStatusName: {
//     STOPPED: 'STOPPED',
//     RUNNING: 'RUNNING',
//     ERROR: 'ERROR'
//   },
//   TaskActionName: {
//     START: 'START',
//     STOP: 'STOP',
//     DELETE: 'DELETE'
//   },
//   isRunningByAnotherWorker: jest.fn().mockReturnValue(false),
//   isTaskPaused: jest.fn().mockReturnValue(false)
// }));

// jest.mock('../../src/constant', () => ({
//   taskTimeout: 30000,
//   workerUuid: 'test-worker-uuid'
// }));

// // Create a manual mock for the WatcherService module
// jest.mock('../../src/watcher/watcher.service', () => {
//   // Get the actual implementation
//   const originalModule = jest.requireActual('../../src/watcher/watcher.service');
  
//   // Return a modified version of the module
//   return {
//     ...originalModule,
//     // Make sure internal references to .js modules will be handled correctly
//     __esModule: true,
//     // Mock the decorator for testing
//     CatchCronError: (cronTime) => {
//       return function(target, propertyKey, descriptor) {
//         const original = descriptor.value;
//         descriptor.value = async function(...args) {
//           try {
//             return await original.apply(this, args);
//           } catch (error: any) {
//             console.error(`Error in cron job [${cronTime}]: ${error.message}`);
//             throw error;
//           }
//         };
//         return descriptor;
//       };
//     }
//   };
// });

// Import everything after the mocks are in place
import { WatcherService, CatchCronError, TimeoutMap } from '../../../src/watcher/watcher.service';
import { TasksService } from '../../../src/tasks/tasks.service';
import { MongodbLockService } from '../../../src/watcher/lock.service';
import { Task, TaskStatusName, TaskActionName } from '../../../src/tasks/schemas/task.schema';
import { SHARED_SERVICE } from '../../../src/shared/shared.service';
import { TaskEvent, TaskEventName } from '../../../src/tasks/interfaces/task.interface';
import { TwitterClient, TwitterClientStatus } from '@elizaos/client-twitter';


describe('WatcherService', () => {
  let service: WatcherService;
  let tasksService: jest.Mocked<TasksService>;
  let eventEmitter: jest.Mocked<EventEmitter2>;
  let mongodbLockService: jest.Mocked<MongodbLockService>;
  let runtimeCreator: any;

  const mockTask: Task = {
    title: 'test-task',
    nftId: '123',
    status: TaskStatusName.STOPPED,
    action: TaskActionName.START,
    createdBy: 'test-worker',
    updatedAt: new Date(),
    configuration: {
      TWITTER_USERNAME: 'test_user',
    },
    runningSignal: {
      startFailedForMultipleTimes: false,
      accountSuspended: false,
    }
  } as unknown as Task;

  const mockRuntime: any = {
    character: {
      settings: {
        secrets: {}
      }
    }
  };

  beforeEach(async () => {
    // Clear mocks and reset shared service before each test
    jest.clearAllMocks();
    SHARED_SERVICE.tasks.clear();
    SHARED_SERVICE.taskRuntime.clear();

    tasksService = {
      getTasksReqiureStart: jest.fn().mockResolvedValue([] as never),
      getTaskByTitles: jest.fn().mockResolvedValue([] as never),
      taskRunning: jest.fn().mockResolvedValue(undefined as never),
      taskStartFailedForMultiTimes: jest.fn().mockResolvedValue(undefined as never)
    } as any;

    eventEmitter = {
      emit: jest.fn()
    } as any;
    
    mongodbLockService = {
      isLocked: jest.fn().mockResolvedValue(true as never)
    } as any;

    runtimeCreator = {};

    // Create a partial TaskEvent mock
    TaskEvent.createTaskStopEvent = jest.fn() as any;
    TaskEvent.createTaskRestartEvent = jest.fn() as any;
    TaskEvent.createTaskUpdatedEvent = jest.fn() as any;
    TaskEvent.createTaskStartEvent = jest.fn() as any;
    TaskEvent.createTaskCreatedEvent = jest.fn() as any;

    const module: TestingModule = await Test.createTestingModule({
      imports: [
        ScheduleModule.forRoot(),
      ],
      providers: [
        WatcherService,
        { provide: TasksService, useValue: tasksService },
        { provide: EventEmitter2, useValue: eventEmitter },
        { provide: MongodbLockService, useValue: mongodbLockService },
        { provide: 'IRuntimeCreator', useValue: runtimeCreator }
      ],
    }).compile();

    service = module.get<WatcherService>(WatcherService);
  });

  describe('Task Management Methods', () => {
    beforeEach(() => {
      // Setup common test environment
      SHARED_SERVICE.taskRuntime.set(mockTask.title, mockRuntime);
      SHARED_SERVICE.tasks.set(mockTask.title, mockTask);
    });

    describe('stopTask', () => {
      it('should emit stop event when task is valid', async () => {
        await service.stopTask(mockTask);
        
        expect(mongodbLockService.isLocked).toHaveBeenCalledWith(mockTask.title);
        expect(TaskEvent.createTaskStopEvent).toHaveBeenCalledWith(
          eventEmitter, 
          mockTask,
          mockRuntime
        );
      });

      it('should not emit stop event when lock is not acquired', async () => {
        mongodbLockService.isLocked.mockResolvedValueOnce(false);
        
        await service.stopTask(mockTask);
        
        expect(TaskEvent.createTaskStopEvent).not.toHaveBeenCalled();
      });
    });

    describe('updateTask', () => {
      it('should emit update event when task is valid', async () => {
        await service.updateTask(mockTask);
        
        expect(mongodbLockService.isLocked).toHaveBeenCalledWith(mockTask.title);
        expect(TaskEvent.createTaskUpdatedEvent).toHaveBeenCalledWith(
          eventEmitter, 
          mockTask,
          mockRuntime
        );
        expect(SHARED_SERVICE.tasks.get(mockTask.title)).toBe(mockTask);
      });

      it('should not overwrite task when overwriteTask is false', async () => {
        const originalTask = {...mockTask, status: TaskStatusName.RUNNING};
        SHARED_SERVICE.tasks.set(mockTask.title, originalTask);
        
        const updatedTask = {...mockTask, status: TaskStatusName.STOPPED};
        await service.updateTask(updatedTask, { overwriteTask: false });
        
        expect(SHARED_SERVICE.tasks.get(mockTask.title)).toBe(originalTask);
        expect(TaskEvent.createTaskUpdatedEvent).toHaveBeenCalledWith(
          eventEmitter, 
          updatedTask,
          mockRuntime
        );
      });
    });

    describe('createTask', () => {
      it('should add task to local map and emit created event', async () => {
        SHARED_SERVICE.tasks.clear();
        
        await service.createTask(mockTask);
        
        expect(SHARED_SERVICE.tasks.get(mockTask.title)).toBe(mockTask);
        expect(TaskEvent.createTaskCreatedEvent).toHaveBeenCalledWith(
          eventEmitter, 
          mockTask,
          mockRuntime
        );
      });
    });
  });

  describe('Scheduled Tasks', () => {
    describe('getNewTasks', () => {
      it('should get tasks requiring start and create them locally', async () => {
        const newTask = {...mockTask, title: 'new-task'};
        SHARED_SERVICE.taskRuntime.set(newTask.title, mockRuntime);
        tasksService.getTasksReqiureStart.mockResolvedValueOnce([newTask]);
        
        await service.getNewTasks();
        
        expect(tasksService.getTasksReqiureStart).toHaveBeenCalled();
        expect(mongodbLockService.isLocked).toHaveBeenCalledWith(newTask.title);
        expect(TaskEvent.createTaskCreatedEvent).toHaveBeenCalledWith(
          eventEmitter,
          newTask,
          mockRuntime
        );
      });

      it('should skip tasks that are already locally managed', async () => {
        SHARED_SERVICE.tasks.set(mockTask.title, mockTask);
        tasksService.getTasksReqiureStart.mockResolvedValueOnce([mockTask]);
        
        await service.getNewTasks();
        
        expect(mongodbLockService.isLocked).not.toHaveBeenCalled();
        expect(TaskEvent.createTaskCreatedEvent).not.toHaveBeenCalled();
      });
    });

    describe('checkLocalTasksStatus', () => {
      beforeEach(() => {
        SHARED_SERVICE.tasks.set(mockTask.title, mockTask);
        SHARED_SERVICE.taskRuntime.set(mockTask.title, mockRuntime);
      });

      it('should stop task when action is STOP but status is not STOPPED', async () => {
        const task = {...mockTask, action: TaskActionName.STOP, status: TaskStatusName.RUNNING};
        SHARED_SERVICE.tasks.set(task.title, task);
        
        (TwitterClient.getStatus as jest.Mock).mockReturnValueOnce(TwitterClientStatus.RUNNING);
        
        await service.checkLocalTasksStatus();
        
        expect(TaskEvent.createTaskStopEvent).toHaveBeenCalledWith(
          eventEmitter,
          expect.objectContaining({
            title: task.title,
            action: TaskActionName.STOP
          }),
          mockRuntime
        );
      });

      it('should start task when action is START but status is not RUNNING', async () => {
        const task = {...mockTask, action: TaskActionName.START, status: TaskStatusName.STOPPED};
        SHARED_SERVICE.tasks.set(task.title, task);
        
        (TwitterClient.getStatus as jest.Mock).mockReturnValueOnce(TwitterClientStatus.STOPPED);
        
        await service.checkLocalTasksStatus();
        
        expect(TaskEvent.createTaskStartEvent).toHaveBeenCalledWith(
          eventEmitter,
          expect.objectContaining({
            title: task.title,
            action: TaskActionName.START
          }),
          mockRuntime
        );
      });

      it('should not attempt to start a task that has failed multiple times', async () => {
        const failedTask = {
          ...mockTask,
          action: TaskActionName.START,
          status: TaskStatusName.STOPPED,
          runningSignal: { startFailedForMultipleTimes: true, accountSuspended: false }
        };
        
        SHARED_SERVICE.tasks.set(failedTask.title, failedTask);
        (TwitterClient.getStatus as jest.Mock).mockReturnValueOnce(TwitterClientStatus.STOPPED);
        
        await service.checkLocalTasksStatus();
        
        expect(tasksService.taskStartFailedForMultiTimes).toHaveBeenCalledWith(failedTask.nftId);
        expect(TaskEvent.createTaskStartEvent).not.toHaveBeenCalled();
      });
    });

    describe('checkTaskActionOrConfigurationChanged', () => {
      beforeEach(() => {
        SHARED_SERVICE.tasks.set(mockTask.title, mockTask);
        SHARED_SERVICE.taskRuntime.set(mockTask.title, mockRuntime);
      });

      it('should stop task when configuration changes and Twitter info is removed', async () => {
        const dbTask = {
          ...mockTask,
          configuration: { }  // Twitter username removed
        };
        
        tasksService.getTaskByTitles.mockResolvedValueOnce([dbTask]);
        (TwitterClient.getStatus as jest.Mock).mockReturnValueOnce(TwitterClientStatus.RUNNING);
        
        await service.checkTaskActionOrConfigurationChanged();
        
        expect(TaskEvent.createTaskStopEvent).toHaveBeenCalledWith(
          eventEmitter,
          expect.objectContaining({
            title: mockTask.title,
            action: TaskActionName.STOP
          }),
          mockRuntime
        );
      });

      it('should restart task when configuration changes but Twitter info exists', async () => {
        const dbTask = {
          ...mockTask,
          configuration: { 
            TWITTER_USERNAME: 'different_username'
          }
        };
        
        tasksService.getTaskByTitles.mockResolvedValueOnce([dbTask]);
        (TwitterClient.getStatus as jest.Mock).mockReturnValueOnce(TwitterClientStatus.RUNNING);
        
        await service.checkTaskActionOrConfigurationChanged();
        
        expect(TaskEvent.createTaskRestartEvent).toHaveBeenCalledWith(
          eventEmitter,
          expect.objectContaining({
            title: mockTask.title,
            configuration: dbTask.configuration
          }),
          mockRuntime
        );
      });

      it('should stop and clear local task if not found in DB', async () => {
        tasksService.getTaskByTitles.mockResolvedValueOnce([]);  // No tasks returned from DB
        (TwitterClient.getStatus as jest.Mock).mockReturnValueOnce(TwitterClientStatus.RUNNING);
        
        await service.checkTaskActionOrConfigurationChanged();
        
        expect(TaskEvent.createTaskStopEvent).toHaveBeenCalledWith(
          eventEmitter,
          expect.objectContaining({
            title: mockTask.title,
            action: TaskActionName.STOP
          }),
          mockRuntime
        );
      });
    });
  });
});