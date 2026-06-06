import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Block } from 'src/admin/block/entities/block.entity';
import { Slot } from 'src/admin/slot/entities/slot.entity';
import { Zone } from 'src/admin/zone/entities/zone.entity';
import { AuthModule } from 'src/auth/auth.module';
import { LoggerModule } from 'src/common/logger.module';

import { MappingController } from './mapping.controller';
import { MappingService } from './mapping.service';

/**
 *
 */
@Module({
  controllers: [MappingController],
  providers: [MappingService],
  imports: [
    TypeOrmModule.forFeature([Zone, Block, Slot]),
    AuthModule,
    LoggerModule,
  ],
})
export class MappingModule {}
