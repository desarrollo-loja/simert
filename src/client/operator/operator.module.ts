import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BlockOperator } from 'src/admin/block_operator/entities/block_operator.entity';
import { CheckboxUser } from 'src/admin/checkbox-user/entities/checkbox-user.entity';
import { Fraction } from 'src/admin/fraction/entities/fraction.entity';
import { FractionStatus } from 'src/admin/fraction_status/entities/fraction_status.entity';
import { Incident } from 'src/admin/incident/entities/incident.entity';
import { IncidentType } from 'src/admin/incident-type/entities/incident-type.entity';
import { Physic } from 'src/admin/physics/entities/physic.entity';
import { Range } from 'src/admin/range/entities/range.entity';
import { Slot } from 'src/admin/slot/entities/slot.entity';
import { Zone } from 'src/admin/zone/entities/zone.entity';
import { DinardapAntModule } from 'src/api/dinardap-ant/dinardap-ant.module';
import { GimModule } from 'src/api/gim/gim.module';
import { AuthModule } from 'src/auth/auth.module';
import { CommonCacheModule } from 'src/common/common.cache.module';
import { CommonModule } from 'src/common/common.module';

import { OperatorController } from './operator.controller';
import { OperatorService } from './operator.service';

/**
 *
 */
@Module({
    controllers: [OperatorController],
    providers: [OperatorService],
    imports: [
        TypeOrmModule.forFeature([
            Fraction,
            BlockOperator,
            Slot,
            FractionStatus,
            Physic,
            Zone,
            Range,
            CheckboxUser,
            Incident,
            IncidentType,
        ]),
        AuthModule,
        CommonModule,
        CommonCacheModule,
        DinardapAntModule,
        GimModule,
    ],
})
export class OperatorModule {}
