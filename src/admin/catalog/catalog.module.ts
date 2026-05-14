import { Module } from '@nestjs/common';
import { CatalogService } from './catalog.service';
import { CatalogController } from './catalog.controller';
import { Catalog } from './entities/catalog.entity';
import { AuthModule } from 'src/auth/auth.module';
import { LoggerModule } from 'src/common/logger.module';

@Module({
  controllers: [CatalogController],
  providers: [CatalogService],
  imports: [TypeOrmModule.forFeature([Catalog]), AuthModule, LoggerModule],

})
export class CatalogModule {}
