import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Block } from 'src/admin/block/entities/block.entity';
import { Schedule } from 'src/admin/schedule/entities/schedule.entity';
import { Slot } from 'src/admin/slot/entities/slot.entity';
import { Zone } from 'src/admin/zone/entities/zone.entity';

import { PublicController } from './public.controller';
import { PublicService } from './public.service';

/**
 * Public read-only module exposing non-sensitive parking data for third-party
 * consumers, mobile applications, maps, and public portals.
 *
 * No authentication is required. All operations are SELECT-only queries.
 */
@Module({
    imports: [TypeOrmModule.forFeature([Zone, Block, Slot, Schedule])],
    controllers: [PublicController],
    providers: [PublicService],
})
export class PublicModule {}
