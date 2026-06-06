import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Card } from 'src/admin/card/entities/card.entity';
import { Catalog } from 'src/admin/catalog/entities/catalog.entity';
import { Checkbox } from 'src/admin/checkbox/entities/checkbox.entity';
import { CheckboxUser } from 'src/admin/checkbox-user/entities/checkbox-user.entity';
import { GimModule } from 'src/api/gim/gim.module';
import { AuthModule } from 'src/auth/auth.module';
import { CommonModule } from 'src/common/common.module';

import { CheckboxController } from './checkbox.controller';
import { CheckboxService } from './checkbox.service';

/**
 *
 */
@Module({
  controllers: [CheckboxController],
  providers: [CheckboxService],
  imports: [
    TypeOrmModule.forFeature([Checkbox, CheckboxUser, Card, Catalog]),
    AuthModule,
    CommonModule,
    GimModule,
  ],
})
export class CheckboxModule {}
