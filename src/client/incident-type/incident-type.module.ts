import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { IncidentType } from 'src/admin/incident-type/entities/incident-type.entity';
import { LoggerModule } from 'src/common/logger.module';

import { IncidentTypeController } from './incident-type.controller';
import { IncidentTypeService } from './incident-type.service';

/**
 *
 */
@Module({
    controllers: [IncidentTypeController],
    providers: [IncidentTypeService],
    imports: [TypeOrmModule.forFeature([IncidentType]), LoggerModule],
})
export class IncidentTypeModule {}
