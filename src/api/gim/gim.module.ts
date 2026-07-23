import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { IncidentModule } from 'src/admin/incident/incident.module';
import { IncidentTypeModule } from 'src/admin/incident-type/incident-type.module';
import { AuthModule } from 'src/auth/auth.module';
import { CommonAuthModule } from 'src/common/common.auth.module';
import { CommonGimModule } from 'src/common/common.gim.module';

import { DinardapAntModule } from '../dinardap-ant/dinardap-ant.module';
import { GimController } from './gim.controller';
import { GimService } from './gim.service';

/**
 *
 */
@Module({
    imports: [
        ConfigModule,
        IncidentModule,
        IncidentTypeModule,
        CommonAuthModule,
        CommonGimModule,
        DinardapAntModule,
        AuthModule,
    ],
    controllers: [GimController],
    providers: [GimService],
    exports: [GimService],
})
export class GimModule {}
