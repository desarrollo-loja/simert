import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from 'src/auth/auth.module';
import { LoggerModule } from 'src/common/logger.module';

import { CatalogController } from './catalog.controller';
import { CatalogService } from './catalog.service';
import { Catalog } from './entities/catalog.entity';

/**
 *
 */
@Module({
    controllers: [CatalogController],
    providers: [CatalogService],
    imports: [TypeOrmModule.forFeature([Catalog]), AuthModule, LoggerModule],
})
export class CatalogModule {}
