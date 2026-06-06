import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BlockOperator } from 'src/admin/block_operator/entities/block_operator.entity';
import { CheckboxUser } from 'src/admin/checkbox-user/entities/checkbox-user.entity';
import { Fraction } from 'src/admin/fraction/entities/fraction.entity';
import { FractionStatus } from 'src/admin/fraction_status/entities/fraction_status.entity';
import { Slot } from 'src/admin/slot/entities/slot.entity';
import { AuthModule } from 'src/auth/auth.module';
import { CommonCacheModule } from 'src/common/common.cache.module';
import { CommonModule } from 'src/common/common.module';

import { SimertController } from './simert.controller';
import { SimertService } from './simert.service';
/**
 *
 */
@Module({
  controllers: [SimertController],
  providers: [SimertService],
  imports: [
    TypeOrmModule.forFeature([
      Fraction,
      Slot,
      CheckboxUser,
      FractionStatus,
      BlockOperator,
    ]),
    AuthModule,
    CommonModule,
    CommonCacheModule,
  ],
})
export class SimertModule {}
