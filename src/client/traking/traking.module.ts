import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { L } from 'src/admin/l/entities/l.entity';
import { AuthModule } from 'src/auth/auth.module';

import { TrakingController } from './traking.controller';
import { TrakingService } from './traking.service';

/**
 *
 */
@Module({
    controllers: [TrakingController],
    providers: [TrakingService],
    imports: [TypeOrmModule.forFeature([L]), AuthModule],
})
export class TrakingModule {}
