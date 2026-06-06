import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RangeSalePoint } from 'src/admin/range-sale-point/entities/range-sale-point.entity';
import { AuthModule } from 'src/auth/auth.module';
import { LoggerModule } from 'src/common/logger.module';

import { RangeSalePointController } from './range-sale-point.controller';
import { RangeSalePointService } from './range-sale-point.service';

/**
 *
 */
@Module({
  controllers: [RangeSalePointController],
  providers: [RangeSalePointService],
  imports: [
    TypeOrmModule.forFeature([RangeSalePoint]),
    LoggerModule,
    AuthModule,
  ],
})
export class RangeSalePointModule {}
