import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CheckboxUser } from 'src/admin/checkbox-user/entities/checkbox-user.entity';
import { RangeSalePoint } from 'src/admin/range-sale-point/entities/range-sale-point.entity';
import { RangeSalePointTransaction } from 'src/admin/range-sale-point-transaction/entities/range-sale-point-transaction.entity';
import { CommonModule } from 'src/common/common.module';
import { LoggerModule } from 'src/common/logger.module';

import { RangeSalePointTransactionController } from './range-sale-point-transaction.controller';
import { RangeSalePointTransactionService } from './range-sale-point-transaction.service';

@Module({
    controllers: [RangeSalePointTransactionController],
    providers: [RangeSalePointTransactionService],
    imports: [
        TypeOrmModule.forFeature([RangeSalePointTransaction, RangeSalePoint, CheckboxUser]),
        LoggerModule,
        CommonModule
    ],
    exports: [RangeSalePointTransactionService]
})
export class RangeSalePointTransactionModule { }
