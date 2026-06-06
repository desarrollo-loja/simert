import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BlockOperator } from 'src/admin/block_operator/entities/block_operator.entity';
import { Catalog } from 'src/admin/catalog/entities/catalog.entity';
import { Checkbox } from 'src/admin/checkbox/entities/checkbox.entity';
import { Fraction } from 'src/admin/fraction/entities/fraction.entity';
import { GimModule } from 'src/api/gim/gim.module';
import { AuthModule } from 'src/auth/auth.module';
import { CommonCacheModule } from 'src/common/common.cache.module';
import { CommonModule } from 'src/common/common.module';

import { CheckService } from './check.service';

/**
 *
 */
@Module({
  providers: [CheckService],
  imports: [
    TypeOrmModule.forFeature([Fraction, Checkbox, BlockOperator, Catalog]),
    CommonModule,
    AuthModule,
    GimModule,
    CommonCacheModule,
  ],
})
export class CheckModule {}
