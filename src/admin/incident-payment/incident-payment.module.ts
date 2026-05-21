import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { IncidentPayment } from './entities/incident-payment.entity';
import { IncidentPaymentController } from './incident-payment.controller';
import { IncidentPaymentService } from './incident-payment.service';

@Module({
  controllers: [IncidentPaymentController],
  providers: [IncidentPaymentService],
  imports: [TypeOrmModule.forFeature([IncidentPayment])],
  exports: [IncidentPaymentService],
})
export class IncidentPaymentModule {}
