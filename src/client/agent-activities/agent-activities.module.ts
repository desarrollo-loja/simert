import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AgentActivity } from 'src/admin/agent-activities/entities/agent-activity.entity';
import { BlockOperator } from 'src/admin/block_operator/entities/block_operator.entity';
import { AuthModule } from 'src/auth/auth.module';
import { LoggerModule } from 'src/common/logger.module';

import { AgentActivitiesController } from './agent-activities.controller';
import { AgentActivitiesService } from './agent-activities.service';

/**
 *
 */
@Module({
  controllers: [AgentActivitiesController],
  providers: [AgentActivitiesService],
  imports: [
    TypeOrmModule.forFeature([AgentActivity, BlockOperator]),
    AuthModule,
    LoggerModule,
  ],
})
export class AgentActivitiesModule {}
