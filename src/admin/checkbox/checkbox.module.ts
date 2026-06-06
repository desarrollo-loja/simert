import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from 'src/auth/auth.module';

import { CheckboxController } from './checkbox.controller';
import { CheckboxService } from './checkbox.service';
import { Checkbox } from './entities/checkbox.entity';

/**
 *
 */
@Module({
  controllers: [CheckboxController],
  providers: [CheckboxService],
  imports: [TypeOrmModule.forFeature([Checkbox]), AuthModule],
})
export class CheckboxModule {}
