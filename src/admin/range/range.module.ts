import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from 'src/auth/auth.module';
import { LoggerModule } from 'src/common/logger.module';

import { Range } from './entities/range.entity';
import { RangeController } from './range.controller';
import { RangeService } from './range.service';

/**
 *
 */
@Module({
    controllers: [RangeController],
    providers: [RangeService],
    imports: [TypeOrmModule.forFeature([Range]), AuthModule, LoggerModule],
})
export class RangeModule {}
