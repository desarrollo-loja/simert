import { Inject, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { RangeSalePoint } from 'src/admin/range-sale-point/entities/range-sale-point.entity';
import { FilterDto } from 'src/common/dto/filter.dto';
import handleDbExceptions from 'src/common/exceptions/error.db.exception';
import { ErrorCode } from 'src/common/glob/error';
import { LoggerService } from 'src/common/logger.service.ts';
import { DataSource, Repository } from 'typeorm';

import { CheckboxUser } from '../checkbox-user/entities/checkbox-user.entity';
import { CreateRangeSalePointTransactionDto } from './dto/create-range-sale-point-transaction.dto';
import { RangeSalePointTransaction } from './entities/range-sale-point-transaction.entity';

/** Number of parking checkboxes granted per unit sold in a transaction. */
const CHECKBOXES_PER_UNIT = 12;

/**
 * Service that manages RangeSalePointTransaction records — the purchase
 * events that increment a user's {@link CheckboxUser} balance. Handles
 * transactional creation (debit from RangeSalePoint stock, credit to
 * CheckboxUser) and paginated listing for the admin panel.
 */
@Injectable()
export class RangeSalePointTransactionService {
  private readonly logger = new Logger('RangeSalePointTransactionService');

  /**
   * Creates the service and injects its repositories and collaborators.
   *
   * @param rangeSalePointTransactionRepository Repository for the `RangeSalePointTransaction` entity.
   * @param rangeSalePointRepository Repository for the `RangeSalePoint` entity.
   * @param checkboxUserRepository Repository for the `CheckboxUser` entity.
   * @param loggerService Service used to persist audit log entries.
   * @param dataSource TypeORM data source used to run database transactions.
   */
  constructor(
    @InjectRepository(RangeSalePointTransaction)
    private readonly rangeSalePointTransactionRepository: Repository<RangeSalePointTransaction>,

    @InjectRepository(RangeSalePoint)
    private readonly rangeSalePointRepository: Repository<RangeSalePoint>,

    @InjectRepository(CheckboxUser)
    private readonly checkboxUserRepository: Repository<CheckboxUser>,

    @Inject(LoggerService)
    private readonly loggerService: LoggerService,

    private readonly dataSource: DataSource,
  ) {}

  /**
   * Returns a paginated list of transactions joined with sale point information.
   *
   * @param filterDto - Filters (userId, userIdBuy, userIdSell, rangeSalePointId,
   *   salePointId, dateFrom/dateTo, limit, offset).
   * @returns Object with errorCode and the transactions array.
   */
  async findAll(filterDto: FilterDto) {
    try {
      const { conditions, parameters } = this._buildSqlConditions(filterDto);

      // Alias every column so duplicate names across joined tables (id from rspt,
      // rsp and sp; description from rsp) don't collide in the result row. Without
      // these aliases the last column wins (sp.id overwrote rspt.id), which made
      // every transaction from the same sale point share the same `id` value and
      // caused Vue/q-table "Duplicate keys found" warnings + duplicated rendering.
      let sql = `
        SELECT
          rspt.id AS "id",
          rspt."userIdSell", rspt."userIdBuy", rspt.amount,
          TO_CHAR(rspt."createdAt", 'YYYY-MM-DD"T"HH24:MI:SS.MS') AS "createdAt",
          rsp.id AS "rangeSalePointId",
          rsp."available", rsp.sold, rsp.description AS "rangeDescription",
          sp.id AS "salePointId",
          sp.title, sp."subTitle", sp.type, sp.mode
        FROM public."rangeSalePointTransaction" rspt
        INNER JOIN public."rangeSalePoint" rsp ON rsp.id = rspt."rangeSalePointId"
        INNER JOIN public."salePoint" sp ON sp.id = rsp."salePointId"
      `;

      if (conditions.length > 0) {
        sql += ' WHERE ' + conditions.join(' AND ');
      }

      sql += ' ORDER BY rspt.id DESC';

      // Parameterize LIMIT/OFFSET to prevent SQL injection.
      if (filterDto.limit !== undefined && filterDto.limit !== null) {
        const safeLimit = Math.max(0, Math.floor(Number(filterDto.limit)) || 0);
        parameters.push(safeLimit);
        sql += ` LIMIT $${parameters.length}`;
      }

      if (filterDto.offset !== undefined && filterDto.offset !== null) {
        const safeOffset = Math.max(
          0,
          Math.floor(Number(filterDto.offset)) || 0,
        );
        parameters.push(safeOffset);
        sql += ` OFFSET $${parameters.length}`;
      }

      const transactions = await this.rangeSalePointTransactionRepository.query(
        sql,
        parameters,
      );
      return { errorCode: ErrorCode.NONE, transactions };
    } catch (error) {
      handleDbExceptions(error, this.logger);
    }
  }

  /**
   * Returns the total count of transactions matching the given filters.
   * Uses the same JOIN structure as {@link findAll} so filter aliases resolve correctly.
   *
   * @param filterDto - Same filter options as findAll (pagination fields ignored).
   * @returns Object with total count and errorCode.
   */
  async countAll(filterDto: FilterDto) {
    const { conditions, parameters } = this._buildSqlConditions(filterDto);

    let sql = `
      SELECT COUNT(*) as total
      FROM public."rangeSalePointTransaction" rspt
      INNER JOIN public."rangeSalePoint" rsp ON rsp.id = rspt."rangeSalePointId"
      INNER JOIN public."salePoint" sp ON sp.id = rsp."salePointId"
    `;

    if (conditions.length > 0) {
      sql += ' WHERE ' + conditions.join(' AND ');
    }

    sql += ';';

    try {
      const result = await this.rangeSalePointTransactionRepository.query(
        sql,
        parameters,
      );
      const total = result[0]?.total || 0;
      return { total: Number(total), errorCode: ErrorCode.NONE };
    } catch (error) {
      handleDbExceptions(error, this.logger);
    }
  }

  /**
   * Creates a range sale point transaction within a database transaction:
   * 1. Validates the range sale point exists and has sufficient stock.
   * 2. Acquires a pessimistic write lock on the range sale point row.
   * 3. Decrements sold count and saves the transaction record.
   * 4. Increments (or creates) the buyer's CheckboxUser balance.
   *
   * @param userId - ID of the operator initiating the sale.
   * @param createRangeSalePointTransactionDto - Transaction payload.
   * @returns Object with errorCode, message, created transaction, and updated rangeSalePoint.
   */
  async create(
    userId: number,
    createRangeSalePointTransactionDto: CreateRangeSalePointTransactionDto,
  ) {
    const { rangeSalePointId, amount, userIdBuy, userIdSell } =
      createRangeSalePointTransactionDto;

    const rangeSalePoint = await this.rangeSalePointRepository
      .createQueryBuilder('rsp')
      .select(['rsp.id', 'rsp.sold', 'salePoint.id'])
      .innerJoin('rsp.salePoint', 'salePoint')
      .where('rsp.id = :rangeSalePointId', { rangeSalePointId })
      .getOne();

    if (!rangeSalePoint) {
      return {
        errorCode: ErrorCode.NOT_FOUND,
        message: 'No se encontro el rango de venta',
      };
    }

    if (rangeSalePoint.sold - amount < 0) {
      return {
        errorCode: ErrorCode.NOT_FOUND,
        message: 'No hay valores suficientes para la venta',
      };
    }

    const queryRunner = this.dataSource.createQueryRunner();

    try {
      await queryRunner.connect();
      await queryRunner.startTransaction();

      const lockedRangeSalePoint = await queryRunner.manager
        .createQueryBuilder()
        .select('rsp')
        .from(RangeSalePoint, 'rsp')
        .where('rsp.id = :rangeSalePointId', {
          rangeSalePointId: rangeSalePoint.id,
        })
        .setLock('pessimistic_write')
        .getOne();

      if (!lockedRangeSalePoint) {
        throw new Error('REJECTED');
      }

      const transaction = this.rangeSalePointTransactionRepository.create({
        userIdBuy,
        userIdSell,
        amount,
        rangeSalePoint,
      });

      await queryRunner.manager.save(transaction);

      lockedRangeSalePoint.sold -= amount;
      await queryRunner.manager.save(lockedRangeSalePoint);

      await this._creditCheckboxUser(
        queryRunner,
        userIdBuy,
        amount * CHECKBOXES_PER_UNIT,
      );

      await queryRunner.commitTransaction();
      return {
        errorCode: ErrorCode.NONE,
        message: 'Transaccion exitosa',
        rangeSalePointTransaction: transaction,
        rangeSalePoint: lockedRangeSalePoint,
      };
    } catch (error) {
      await queryRunner.rollbackTransaction();
      handleDbExceptions(error, this.logger);
    } finally {
      await queryRunner.release();
    }

    return {
      errorCode: ErrorCode.NOT_VALID,
      message: 'Ocurrio un error al crear la transaccion',
    };
  }

  /**
   * Increments the buyer's checkbox balance by the given amount within the
   * active query runner transaction. Creates a new CheckboxUser record if
   * none exists for the buyer.
   *
   * @param queryRunner - Active query runner (already in a transaction).
   * @param userIdBuy - ID of the user receiving checkboxes.
   * @param checkboxesToAdd - Number of checkboxes to credit.
   */
  private async _creditCheckboxUser(
    queryRunner: any,
    userIdBuy: number,
    checkboxesToAdd: number,
  ) {
    const existingCheckboxUser = await this.checkboxUserRepository.findOne({
      where: { userId: userIdBuy },
    });

    if (existingCheckboxUser) {
      existingCheckboxUser.checkboxes += checkboxesToAdd;
      await queryRunner.manager.save(existingCheckboxUser);
    } else {
      const newCheckboxUser = this.checkboxUserRepository.create({
        userId: userIdBuy,
        checkboxes: checkboxesToAdd,
      });
      await queryRunner.manager.save(newCheckboxUser);
    }
  }

  /**
   * Builds a positional-parameter SQL WHERE fragment from the filter DTO.
   * Used by both {@link findAll} and {@link countAll}.
   *
   * @param filterDto - Filter options to translate into SQL conditions.
   * @returns Object with conditions array and positional parameters array.
   */
  private _buildSqlConditions(filterDto: FilterDto): {
    conditions: string[];
    parameters: any[];
  } {
    const {
      userId,
      userIdBuy,
      userIdSell,
      rangeSalePointId,
      dateFrom,
      dateTo,
      salePointId,
    } = filterDto;
    const conditions: string[] = [];
    const parameters: any[] = [];

    const addParam = (value: any): string => {
      parameters.push(value);
      return `$${parameters.length}`;
    };

    if (userId) {
      conditions.push(`rspt."userIdBuy" = ${addParam(userId)}`);
    }

    if (userIdBuy) {
      conditions.push(`rspt."userIdBuy" = ${addParam(userIdBuy)}`);
    }

    if (userIdSell) {
      conditions.push(`rspt."userIdSell" = ${addParam(userIdSell)}`);
    }

    if (rangeSalePointId) {
      conditions.push(
        `rspt."rangeSalePointId" = ${addParam(rangeSalePointId)}`,
      );
    }

    if (salePointId) {
      conditions.push(`rsp."salePointId" = ${addParam(salePointId)}`);
    }

    if (dateFrom && dateTo) {
      conditions.push(
        `rspt."createdAt" BETWEEN ${addParam(dateFrom)} AND ${addParam(dateTo)}`,
      );
    }

    return { conditions, parameters };
  }
}
