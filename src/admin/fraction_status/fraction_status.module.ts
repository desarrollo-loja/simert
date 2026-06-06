import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from 'src/auth/auth.module';

import { FractionStatus } from './entities/fraction_status.entity';
import { FractionStatusController } from './fraction_status.controller';
import { FractionStatusService } from './fraction_status.service';

/**
 *
 */
@Module({
  controllers: [FractionStatusController],
  providers: [FractionStatusService],
  imports: [TypeOrmModule.forFeature([FractionStatus]), AuthModule],
})
export class FractionStatusModule {}
