import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Incident } from 'src/admin/incident/entities/incident.entity';
import { GimModule } from 'src/api/gim/gim.module';

import { IncidentService } from './incident.service';

/**
 *
 */
@Module({
  providers: [IncidentService],
  imports: [TypeOrmModule.forFeature([Incident]), GimModule],
})
export class IncidentCheckModule {}
