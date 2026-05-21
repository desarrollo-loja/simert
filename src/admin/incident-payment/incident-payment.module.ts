import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from 'src/auth/auth.module';
import { CommonGimModule } from 'src/common/common.gim.module';
import { LoggerModule } from 'src/common/logger.module';

import { IncidentPayment } from './entities/incident-payment.entity';
import { IncidentPaymentController } from './incident-payment.controller';
import { IncidentPaymentService } from './incident-payment.service';

@Module({
  controllers: [IncidentPaymentController],
  providers: [IncidentPaymentService],
  imports: [TypeOrmModule.forFeature([IncidentPayment]), AuthModule, LoggerModule, CommonGimModule],
  exports: [IncidentPaymentService],
})
export class IncidentPaymentModule { }
