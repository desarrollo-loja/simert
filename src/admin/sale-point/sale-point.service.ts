import { Inject, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { FilterDto } from 'src/common/dto/filter.dto';
import handleDbExceptions from 'src/common/exceptions/error.db.exception';
import { ErrorCode } from 'src/common/glob/error';
import { TypeOperation } from 'src/common/glob/type/type_operation';
import { LoggerService } from 'src/common/logger.service.ts';
import { Repository } from 'typeorm';

import { L } from '../l/entities/l.entity';
import { CreateSalePointDto } from './dto/create-sale-point.dto';
import { UpdateSalePointDto } from './dto/update-sale-point.dto';
import { SalePoint } from './entities/sale-point.entity';

/**
 * Service for managing SalePoint entities — physical or virtual locations
 * where parking checkboxes are sold. Provides CRUD, activation control, and
 * geolocation-based lookups used by mobile apps.
 */
@Injectable()
export class SalePointService {
  private readonly logger = new Logger('SalePointService');

  constructor(
    @InjectRepository(SalePoint)
    private readonly salePointRepository: Repository<SalePoint>,

    @Inject(LoggerService)
    private readonly loggerService: LoggerService
  ) { }

  /**
   * Creates a new sale point and emits an audit log entry.
   *
   * @param userId - ID of the user performing the operation.
   * @param createSalePointDto - DTO with sale point fields.
   * @returns Object with errorCode and the persisted salePoint.
   */
  async create(userId: number, createSalePointDto: CreateSalePointDto) {
    try {
      const salePoint = this.salePointRepository.create(createSalePointDto);
      await this.salePointRepository.save(salePoint);
      this.loggerService.saveSalePointLogger({ id: salePoint.id, userId, typeOperation: TypeOperation.CREATE, salePoint });
      return { errorCode: ErrorCode.NONE, salePoint };
    } catch (error) {
      handleDbExceptions(error, this.logger);
    }
  }

  /**
   * Checks whether a sale point exists for the given userId.
   *
   * @param userId - ID of the user to check.
   * @returns Object with errorCode and a boolean exists flag.
   */
  async existsByUserId(userId: number) {
    try {
      const salePoint = await this.salePointRepository.findOne({
        where: { userId },
        select: ['id'],
      });
      return { errorCode: ErrorCode.NONE, exists: !!salePoint };
    } catch (error) {
      this.logger.error(`Error checking if sale point exists for userId ${userId}: ${error.message}`);
      return { errorCode: ErrorCode.UNKNOWN, exists: false };
    }
  }

  /**
   * Returns all sale points matching the given filters, enriched with the
   * user's latest mobile location (for mode=1 sale points) via a lateral-style
   * subquery on the `L` tracking table.
   *
   * @param filterDto - Filters (userId, search, zoneId, blockId, isApproved).
   * @returns Object with errorCode and the salePoints array.
   */
  async findAll(filterDto: FilterDto) {
    try {
      const query = this.salePointRepository.createQueryBuilder('sp')
        .select([
          'sp.id', 'sp.userId',
          'sp.type', 'sp.mode', 'sp.lt', 'sp.lg', 'sp.title', 'sp.subTitle',
          'sp.alias', 'sp.names', 'sp.number', 'sp.email',
          'sp.countryCode', 'sp.phone',
          'sp.qr', 'sp.isApproved', 'sp.userIdApproved', 'sp.billing_data',
          'z.id', 'z.name',
          'bl.id', 'bl.name',
        ])
        .leftJoin('sp.zone', 'z')
        .leftJoin('sp.block', 'bl')
        .leftJoin(
          (subQuery) => subQuery
            .select('l_inner.userId', 'userId')
            .addSelect('l_inner.latitude', 'latitude')
            .addSelect('l_inner.longitude', 'longitude')
            .from(L, 'l_inner')
            .distinctOn(['l_inner.userId'])
            .orderBy('l_inner.userId')
            .addOrderBy('l_inner.timestamp', 'DESC'),
          'l',
          'l."userId" = sp.userId AND sp.mode = 1',
        )
        .addSelect('l.latitude', 'latitudeMobible')
        .addSelect('l.longitude', 'longitudeMobible');

      const { conditions, parameters } = this._buildFilterConditions(filterDto);
      if (conditions.length) {
        query.andWhere(conditions.join(' AND '), parameters);
      }

      query.orderBy('sp.id', 'DESC');

      const { entities, raw } = await query.getRawAndEntities();
      const salePoints = entities.map((entity, index) => {
        const rawRow = raw[index];
        if (rawRow) {
          (entity as any).latitudeMobible = rawRow.latitudeMobible;
          (entity as any).longitudeMobible = rawRow.longitudeMobible;
        }
        return entity;
      });

      return { errorCode: ErrorCode.NONE, salePoints };
    } catch (error) {
      handleDbExceptions(error, this.logger);
    }
  }

  /**
   * Returns a slim list of sale points (id, title, subTitle) matching the
   * given filters, with pagination applied.
   *
   * @param filterDto - Filters including limit/offset for pagination.
   * @returns Object with errorCode and the salePoints array.
   */
  async findAllFilter(filterDto: FilterDto) {
    try {
      const { limit = 20, offset = 0 } = filterDto;

      const query = this.salePointRepository.createQueryBuilder('sp')
        .select(['sp.id', 'sp.title', 'sp.subTitle']);

      const { conditions, parameters } = this._buildFilterConditions(filterDto);
      if (conditions.length) {
        query.andWhere(conditions.join(' AND '), parameters);
      }

      query.orderBy('sp.id', 'DESC').take(limit).skip(offset);

      const salePoints = await query.getMany();
      return { errorCode: ErrorCode.NONE, salePoints };
    } catch (error) {
      handleDbExceptions(error, this.logger);
    }
  }

  /**
   * Returns the total count of sale points matching the given filters.
   *
   * @param filterDto - Same filter options as findAll (pagination fields ignored).
   * @returns Object with errorCode and the total count.
   */
  async findAllTotal(filterDto: FilterDto) {
    try {
      const query = this.salePointRepository.createQueryBuilder('sp');

      const { conditions, parameters } = this._buildFilterConditions(filterDto);
      if (conditions.length) {
        query.andWhere(conditions.join(' AND '), parameters);
      }

      const total = await query.getCount();
      return { errorCode: ErrorCode.NONE, total };
    } catch (error) {
      handleDbExceptions(error, this.logger);
    }
  }

  /**
   * Updates a sale point by id and emits an audit log entry.
   *
   * @param userId - ID of the user performing the operation.
   * @param id - Numeric ID of the sale point to update.
   * @param updateSalePointDto - Partial DTO with updated fields.
   * @returns Object with errorCode and the updated salePoint.
   */
  async update(userId: number, id: number, updateSalePointDto: UpdateSalePointDto) {
    try {
      const salePoint = await this.salePointRepository.preload({ id, ...updateSalePointDto });
      if (salePoint) {
        await this.salePointRepository.save(salePoint);
        this.loggerService.saveSalePointLogger({ id: salePoint.id, userId, typeOperation: TypeOperation.UPDATE, salePoint });
        return { errorCode: ErrorCode.NONE, salePoint };
      }
    } catch (error) {
      handleDbExceptions(error, this.logger);
    }
  }

  /**
   * Builds WHERE conditions and their named parameters from the supplied filter.
   *
   * @param filterDto - Filter with optional userId, search, zoneId, blockId, isApproved.
   * @returns Object with conditions array and named parameters record.
   */
  private _buildFilterConditions(filterDto: FilterDto): { conditions: string[]; parameters: Record<string, any> } {
    const { userId, search, zoneId, blockId, isApproved } = filterDto;
    const conditions: string[] = [];
    const parameters: Record<string, any> = {};

    if (userId) {
      conditions.push('sp.userId = :userId');
      parameters['userId'] = userId;
    }

    if (search) {
      conditions.push('(sp.title ILIKE :search OR sp.subTitle ILIKE :search OR sp.names ILIKE :search)');
      parameters['search'] = `%${search}%`;
    }

    if (zoneId) {
      conditions.push('sp.zoneId = :zoneId');
      parameters['zoneId'] = zoneId;
    }

    if (blockId) {
      conditions.push('sp.blockId = :blockId');
      parameters['blockId'] = blockId;
    }

    if (isApproved) {
      conditions.push('sp.isApproved = :isApproved');
      parameters['isApproved'] = isApproved;
    }

    return { conditions, parameters };
  }
}
