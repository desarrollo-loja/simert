import { Inject, Injectable } from '@nestjs/common';
import { Injectable } from '@nestjs/common';
import { Catalog } from './entities/catalog.entity';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { LoggerService } from 'src/common/logger.service.ts';

@Injectable()
export class CatalogService {

    constructor(
        @InjectRepository(Catalog)
        private readonly catalogRepository: Repository<Catalog>,

        @Inject(LoggerService)
        private readonly loggerService: LoggerService,
    ){

    }
}
