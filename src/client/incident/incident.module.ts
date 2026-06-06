import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Fraction } from 'src/admin/fraction/entities/fraction.entity';
import { FractionStatus } from 'src/admin/fraction_status/entities/fraction_status.entity';
import { Incident } from 'src/admin/incident/entities/incident.entity';
import { IncidentPayment } from 'src/admin/incident-payment/entities/incident-payment.entity';
import { IncidentType } from 'src/admin/incident-type/entities/incident-type.entity';
import { Slot } from 'src/admin/slot/entities/slot.entity';
import { DinardapAntModule } from 'src/api/dinardap-ant/dinardap-ant.module';
import { GimModule } from 'src/api/gim/gim.module';
import { AuthModule } from 'src/auth/auth.module';
import { CommonAntModule } from 'src/common/common.ant.module';
import { CommonModule } from 'src/common/common.module';
import { LoggerModule } from 'src/common/logger.module';

import { IncidentController } from './incident.controller';
import { IncidentService } from './incident.service';

/**
 *
 */
@Module({
  controllers: [IncidentController],
  providers: [IncidentService],
  imports: [
    TypeOrmModule.forFeature([
      Incident,
      IncidentType,
      IncidentPayment,
      Fraction,
      FractionStatus,
      Slot,
    ]),
    AuthModule,
    LoggerModule,
    CommonAntModule,
    CommonModule,
    DinardapAntModule,
    GimModule,
  ],
})
export class IncidentModule {}
