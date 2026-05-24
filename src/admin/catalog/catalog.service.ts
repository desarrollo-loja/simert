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

/**
 * Service for managing Catalog entries — configurable lookup tables used
 * across the system (e.g. vehicle categories, infraction types). Provides
 * CRUD operations with audit logging via {@link LoggerService}.
 */
@Injectable()
export class CatalogService {
  private readonly logger = new Logger('CatalogService');

  constructor(
    @InjectRepository(Catalog)
    private readonly catalogRepository: Repository<Catalog>,

    @Inject(LoggerService)
    private readonly loggerService: LoggerService,
  ) {}

  /**
   * Creates a new catalog entry and writes a CREATE audit log entry.
   *
   * @param userId - ID of the user performing the action (for audit logging).
   * @param createCatalogDto - Payload with catalog name, data, and description.
   * @returns Object with errorCode and the newly created catalog.
   * @throws Rethrows database errors via handleDbExceptions.
   */
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

  /**
   * Returns a paginated list of catalog entries, optionally filtered by name
   * or description using a case-insensitive partial match. Timestamps are
   * formatted as `YYYY-MM-DD"T"HH24:MI:SS.MS` to avoid UTC serialization.
   *
   * @param filterDto - Filter and pagination options: search, limit, offset.
   * @returns Object with errorCode, catalog rows, total count, and applied offset/limit.
   * @throws Rethrows database errors via handleDbExceptions.
   */
  async findAll(filterDto: FilterDto) {
    const { search } = filterDto;

    const take = Number(filterDto.limit) || 20;
    const skip = Number(filterDto.offset) || 0;

    try {
      const query = this.catalogRepository
        .createQueryBuilder('c')
        .select([
          'c.id AS "id"',
          'c.name AS "name"',
          'c.data AS "data"',
          'c.description AS "description"',
          'c.isActivated AS "isActivated"',
        ])
        .addSelect(`TO_CHAR(c."createdAt", 'YYYY-MM-DD"T"HH24:MI:SS.MS')`, 'createdAt')
        .addSelect(`TO_CHAR(c."updatedAt", 'YYYY-MM-DD"T"HH24:MI:SS.MS')`, 'updatedAt')
        .orderBy('c.id', 'DESC');

      if (search) {
        query.andWhere('(c.name ILIKE :search OR c.description ILIKE :search)', {
          search: `%${search}%`,
        });
      }

      const total = await query.getCount();

      const catalog = await query.limit(take).offset(skip).getRawMany();

      return { errorCode: ErrorCode.NONE, catalog, total, offset: skip, limit: take };
    } catch (error) {
      handleDbExceptions(error, this.logger);
    }
  }

  /**
   * Applies a partial update to an existing catalog entry and writes an UPDATE
   * audit log entry.
   *
   * @param id - Primary key of the catalog entry to update.
   * @param userId - ID of the user performing the action (for audit logging).
   * @param updateCatalogDto - Fields to update on the catalog record.
   * @returns Object with errorCode and the updated catalog, or NOT_FOUND if the record is missing.
   * @throws Rethrows database errors via handleDbExceptions.
   */
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
