import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Checkbox } from 'src/admin/checkbox/entities/checkbox.entity';
import { Fraction } from 'src/admin/fraction/entities/fraction.entity';
import { AuthModule } from 'src/auth/auth.module';

import { CheckboxUserController } from './checkbox-user.controller';
import { CheckboxUserService } from './checkbox-user.service';
import { CheckboxUser } from './entities/checkbox-user.entity';

@Module({
  controllers: [CheckboxUserController],
  providers: [CheckboxUserService],
  imports: [TypeOrmModule.forFeature([CheckboxUser, Checkbox, Fraction]), AuthModule],

})
export class CheckboxUserModule { }
