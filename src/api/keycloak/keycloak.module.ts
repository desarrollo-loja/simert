import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from 'src/auth/auth.module';
import { CommonGimModule } from 'src/common/common.gim.module';
import { LoggerModule } from 'src/common/logger.module';

import { KeycloakController } from './keycloak.controller';
import { KeycloakService } from './keycloak.service';

/**
 * Wires the Keycloak identity resource: exposes {@link KeycloakController} and
 * provides {@link KeycloakService}. Imports {@link LoggerModule} so Keycloak
 * integration failures can be audited in the `logskeycloak` collection.
 */
@Module({
    imports: [ConfigModule, CommonGimModule, AuthModule, LoggerModule],
    controllers: [KeycloakController],
    providers: [KeycloakService],
    exports: [KeycloakService],
})
export class KeycloakModule {}
