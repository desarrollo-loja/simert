import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { IncidentModule } from 'src/admin/incident/incident.module';
import { IncidentTypeModule } from 'src/admin/incident-type/incident-type.module';
import { AuthModule } from 'src/auth/auth.module';
import { CommonAuthModule } from 'src/common/common.auth.module';
import { CommonGimModule } from 'src/common/common.gim.module';
import { LoggerModule } from 'src/common/logger.module';

import { DinardapAntModule } from '../dinardap-ant/dinardap-ant.module';
import { ExternalSimertController } from './external-simert.controller';
import { GimController } from './gim.controller';
import { GimService } from './gim.service';

/**
 * Wires the GIM municipal-integration resource: exposes {@link GimController},
 * plus {@link ExternalSimertController} for the resources published under the
 * municipality's own `api/external/simert` path, and provides
 * {@link GimService}. Imports {@link LoggerModule} so GIM integration failures
 * can be audited in the `logsgim` collection.
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
        LoggerModule,
    ],
    controllers: [GimController, ExternalSimertController],
    providers: [GimService],
    exports: [GimService],
})
export class GimModule {}
