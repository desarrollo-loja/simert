import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Incident } from 'src/admin/incident/entities/incident.entity';
import { GimModule } from 'src/api/gim/gim.module';
import { CommonModule } from 'src/common/common.module';

import { IncidentService } from './incident.service';

/**
 * Module for the background job that reconciles GIM-emitted incidents
 * that are paid but pending deposit, and syncs the GIM responses to simert-pay.
 */
@Module({
  providers: [IncidentService],
  imports: [TypeOrmModule.forFeature([Incident]), GimModule, CommonModule],
})
export class IncidentCheckModule {}
