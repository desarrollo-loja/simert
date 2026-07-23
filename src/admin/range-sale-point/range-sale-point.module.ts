import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from 'src/auth/auth.module';
import { LoggerModule } from 'src/common/logger.module';

import { RangeSalePoint } from './entities/range-sale-point.entity';
import { RangeSalePointController } from './range-sale-point.controller';
import { RangeSalePointService } from './range-sale-point.service';

/**
 *
 */
@Module({
    controllers: [RangeSalePointController],
    providers: [RangeSalePointService],
    imports: [
        TypeOrmModule.forFeature([RangeSalePoint]),
        AuthModule,
        LoggerModule,
    ],
    exports: [RangeSalePointService],
})
export class RangeSalePointModule {}
