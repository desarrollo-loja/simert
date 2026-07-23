import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { L } from 'src/admin/l/entities/l.entity';

import { TrakingController } from './traking.controller';
import { TrakingService } from './traking.service';

/**
 *
 */
@Module({
    controllers: [TrakingController],
    providers: [TrakingService],
    imports: [TypeOrmModule.forFeature([L])],
})
export class TrakingModule {}
