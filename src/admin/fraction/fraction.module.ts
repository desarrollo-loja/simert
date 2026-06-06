import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from 'src/auth/auth.module';

import { Fraction } from './entities/fraction.entity';
import { FractionController } from './fraction.controller';
import { FractionService } from './fraction.service';

/**
 *
 */
@Module({
  controllers: [FractionController],
  providers: [FractionService],
  imports: [TypeOrmModule.forFeature([Fraction]), AuthModule],
})
export class FractionModule {}
