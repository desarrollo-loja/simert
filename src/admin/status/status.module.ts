import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from 'src/auth/auth.module';

import { Status } from './entities/status.entity';
import { StatusController } from './status.controller';
import { StatusService } from './status.service';

/**
 *
 */
@Module({
    controllers: [StatusController],
    providers: [StatusService],
    imports: [TypeOrmModule.forFeature([Status]), AuthModule],
})
export class StatusModule {}
