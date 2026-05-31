import { Inject, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { FilterDto } from 'src/common/dto/filter.dto';
import handleDbExceptions from 'src/common/exceptions/error.db.exception';
import { ErrorCode } from 'src/common/glob/error';
import { TypeOperation } from 'src/common/glob/type/type_operation';
import { LoggerService } from 'src/common/logger.service.ts';
import { QueryFailedError, Repository } from 'typeorm';

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
   * Returns `DESCRIPTIONUNIQUE`, `BATCHNUMBERUNIQUE` or `RANGEUNIQUE` when a
   * duplicate description / batch number / from-to constraint is violated.
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
      const uniqueErrorCode = this._mapUniqueViolation(error);
      if (uniqueErrorCode !== null) {
        return { errorCode: uniqueErrorCode };
      }
      handleDbExceptions(error, this.logger);
    }
  }

  /**
   * Updates an existing range by id and emits an audit log entry.
   *
   * Returns `DESCRIPTIONUNIQUE`, `BATCHNUMBERUNIQUE` or `RANGEUNIQUE` when a
   * duplicate description / batch number / from-to constraint is violated.
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
      const uniqueErrorCode = this._mapUniqueViolation(error);
      if (uniqueErrorCode !== null) {
        return { errorCode: uniqueErrorCode };
      }
      handleDbExceptions(error, this.logger);
    }
  }

  /**
   * Maps a PostgreSQL unique-violation error (code `23505`) to the matching
   * {@link ErrorCode}. Shared by `create` and `update` to avoid duplicating the
   * constraint-handling branch. Matching is done on the constraint name (not the
   * error `detail`) because PostgreSQL double-quotes camelCase column names such
   * as `batchNumber` in the detail text, which would break substring matching.
   * Returns `DESCRIPTIONUNIQUE` for `uqRangeDescription`, `BATCHNUMBERUNIQUE` for
   * `uqRangeBatchNumber`, `RANGEUNIQUE` for `uqRangeFromTo`, falls back to
   * `RANGEUNIQUE` when the constraint cannot be identified, and `null` when the
   * error is not a unique-violation (so the caller can delegate to
   * `handleDbExceptions`).
   *
   * @param error - Error thrown by TypeORM during save/preload.
   * @returns Matching {@link ErrorCode} or `null`.
   */
  private _mapUniqueViolation(error: unknown): ErrorCode | null {
    if (!(error instanceof QueryFailedError)) return null;
    const driverError = (error as any).driverError;
    if (driverError?.code !== '23505') return null;

    const constraint: string = driverError.constraint ?? '';
    this.logger.error(`Unique constraint violated: ${constraint}`);
    if (constraint === 'uqRangeDescription') return ErrorCode.DESCRIPTIONUNIQUE;
    if (constraint === 'uqRangeBatchNumber') return ErrorCode.BATCHNUMBERUNIQUE;
    if (constraint === 'uqRangeFromTo') return ErrorCode.RANGEUNIQUE;
    return ErrorCode.RANGEUNIQUE;
  }

  /**
   * Returns a paginated list of ranges with optional description search.
   *
   * @param filterDto - Pagination and search parameters.
   * @returns Object with errorCode and the matching ranges array.
   */
  async findAll(filterDto: FilterDto) {
    try {
      const { limit = 10, offset = 0, search, statusId } = filterDto;
      const query = this.rangeRepository.createQueryBuilder('range')
        .select([
          'range.id', 'range.from', 'range.to', 'range.isActivated',
          'range.description',
          'range.batchNumber', 'range.type', 'range.status',
        ])
        .addSelect(`TO_CHAR(range."authorizationDate", 'YYYY-MM-DD"T"HH24:MI:SS.MS')`, 'range_authorizationDate')
        .addSelect(`TO_CHAR(range."createdAt", 'YYYY-MM-DD"T"HH24:MI:SS.MS')`, 'range_createdAt')
        .addSelect(`TO_CHAR(range."updatedAt", 'YYYY-MM-DD"T"HH24:MI:SS.MS')`, 'range_updatedAt');

      if (search) {
        query.andWhere('range.description ILIKE :search', { search: `%${search}%` });
      }

      if (statusId) {
        query.andWhere('range.status = :statusId', { statusId });
      }

      query.take(limit).skip(offset).orderBy('range.id', 'DESC');

      const result = await query.getRawAndEntities();
      const ranges = result.entities.map((entity, i) => ({
        ...entity,
        authorizationDate: result.raw[i]?.range_authorizationDate ?? null,
        createdAt: result.raw[i]?.range_createdAt ?? null,
        updatedAt: result.raw[i]?.range_updatedAt ?? null,
      }));
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
