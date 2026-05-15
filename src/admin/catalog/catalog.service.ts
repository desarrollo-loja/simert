import { Inject, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import handleDbExceptions from 'src/common/exceptions/error.db.exception';
import { ErrorCode } from 'src/common/glob/error';
import { TypeOperation } from 'src/common/glob/type/type_operation';
import { LoggerService } from 'src/common/logger.service.ts';
import { Repository } from 'typeorm';

import { FilterDto } from '../../common/dto/filter.dto';
import { CreateCatalogDto } from './dto/create-catalog.dto';
import { UpdateCatalogDto } from './dto/update-catalog.dto';
import { Catalog } from './entities/catalog.entity';

@Injectable()
export class CatalogService {
    private readonly logger = new Logger('CatalogService');

    constructor(
        @InjectRepository(Catalog)
        private readonly catalogRepository: Repository<Catalog>,

        @Inject(LoggerService)
        private readonly loggerService: LoggerService,
    ) {}

    async create(userId: number, createCatalogDto: CreateCatalogDto) {
        try {
            let catalog = this.catalogRepository.create({ ...createCatalogDto });
            catalog = await this.catalogRepository.save(catalog);
            this.loggerService.saveCatalogLogger({
                id: catalog.id,
                userId,
                typeOperation: TypeOperation.CREATE,
                catalog,
            });
            return { errorCode: ErrorCode.NONE, catalog };
        } catch (error) {
            handleDbExceptions(error, this.logger);
        }
    }

    async findAll(filterDto: FilterDto) {
        const { search } = filterDto;

        const take = Number(filterDto.limit) || 20;
        const skip = Number(filterDto.offset) || 0;

        try {
            const query = this.catalogRepository
                .createQueryBuilder('c')
                .select([
                    'c.id AS "id"',
                    'c.type AS "type"',
                    'c.data AS "data"',
                    'c.description AS "description"',
                    'c.isActivated AS "isActivated"',
                ])
                .addSelect(`TO_CHAR(c."createdAt", 'YYYY-MM-DD"T"HH24:MI:SS.MS')`, 'createdAt')
                .addSelect(`TO_CHAR(c."updatedAt", 'YYYY-MM-DD"T"HH24:MI:SS.MS')`, 'updatedAt')
                .orderBy('c.id', 'DESC')
                .limit(take)
                .offset(skip);

            if (search) {
                query.andWhere('c.type ILIKE :search', { search: `%${search}%` });
            }

            const catalog = await query.getRawMany();

            return { errorCode: ErrorCode.NONE, catalog, offset: skip, limit: take };
        } catch (error) {
            handleDbExceptions(error, this.logger);
        }
    }

    async update(id: number, userId: number, updateCatalogDto: UpdateCatalogDto) {
        try {
            const catalog = await this.catalogRepository.preload({ id, ...updateCatalogDto });
            if (catalog) {
                await this.catalogRepository.save(catalog);
                this.loggerService.saveCatalogLogger({
                    id: catalog.id,
                    userId,
                    typeOperation: TypeOperation.UPDATE,
                    catalog,
                });
                return { errorCode: ErrorCode.NONE, catalog };
            }
            return { errorCode: ErrorCode.NOT_FOUND };
        } catch (error) {
            handleDbExceptions(error, this.logger);
        }
    }
}
