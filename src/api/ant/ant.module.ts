import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from 'src/auth/auth.module';
import { LoggerModule } from 'src/common/logger.module';

import { AntController } from './ant.controller';
import { AntService } from './ant.service';

/**
 * Wires the ANT (SOAP) plate-lookup resource: exposes {@link AntController}
 * and provides {@link AntService}. Imports {@link LoggerModule} so ANT
 * integration failures can be audited in the `logsant` collection.
 */
@Module({
    imports: [ConfigModule, LoggerModule, AuthModule],
    providers: [AntService],
    controllers: [AntController],
    exports: [AntService],
})
export class AntModule {}
