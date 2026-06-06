import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from 'src/auth/auth.module';
import { LoggerModule } from 'src/common/logger.module';

import { IncidentType } from './entities/incident-type.entity';
import { IncidentTypeController } from './incident-type.controller';
import { IncidentTypeService } from './incident-type.service';

/**
 *
 */
@Module({
  controllers: [IncidentTypeController],
  providers: [IncidentTypeService],
  imports: [TypeOrmModule.forFeature([IncidentType]), LoggerModule, AuthModule],
  exports: [IncidentTypeService],
})
export class IncidentTypeModule {}
