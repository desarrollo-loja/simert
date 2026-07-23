import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from 'src/auth/auth.module';
import { CommonGimModule } from 'src/common/common.gim.module';
import { LoggerModule } from 'src/common/logger.module';

import { Incident } from './entities/incident.entity';
import { IncidentController } from './incident.controller';
import { IncidentService } from './incident.service';

/**
 *
 */
@Module({
    controllers: [IncidentController],
    providers: [IncidentService],
    imports: [
        TypeOrmModule.forFeature([Incident]),
        AuthModule,
        LoggerModule,
        CommonGimModule,
    ],
    exports: [IncidentService],
})
export class IncidentModule {}
