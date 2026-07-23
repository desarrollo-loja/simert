import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { AntController } from './ant.controller';
import { AntService } from './ant.service';

/**
 *
 */
@Module({
    imports: [ConfigModule],
    providers: [AntService],
    controllers: [AntController],
    exports: [AntService],
})
export class AntModule {}
