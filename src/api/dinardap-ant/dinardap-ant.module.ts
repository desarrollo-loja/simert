import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { CommonGimModule } from 'src/common/common.gim.module';
import { LoggerModule } from 'src/common/logger.module';

import { DinardapAntController } from './dinardap-ant.controller';
import { DinardapAntService } from './dinardap-ant.service';

/**
 * Wires the DINARDAP–ANT (REST) plate-lookup resource: exposes
 * {@link DinardapAntController} and provides {@link DinardapAntService}.
 * Imports {@link LoggerModule} so ANT integration failures can be audited
 * in the `logsant` collection.
 */
@Module({
    imports: [ConfigModule, CommonGimModule, LoggerModule],
    controllers: [DinardapAntController],
    providers: [DinardapAntService],
    exports: [DinardapAntService],
})
export class DinardapAntModule {}
