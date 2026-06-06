import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from 'src/auth/auth.module';
import { LoggerModule } from 'src/common/logger.module';

import { SalePoint } from './entities/sale-point.entity';
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
