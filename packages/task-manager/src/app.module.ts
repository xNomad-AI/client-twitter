import { DynamicModule, MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ConfigModule } from '@nestjs/config';
import { join } from 'path';
import { EventEmitterModule } from '@nestjs/event-emitter';

import { TasksModule } from './tasks/tasks.module.js';
import { WatcherModule } from './watcher/watcher.module.js';
import { HealthModule } from './health/health.module.js';
import { mongodbCaFile, mongodbDbName, mongodbUri } from './constant.js';
import { LoggerMiddleware } from './middleware/logger.middleware.js';
import { IRuntimeCreator } from './tasks/interfaces/task.interface.js';

@Module({
  imports: [
    TasksModule,
    WatcherModule,
    HealthModule,

    EventEmitterModule.forRoot(),
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: join(process.cwd(), '.env'),
    }),
    MongooseModule.forRoot(
      mongodbUri!,
      {
        dbName: mongodbDbName,
        tlsAllowInvalidHostnames: true,
        tlsCAFile: mongodbCaFile,
        // tls: mongodbCaFile ? true: false,
      }
    ),
  ],
})
export class TaskManagerModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(LoggerMiddleware).forRoutes('*');
  }

  static forRoot(runtimeCreator: IRuntimeCreator): DynamicModule {
    return {
      module: TaskManagerModule,
      providers: [
        {
          provide: 'IRuntimeCreator',
          useValue: runtimeCreator,
        }
      ],
      exports: ['IRuntimeCreator'],
    };
  }
}
