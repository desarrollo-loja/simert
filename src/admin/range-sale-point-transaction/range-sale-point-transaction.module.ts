import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LoggerModule } from 'src/common/logger.module';

import { CheckboxUser } from '../checkbox-user/entities/checkbox-user.entity';
import { RangeSalePoint } from '../range-sale-point/entities/range-sale-point.entity';
import { RangeSalePointTransaction } from './entities/range-sale-point-transaction.entity';
import { RangeSalePointTransactionController } from './range-sale-point-transaction.controller';
import { RangeSalePointTransactionService } from './range-sale-point-transaction.service';

/**
 *
 */
@Module({
  controllers: [RangeSalePointTransactionController],
  providers: [RangeSalePointTransactionService],
  imports: [
    TypeOrmModule.forFeature([
      RangeSalePointTransaction,
      RangeSalePoint,
      CheckboxUser,
    ]),
    LoggerModule,
  ],
  exports: [RangeSalePointTransactionService],
})
export class RangeSalePointTransactionModule {}
