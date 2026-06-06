import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from 'src/auth/auth.module';
import { LoggerModule } from 'src/common/logger.module';

import { AgentActivitiesController } from './agent-activities.controller';
import { AgentActivitiesService } from './agent-activities.service';
import { AgentActivity } from './entities/agent-activity.entity';

/**
 *
 */
@Module({
  controllers: [AgentActivitiesController],
  providers: [AgentActivitiesService],
  imports: [
    TypeOrmModule.forFeature([AgentActivity]),
    AuthModule,
    LoggerModule,
  ],
})
export class AgentActivitiesModule {}
