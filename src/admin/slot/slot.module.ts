import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from 'src/auth/auth.module';
import { LoggerModule } from 'src/common/logger.module';

import { Slot } from './entities/slot.entity';
import { SlotController } from './slot.controller';
import { SlotService } from './slot.service';
/**
 *
 */
@Module({
  controllers: [SlotController],
  providers: [SlotService],
  imports: [TypeOrmModule.forFeature([Slot]), AuthModule, LoggerModule],
})
export class SlotModule {}
