import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { CommonGimModule } from 'src/common/common.gim.module';

import { DinardapAntController } from './dinardap-ant.controller';
import { DinardapAntService } from './dinardap-ant.service';

/**
 *
 */
@Module({
  imports: [ConfigModule, CommonGimModule],
  controllers: [DinardapAntController],
  providers: [DinardapAntService],
  exports: [DinardapAntService],
})
export class DinardapAntModule {}
