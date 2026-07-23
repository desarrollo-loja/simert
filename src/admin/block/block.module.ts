import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from 'src/auth/auth.module';
import { LoggerModule } from 'src/common/logger.module';

import { BlockController } from './block.controller';
import { BlockService } from './block.service';
import { Block } from './entities/block.entity';

/**
 *
 */
@Module({
    controllers: [BlockController],
    providers: [BlockService],
    imports: [TypeOrmModule.forFeature([Block]), AuthModule, LoggerModule],
})
export class BlockModule {}
