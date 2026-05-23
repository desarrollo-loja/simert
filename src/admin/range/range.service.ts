import { Inject, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { FilterDto } from 'src/common/dto/filter.dto';
import handleDbExceptions from 'src/common/exceptions/error.db.exception';
import { ErrorCode } from 'src/common/glob/error';
import { TypeOperation } from 'src/common/glob/type/type_operation';
import { LoggerService } from 'src/common/logger.service.ts';
import { Repository } from 'typeorm';

import { CreateRangeDto } from './dto/create-range.dto';
import { UpdateRangeDto } from './dto/update-range.dto';
import { Range } from './entities/range.entity';

/**
 * Service for managing Range records — the time-based pricing brackets that
 * define parking cost per fraction. Provides CRUD with audit logging via
 * {@link LoggerService}.
 */
@Injectable()
export class RangeService {

  private readonly logger = new Logger('rangeService');

  constructor(
    @InjectRepository(Range)
    private readonly rangeRepository: Repository<Range>,

    @Inject(LoggerService)
    private readonly loggerService: LoggerService,
  ) { }

  /**
   * Creates a new price range record and emits an audit log entry.
   *
   * @param userId - ID of the user performing the operation.
   * @param createRangeDto - DTO with the range fields.
   * @returns Object with errorCode and the persisted range.
   */
  async create(userId: number, createRangeDto: CreateRangeDto) {
    try {
      const rangeEntity = this.rangeRepository.create({ ...createRangeDto });
      const range = await this.rangeRepository.save(rangeEntity);
      this.loggerService.saveRangeLogger({ id: range.id, userId, typeOperation: TypeOperation.CREATE, range });

      return { errorCode: ErrorCode.NONE, range };
    } catch (error) {
      handleDbExceptions(error, this.logger);
    }
  }

  /**
   * Updates an existing range by id and emits an audit log entry.
   *
   * @param userId - ID of the user performing the operation.
   * @param id - Numeric ID of the range to update.
   * @param updateRangeDto - Partial DTO with updated fields.
   * @returns Object with errorCode and the updated range.
   * @throws Error when the range id is not found.
   */
  async update(userId: number, id: number, updateRangeDto: UpdateRangeDto) {
    try {
      const rangeEntity = await this.rangeRepository.preload({ id, ...updateRangeDto });

      if (!rangeEntity) {
        throw new Error('Range not found');
      }

      const range = await this.rangeRepository.save(rangeEntity);
      this.loggerService.saveRangeLogger({ id: range.id, userId, typeOperation: TypeOperation.UPDATE, range });

      return { errorCode: ErrorCode.NONE, range };
    } catch (error) {
      handleDbExceptions(error, this.logger);
    }
  }

  /**
   * Returns a paginated list of ranges with optional description search.
   *
   * @param filterDto - Pagination and search parameters.
   * @returns Object with errorCode and the matching ranges array.
   */
  async findAll(filterDto: FilterDto) {
    try {
      const { limit = 10, offset = 0, search } = filterDto;
      const query = this.rangeRepository.createQueryBuilder('range')
        .select([
          'range.id', 'range.from', 'range.to', 'range.isActivated',
          'range.createdAt', 'range.updatedAt', 'range.description',
          'range.batchNumber', 'range.type', 'range.status', 'range.authorizationDate',
        ]);

      if (search) {
        query.andWhere('range.description ILIKE :search', { search: `%${search}%` });
      }

      query.take(limit).skip(offset).orderBy('range.id', 'DESC');

      const ranges = await query.getMany();
      return { errorCode: ErrorCode.NONE, ranges };
    } catch (error) {
      handleDbExceptions(error, this.logger);
    }
  }

  /**
   * Verifies whether any existing range overlaps the supplied from/to bounds.
   * Uses a regex guard to skip rows with non-numeric from/to stored values.
   *
   * @param filterDto - Filter with from, to, and optional description search.
   * @returns Object with errorCode and the overlapping ranges array.
   */
  async verifyRange(filterDto: FilterDto) {
    try {
      const { search, from, to } = filterDto;
      const query = this.rangeRepository.createQueryBuilder('range')
        .select(['range.id', 'range.from', 'range.to'])
        .where(
          `(range."from" ~ '^[0-9]+$' AND range."to" ~ '^[0-9]+$')
            AND (
              (:from >= range.from::bigint AND :from <= range.to::bigint)
              OR
              (:to   >= range.from::bigint AND :to   <= range.to::bigint)
            )`,
          { from, to }
        );

      if (search) {
        query.andWhere('range.description ILIKE :search', { search: `%${search}%` });
      }

      const ranges = await query.getMany();
      return { errorCode: ErrorCode.NONE, ranges };
    } catch (error) {
      handleDbExceptions(error, this.logger);
    }
  }

  /**
   * Returns the total count of ranges matching an optional description search.
   *
   * @param filterDto - Filter with optional search string.
   * @returns Object with total count.
   */
  async findAllTotal(filterDto: FilterDto) {
    try {
      const { search } = filterDto;

      let sql = `SELECT COUNT(*) AS total FROM public.range r`;
      const conditions: string[] = [];
      const params: any[] = [];

      if (search) {
        params.push(`%${search}%`);
        conditions.push(`r.description ILIKE $${params.length}`);
      }

      if (conditions.length) {
        sql += ' WHERE ' + conditions.join(' AND ');
      }

      const result = await this.rangeRepository.query(sql, params);
      const total = result[0].total;

      return { total };
    } catch (error) {
      handleDbExceptions(error, this.logger);
    }
  }
}
