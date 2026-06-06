import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from 'src/auth/auth.module';

import { L } from './entities/l.entity';
import { LController } from './l.controller';
import { LService } from './l.service';

/**
 *
 */
@Module({
  controllers: [LController],
  providers: [LService],
  imports: [TypeOrmModule.forFeature([L]), AuthModule],
})
export class LModule {}
