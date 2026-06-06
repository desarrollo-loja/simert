import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from 'src/auth/auth.module';
import { LoggerModule } from 'src/common/logger.module';

import { Zone } from './entities/zone.entity';
import { ZoneController } from './zone.controller';
import { ZoneService } from './zone.service';
/**
 *
 */
@Module({
  controllers: [ZoneController],
  providers: [ZoneService],
  imports: [TypeOrmModule.forFeature([Zone]), AuthModule, LoggerModule],
})
export class ZoneModule {}
