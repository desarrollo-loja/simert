import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from 'src/auth/auth.module';
import { LoggerModule } from 'src/common/logger.module';

import { Schedule } from './entities/schedule.entity';
import { ScheduleController } from './schedule.controller';
import { ScheduleService } from './schedule.service';

/**
 *
 */
@Module({
    controllers: [ScheduleController],
    providers: [ScheduleService],
    imports: [TypeOrmModule.forFeature([Schedule]), AuthModule, LoggerModule],
})
export class ScheduleModule {}
