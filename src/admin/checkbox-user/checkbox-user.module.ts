import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from 'src/auth/auth.module';

import { CheckboxUserController } from './checkbox-user.controller';
import { CheckboxUserService } from './checkbox-user.service';
import { CheckboxUser } from './entities/checkbox-user.entity';

@Module({
  controllers: [CheckboxUserController],
  providers: [CheckboxUserService],
  imports: [TypeOrmModule.forFeature([CheckboxUser]), AuthModule],

})
export class CheckboxUserModule { }
