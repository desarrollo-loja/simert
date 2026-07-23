import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from 'src/auth/auth.module';
import { LoggerModule } from 'src/common/logger.module';

import { BlockOperatorController } from './block_operator.controller';
import { BlockOperatorService } from './block_operator.service';
import { BlockOperator } from './entities/block_operator.entity';

/**
 *
 */
@Module({
    controllers: [BlockOperatorController],
    providers: [BlockOperatorService],
    imports: [
        TypeOrmModule.forFeature([BlockOperator]),
        AuthModule,
        LoggerModule,
    ],
})
export class BlockOperatorModule {}
