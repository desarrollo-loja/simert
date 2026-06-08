import { Inject, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { FilterDto } from 'src/common/dto/filter.dto';
import handleDbExceptions from 'src/common/exceptions/error.db.exception';
import { Configuration } from 'src/common/glob/configuration';
import { ErrorCode } from 'src/common/glob/error';
import { TypeOperation } from 'src/common/glob/type/type_operation';
import { LoggerService } from 'src/common/logger.service.ts';
import { Repository } from 'typeorm';

import { CreateRangeSalePointDto } from './dto/create-range-sale-point.dto';
import { UpdateRangeSalePointDto } from './dto/update-range-sale-point.dto';
import { RangeSalePoint } from './entities/range-sale-point.entity';

/**
 * Service for managing RangeSalePoint records — the inventory batches of
 * parking checkboxes available at a sale point. Provides CRUD, stock
 * tracking, and the lookup used when selling checkboxes to users.
 */
@Injectable()
export class RangeSalePointService {
  private readonly logger = new Logger('RangeSalePointService');

  /**
   * Creates a new RangeSalePointService instance.
   * @param rangeSalePointRepository Repository for accessing RangeSalePoint entities.
   * @param loggerService Service used to record audit and operation logs.
   */
  constructor(
    @InjectRepository(RangeSalePoint)
    private readonly rangeSalePointRepository: Repository<RangeSalePoint>,

    @Inject(LoggerService)
    private readonly loggerService: LoggerService,
  ) { }

  /**
   * Creates a new range sale point record and emits an audit log entry.
   *
   * @param userId - ID of the user performing the operation.
   * @param createRangeSalePointDto - DTO with range sale point fields.
   * @returns Object with errorCode and the persisted rangeSalePoint.
   */
  async create(
    userId: number,
    createRangeSalePointDto: CreateRangeSalePointDto,
  ) {
    try {
      const rangeSalePoint = this.rangeSalePointRepository.create(
        createRangeSalePointDto,
      );
      await this.rangeSalePointRepository.save(rangeSalePoint);
      this.loggerService.saveRangeSalePointLogger({
        id: rangeSalePoint.id,
        userId,
        typeOperation: TypeOperation.CREATE,
        rangeSalePoint,
      });
      return { errorCode: ErrorCode.NONE, rangeSalePoint };
    } catch (error) {
      handleDbExceptions(error, this.logger);
    }
  }

  /**
   * Returns a list of range sale points matching the given filters, with
   * createdAt/updatedAt formatted in America/Guayaquil timezone.
   *
   * @param filterDto - Filter with optional userId and salePointId.
   * @returns Object with errorCode and the rangeSalePoints array.
   */
  async findAll(filterDto: FilterDto) {
    try {
      const query = this.rangeSalePointRepository
        .createQueryBuilder('rsp')
        .addSelect(
          `TO_CHAR(rsp."createdAt", 'YYYY-MM-DD"T"HH24:MI:SS.MS')`,
          'rsp_createdAt',
        )
        .addSelect(
          `TO_CHAR(rsp."updatedAt" AT TIME ZONE 'UTC' AT TIME ZONE 'America/Guayaquil', 'YYYY-MM-DD HH24:MI:SS')`,
          'rsp_updatedAt',
        );

      const { conditions, parameters } = this._buildFilterConditions(filterDto);
      if (conditions.length) {
        query.andWhere(conditions.join(' AND '), parameters);
      }

      query.orderBy('rsp.id', 'DESC');

      const result = await query.getRawAndEntities();
      const rangeSalePoints = result.entities.map(
        (entity: RangeSalePoint, i: number) => ({
          ...entity,
          createdAt: result.raw[i]?.rsp_createdAt ?? null,
          updatedAt: result.raw[i]?.rsp_updatedAt ?? null,
        }),
      );

      return { errorCode: ErrorCode.NONE, rangeSalePoints };
    } catch (error) {
      handleDbExceptions(error, this.logger);
    }
  }

  /**
   * Returns the total count of range sale points matching the given filters.
   *
   * @param filterDto - Filter with optional userId and salePointId.
   * @returns Object with errorCode and the total count.
   */
  async findAllTotal(filterDto: FilterDto) {
    try {
      const query = this.rangeSalePointRepository.createQueryBuilder('rsp');

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
   * Calculates the available stock remaining at the configured maximum
   * (`Configuration.MAXIMO_PUNTO_VENTAS`) for the filtered sale points.
   *
   * @param filterDto - Filter with optional userId and salePointId.
   * @returns Object with errorCode, maximum, total stock sold, and available units.
   */
  async getAvailable(filterDto: FilterDto) {
    try {
      const query = this.rangeSalePointRepository.createQueryBuilder('rsp');

      const { conditions, parameters } = this._buildFilterConditions(filterDto);
      if (conditions.length) {
        query.andWhere(conditions.join(' AND '), parameters);
      }

      const result = await query
        .select('COALESCE(SUM(rsp.sold), 0)', 'availableSum')
        .getRawOne();

      const stock = parseInt(result.availableSum, 10);
      const maximum = Configuration.MAXIMO_PUNTO_VENTAS;
      const available = maximum - stock;

      return { errorCode: ErrorCode.NONE, maximum, stock, available };
    } catch (error) {
      handleDbExceptions(error, this.logger);
    }
  }

  /**
   * Returns a single range sale point by id with formatted timestamps.
   *
   * @param id - Numeric ID of the range sale point.
   * @returns Object with errorCode and the found rangeSalePoint (or null).
   */
  async findOne(id: number) {
    try {
      const rangeSalePoint = await this._findOneWithFormattedDates(id);
      return { errorCode: ErrorCode.NONE, rangeSalePoint };
    } catch (error) {
      handleDbExceptions(error, this.logger);
    }
  }

  /**
   * Updates a range sale point by id and emits an audit log entry.
   *
   * @param userId - ID of the user performing the operation.
   * @param id - Numeric ID of the range sale point to update.
   * @param updateRangeSalePointDto - Partial DTO with updated fields.
   * @returns Object with errorCode and the updated rangeSalePoint.
   */
  async update(
    userId: number,
    id: number,
    updateRangeSalePointDto: UpdateRangeSalePointDto,
  ) {
    try {
      const rangeSalePoint = await this.rangeSalePointRepository.preload({
        id,
        ...updateRangeSalePointDto,
      });
      if (rangeSalePoint) {
        await this.rangeSalePointRepository.save(rangeSalePoint);
        this.loggerService.saveRangeSalePointLogger({
          id: rangeSalePoint.id,
          userId,
          typeOperation: TypeOperation.UPDATE,
          rangeSalePoint,
        });
        return { errorCode: ErrorCode.NONE, rangeSalePoint };
      }
    } catch (error) {
      handleDbExceptions(error, this.logger);
    }
  }

  /**
   * Fetches a range sale point by id with createdAt/updatedAt formatted in
   * America/Guayaquil timezone.
   *
   * @param id - Numeric ID of the range sale point.
   * @returns The entity merged with formatted date strings, or null if not found.
   */
  private async _findOneWithFormattedDates(id: number) {
    const result = await this.rangeSalePointRepository
      .createQueryBuilder('rsp')
      .addSelect(
        `TO_CHAR(rsp."createdAt" AT TIME ZONE 'UTC' AT TIME ZONE 'America/Guayaquil', 'YYYY-MM-DD HH24:MI:SS')`,
        'rsp_createdAt',
      )
      .addSelect(
        `TO_CHAR(rsp."updatedAt" AT TIME ZONE 'UTC' AT TIME ZONE 'America/Guayaquil', 'YYYY-MM-DD HH24:MI:SS')`,
        'rsp_updatedAt',
      )
      .where('rsp.id = :id', { id })
      .getRawAndEntities();

    if (!result.entities.length) return null;

    return {
      ...result.entities[0],
      createdAt: result.raw[0]?.rsp_createdAt ?? null,
      updatedAt: result.raw[0]?.rsp_updatedAt ?? null,
    };
  }

  /**
   * Builds WHERE conditions and their bound parameters from the supplied filter.
   *
   * @param filterDto - Filter with optional userId and salePointId.
   * @returns Object with conditions array and named parameters record.
   */
  private _buildFilterConditions(filterDto: FilterDto): {
    conditions: string[];
    parameters: Record<string, any>;
  } {
    const { userId, salePointId } = filterDto;
    const conditions: string[] = [];
    const parameters: Record<string, any> = {};

    if (userId) {
      conditions.push('rsp.userId = :userId');
      parameters['userId'] = userId;
    }

    if (salePointId) {
      conditions.push('rsp.salePointId = :salePointId');
      parameters['salePointId'] = salePointId;
    }

    return { conditions, parameters };
  }
}
