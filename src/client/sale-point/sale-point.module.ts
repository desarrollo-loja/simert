import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SalePoint } from 'src/admin/sale-point/entities/sale-point.entity';
import { AuthModule } from 'src/auth/auth.module';
import { LoggerModule } from 'src/common/logger.module';

import { SalePointController } from './sale-point.controller';
import { SalePointService } from './sale-point.service';

/**
 *
 */
@Module({
  controllers: [SalePointController],
  providers: [SalePointService],
  imports: [TypeOrmModule.forFeature([SalePoint]), AuthModule, LoggerModule],
})
export class SalePointModule {}
