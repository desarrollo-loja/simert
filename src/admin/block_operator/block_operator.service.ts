import { Inject, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { BlockOperator } from 'src/admin/block_operator/entities/block_operator.entity';
import { FilterDto } from 'src/common/dto/filter.dto';
import handleDbExceptions from 'src/common/exceptions/error.db.exception';
import { ErrorCode } from 'src/common/glob/error';
import { TypeOperation } from 'src/common/glob/type/type_operation';
import { LoggerService } from 'src/common/logger.service.ts';
import { Repository } from 'typeorm';

import { CreateBlockOperatorDto } from './dto/create-block_operator.dto';
import { FindUniqueUsersBlockOperatorDto } from './dto/find-unique-users-block-operator.dto';
import { UpdateBlockOperatorDto } from './dto/update-block_operator.dto';

/**
 * Service for managing BlockOperator assignments — the link between a
 * municipal agent (operator/controller) and a parking Block. Handles
 * creation, update, listing (with pagination/filtering) and audit logging
 * via {@link LoggerService}.
 */
@Injectable()
export class BlockOperatorService {
  private readonly logger = new Logger('BlockOperatorService');

  /**
   *
   * @param blockOperatorRepository
   * @param loggerService
   */
  constructor(
    @InjectRepository(BlockOperator)
    private readonly blockOperatorRepository: Repository<BlockOperator>,

    @Inject(LoggerService)
    private readonly loggerService: LoggerService,
  ) {}

  /**
   * Creates a new block operator shift assignment and writes an audit log entry.
   *
   * @param userId - ID of the user performing the action (for audit logging).
   * @param createBlockOperatorDto - Payload with blockId, userId, from/to range and flags.
   * @returns Object with errorCode and the newly created {@link BlockOperator}.
   * @throws Rethrows database errors via handleDbExceptions.
   */
  async create(userId: number, createBlockOperatorDto: CreateBlockOperatorDto) {
    try {
      const blockOperator = this.blockOperatorRepository.create(
        createBlockOperatorDto,
      );
      await this.blockOperatorRepository.save(blockOperator);
      this.loggerService.saveBlockOperatorLogger({
        id: blockOperator.id,
        userId,
        typeOperation: TypeOperation.CREATE,
        blockOperator,
      });
      return { errorCode: ErrorCode.NONE, blockOperator };
    } catch (error) {
      handleDbExceptions(error, this.logger);
    }
  }

  /**
   * Returns all block operator shifts for the given block and date, with an
   * optional userId filter applied when provided.
   *
   * The date comparison adjusts for the UTC-5 offset used in the database
   * (`INTERVAL '5 hours'`) so that the local calendar date is matched correctly.
   *
   * @param filterDto - Filter options: blockId (required), date (required), userId (optional).
   * @returns Object with errorCode and the matching blockOperators array.
   * @throws Rethrows database errors via handleDbExceptions.
   */
  async findAll(filterDto: FilterDto) {
    const { blockId, date, userId } = filterDto;
    try {
      let blockOperatorsQuery = this.blockOperatorRepository
        .createQueryBuilder('bo')
        .select([
          'bo.id',
          'bo.isActivated',
          'bo.userId',
          'bo.blockId',
          'bo.isInitialized',
          'bo.isFinalized',
        ])
        .addSelect(
          `TO_CHAR(bo."from", 'YYYY-MM-DD"T"HH24:MI:SS.MS')`,
          'bo_from',
        )
        .addSelect(`TO_CHAR(bo."to", 'YYYY-MM-DD"T"HH24:MI:SS.MS')`, 'bo_to')
        .addSelect(
          `TO_CHAR(bo."dateInitialized", 'YYYY-MM-DD"T"HH24:MI:SS.MS')`,
          'bo_dateInitialized',
        )
        .addSelect(
          `TO_CHAR(bo."dateFinalized", 'YYYY-MM-DD"T"HH24:MI:SS.MS')`,
          'bo_dateFinalized',
        )
        .where('bo.blockId = :blockId', { blockId })
        .andWhere(
          "DATE(bo.from - INTERVAL '5 hours') <= DATE(:date) AND DATE(bo.to - INTERVAL '5 hours') >= DATE(:date)",
          { date },
        );

      if (userId) {
        blockOperatorsQuery = blockOperatorsQuery.andWhere(
          'bo.userId = :userId',
          { userId },
        );
      }

      const result = await blockOperatorsQuery.getRawAndEntities();
      const blockOperators = result.entities.map((entity, i) => ({
        ...entity,
        from: result.raw[i]?.bo_from ?? null,
        to: result.raw[i]?.bo_to ?? null,
        dateInitialized: result.raw[i]?.bo_dateInitialized ?? null,
        dateFinalized: result.raw[i]?.bo_dateFinalized ?? null,
      }));

      return { errorCode: ErrorCode.NONE, blockOperators };
    } catch (error) {
      handleDbExceptions(error, this.logger);
    }
  }

  /**
   * Returns all active block operator shifts for a specific user. A shift is
   * considered active when isActivated=true, isInitialized matches the filter
   * value (default false), and isFinalized matches the filter value (default false).
   *
   * @param filterDto - Filter options: userId (required), isInitialized (default false), isFinalized (default false).
   * @returns Object with errorCode and the matching blockOperators array (with joined block info).
   * @throws Rethrows database errors via handleDbExceptions.
   */
  async findAllActiveByUserId(filterDto: FilterDto) {
    const { userId, isInitialized = false, isFinalized = false } = filterDto;
    try {
      const result = await this.blockOperatorRepository
        .createQueryBuilder('bo')
        .select([
          'bo.id',
          'bo.isActivated',
          'bo.userId',
          'block.id',
          'block.name',
        ])
        .addSelect(
          `TO_CHAR(bo."from", 'YYYY-MM-DD"T"HH24:MI:SS.MS')`,
          'bo_from',
        )
        .addSelect(`TO_CHAR(bo."to", 'YYYY-MM-DD"T"HH24:MI:SS.MS')`, 'bo_to')
        .innerJoin('bo.block', 'block')
        .where('bo.userId = :userId', { userId })
        .andWhere('bo.isActivated = :isActivated', { isActivated: true })
        .andWhere('bo.isInitialized = :isInitialized', { isInitialized })
        .andWhere('bo.isFinalized = :isFinalized', { isFinalized })
        .getRawAndEntities();

      const blockOperators = result.entities.map((entity, i) => ({
        ...entity,
        from: result.raw[i]?.bo_from ?? null,
        to: result.raw[i]?.bo_to ?? null,
      }));

      return { errorCode: ErrorCode.NONE, blockOperators };
    } catch (error) {
      handleDbExceptions(error, this.logger);
    }
  }

  /**
   * Returns all block operator shifts for a given block that overlap the
   * specified date range. When dateFrom or dateTo is absent the corresponding
   * bound is left open.
   *
   * @param filterDto - Filter options: blockId (required), dateFrom (optional), dateTo (optional).
   * @returns Object with errorCode and the matching blockOperators array.
   * @throws Rethrows database errors via handleDbExceptions.
   */
  async findAllByBlockId(filterDto: FilterDto) {
    const { blockId, dateFrom, dateTo } = filterDto;
    try {
      const blockOperatorsQuery = this.blockOperatorRepository
        .createQueryBuilder('bo')
        .select([
          'bo.id',
          'bo.isActivated',
          'bo.userId',
          'bo.blockId',
          'bo.isInitialized',
          'bo.isFinalized',
        ])
        .addSelect(
          `TO_CHAR(bo."from", 'YYYY-MM-DD"T"HH24:MI:SS.MS')`,
          'bo_from',
        )
        .addSelect(`TO_CHAR(bo."to", 'YYYY-MM-DD"T"HH24:MI:SS.MS')`, 'bo_to')
        .where('bo.blockId = :blockId', { blockId });

      if (dateFrom) {
        blockOperatorsQuery.andWhere('DATE(bo.to) >= DATE(:dateFrom)', {
          dateFrom,
        });
      }

      if (dateTo) {
        blockOperatorsQuery.andWhere('DATE(bo.from) <= DATE(:dateTo)', {
          dateTo,
        });
      }

      const result = await blockOperatorsQuery.getRawAndEntities();
      const blockOperators = result.entities.map((entity, i) => ({
        ...entity,
        from: result.raw[i]?.bo_from ?? null,
        to: result.raw[i]?.bo_to ?? null,
      }));

      return { errorCode: ErrorCode.NONE, blockOperators };
    } catch (error) {
      handleDbExceptions(error, this.logger);
    }
  }

  /**
   * Applies a partial update to an existing block operator shift and writes
   * an audit log entry.
   *
   * @param userId - ID of the user performing the action (for audit logging).
   * @param id - Primary key of the shift to update.
   * @param updateBlockOperatorDto - Fields to update on the shift record.
   * @returns Object with errorCode and the updated {@link BlockOperator}, or undefined if not found.
   * @throws Rethrows database errors via handleDbExceptions.
   */
  async update(
    userId: number,
    id: number,
    updateBlockOperatorDto: UpdateBlockOperatorDto,
  ) {
    try {
      const blockOperator = await this.blockOperatorRepository.preload({
        id,
        ...updateBlockOperatorDto,
      });
      if (blockOperator) {
        await this.blockOperatorRepository.save(blockOperator);
        this.loggerService.saveBlockOperatorLogger({
          id: blockOperator.id,
          userId,
          typeOperation: TypeOperation.UPDATE,
          blockOperator,
        });
        return { errorCode: ErrorCode.NONE, blockOperator };
      }
    } catch (error) {
      handleDbExceptions(error, this.logger);
    }
  }

  /**
   * Returns the unique user IDs (with block and zone context) for shifts that
   * are currently active — NOW() is within the from–to window,
   * isInitialized=true, and isFinalized=false. Optionally scoped to specific
   * block IDs or a specific user.
   *
   * @param dto - Optional blockIds array and userId to restrict the query.
   * @returns Object with errorCode and the raw users array
   *   `{ userId, blockId, blockName, zoneId, zoneName }`.
   * @throws Rethrows database errors via handleDbExceptions.
   */
  async findUniqueUsers(dto: FindUniqueUsersBlockOperatorDto) {
    const { blockIds, userId } = dto;
    try {
      const query = this.blockOperatorRepository
        .createQueryBuilder('bo')
        .select('bo.userId', 'userId')
        .addSelect('block.id', 'blockId')
        .addSelect('block.name', 'blockName')
        .addSelect('zone.id', 'zoneId')
        .addSelect('zone.name', 'zoneName')
        .innerJoin('bo.block', 'block')
        .innerJoin('block.zone', 'zone')
        .where(`bo.from <= (NOW() AT TIME ZONE 'America/Guayaquil')`)
        .andWhere(`bo.to >= (NOW() AT TIME ZONE 'America/Guayaquil')`)
        .andWhere('bo.isInitialized = :isInitialized', { isInitialized: true })
        .andWhere('bo.isFinalized = :isFinalized', { isFinalized: false });

      if (blockIds?.length) {
        query.andWhere('bo.blockId IN (:...blockIds)', { blockIds });
      }

      if (userId) {
        query.andWhere('bo.userId = :userId', { userId });
      }

      const raw = await query
        .groupBy('bo.userId')
        .addGroupBy('block.id')
        .addGroupBy('block.name')
        .addGroupBy('zone.id')
        .addGroupBy('zone.name')
        .getRawMany<{
          userId: number;
          blockId: number;
          blockName: string;
          zoneId: number;
          zoneName: string;
        }>();

      return { errorCode: ErrorCode.NONE, users: raw };
    } catch (error) {
      handleDbExceptions(error, this.logger);
    }
  }

  /**
   * Returns all block operator shifts formatted as option objects for
   * select/dropdown components. Each item exposes `name`, `label`, `id`,
   * and `value` built from the shift's from–to date range.
   *
   * @returns Object with errorCode and the blockOperators options array.
   * @throws Rethrows database errors via handleDbExceptions.
   */
  async getBlockOperator() {
    try {
      const blockOperators = await this.blockOperatorRepository.find({
        order: { id: 'DESC' },
      });

      const result = blockOperators.map((bo) => {
        const name = `${bo.from} - ${bo.to}`;
        return { name, label: name, id: bo.id, value: bo.id };
      });

      return { errorCode: ErrorCode.NONE, blockOperators: result };
    } catch (error) {
      handleDbExceptions(error, this.logger);
    }
  }
}
