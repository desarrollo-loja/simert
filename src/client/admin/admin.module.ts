import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Slot } from 'src/admin/slot/entities/slot.entity';
import { AuthModule } from 'src/auth/auth.module';
import { CommonModule } from 'src/common/common.module';

import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';

/**
 *
 */
@Module({
    controllers: [AdminController],
    providers: [AdminService],
    imports: [TypeOrmModule.forFeature([Slot]), AuthModule, CommonModule],
})
export class AdminModule {}
