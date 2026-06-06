import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { FilterDto } from 'src/common/dto/filter.dto';
import handleDbExceptions from 'src/common/exceptions/error.db.exception';
import { ErrorCode } from 'src/common/glob/error';
import { Repository } from 'typeorm';

import { Physic } from './entities/physic.entity';

/**
 * Service handling read operations over the `physic` table (physical parking
 * card usage records). Provides paginated listing and aggregate counters.
 */
@Injectable()
export class PhysicsService {
  private readonly logger = new Logger('PhysicsService');

  /**
   *
   * @param physicRepository
   */
  constructor(
    @InjectRepository(Physic)
    private readonly physicRepository: Repository<Physic>,
  ) {}

  /**
   * Retrieves a paginated list of physical card usage records.
   *
   * Runs a raw SQL query (no ORM query builder) with INNER JOINs to `zone`,
   * `block` and `slot`. Because the `physic` table only stores `zoneId` (no
   * `blockId`/`slotId`), the block/slot joins are made through the zone, which
   * naturally fans the rows out (one `physic` × N blocks × M slots). To return
   * one row per `physic`, the query uses `SELECT DISTINCT ON (p."id")` and the
   * `ORDER BY` picks the lowest `block.id` and `slot.id` as the representative
   * row. The reported `blockName`/`slotName` are therefore arbitrary and do not
   * necessarily reflect where the user actually parked.
   * Runs a raw SQL query (no ORM query builder) with an INNER JOIN to the
   * `zone` table, so only records pointing to an existing zone are returned.
   * The selected columns and response shape are kept identical to the previous
   * ORM-based implementation.
   *
   * @param filterDto Pagination (`limit`, `offset`) and optional filters
   *   (`userId`, `zoneId`, `search`, `dateFrom`, `timeByBlock`).
   * @returns Object with `errorCode` and the `physics` array of records.
   */
  async findAll(filterDto: FilterDto) {
    try {
      const { limit = 20, offset = 0 } = filterDto;

      const { whereClause, parameters } = this._buildRawFilter(filterDto);

      const sql = `
        SELECT DISTINCT ON (p."id")
          p."id",
          p."userId",
          p."zoneId",
          p."card",
          p."time",
          p."checkboxes",
          p."timeByBlock",
          TO_CHAR(p."registerAt", 'YYYY-MM-DD"T"HH24:MI:SS.MS') AS "registerAt",
          TO_CHAR(p."createdAt", 'YYYY-MM-DD"T"HH24:MI:SS.MS') AS "createdAt",
          TO_CHAR(p."updatedAt", 'YYYY-MM-DD"T"HH24:MI:SS.MS') AS "updatedAt",
          z.name AS "zoneName",
          b.name AS "blockName",
          b.id AS "blockId",
          s.slot AS "slotName",
          s.id AS "slotId"
        FROM "physic" p
        INNER JOIN "zone" z ON z."id" = p."zoneId"
        INNER JOIN "block" b ON b."zoneId" = z."id"
        INNER JOIN "slot" s ON s."blockId" = b."id"
        ${whereClause}
        ORDER BY p."id" DESC, b."id" ASC, s."id" ASC
        LIMIT $${parameters.length + 1} OFFSET $${parameters.length + 2}
      `;

      const physics = await this.physicRepository.query(sql, [
        ...parameters,
        limit,
        offset,
      ]);

      return { errorCode: ErrorCode.NONE, physics };
    } catch (error) {
      handleDbExceptions(error, this.logger);
    }
  }

  /**
   * Returns the count of distinct physical card identifiers matching the given
   * filters (i.e. unique card numbers, not unique records).
   *
   * @param filterDto Optional filters (`userId`, `zoneId`, `search`,
   *   `dateFrom`, `timeByBlock`).
   * @returns Object with `errorCode` and the numeric `total` of unique cards.
   */
  async findAllTotalUnique(filterDto: FilterDto) {
    try {
      const query = this.physicRepository
        .createQueryBuilder('p')
        .select('COUNT(DISTINCT p.card)', 'total');

      const { conditions, parameters } =
        this._buildConditionsAndParameters(filterDto);
      if (conditions.length) {
        query.andWhere(conditions.join(' AND '), parameters);
      }

      const result = await query.getRawOne<{ total: string }>();
      const total = parseInt(result.total, 10);

      return { errorCode: ErrorCode.NONE, total };
    } catch (error) {
      handleDbExceptions(error, this.logger);
    }
  }

  /**
   * Returns the total number of physical card records matching the given
   * filters (counts every row, not distinct cards).
   *
   * @param filterDto Optional filters (`userId`, `zoneId`, `search`,
   *   `dateFrom`, `timeByBlock`).
   * @returns Object with `errorCode` and the numeric `total`.
   */
  async findAllTotal(filterDto: FilterDto) {
    try {
      const query = this.physicRepository.createQueryBuilder('p');

      const { conditions, parameters } =
        this._buildConditionsAndParameters(filterDto);
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
   * Builds the TypeORM QueryBuilder conditions and named-parameter map for
   * the ORM-based query variants ({@link findAllTotalUnique},
   * {@link findAllTotal}).
   *
   * Uses named parameters (`:paramName`) compatible with QueryBuilder's
   * `andWhere` API.
   *
   * @param filterDto Optional filters to apply.
   * @returns Object with the `conditions` string array and the `parameters`
   *   named-parameter record.
   */
  private _buildConditionsAndParameters(filterDto: FilterDto) {
    const { userId, zoneId, search, dateFrom, timeByBlock } = filterDto;
    const conditions: string[] = [];
    const parameters: Record<string, any> = {};

    if (userId) {
      conditions.push('p.userId = :userId');
      parameters['userId'] = userId;
    }

    if (zoneId) {
      conditions.push('p.zoneId = :zoneId');
      parameters['zoneId'] = zoneId;
    }

    if (search) {
      conditions.push('p.card ILIKE :search');
      parameters['search'] = `%${search}%`;
    }

    if (dateFrom) {
      conditions.push('DATE(p.registerAt) = :dateFrom');
      parameters['dateFrom'] = dateFrom;
    }

    if (timeByBlock) {
      conditions.push('p.timeByBlock = :timeByBlock');
      parameters['timeByBlock'] = timeByBlock;
    }

    return { conditions, parameters };
  }

  /**
   * Builds the `WHERE` clause and positional parameter list for the raw SQL
   * variant of {@link findAll}.
   *
   * Column names are wrapped in double quotes because Postgres folds unquoted
   * identifiers to lowercase, which would break the camelCase columns of the
   * `physic` table (e.g. `"userId"`, `"zoneId"`).
   *
   * @param filterDto Optional filters (`userId`, `zoneId`, `search`,
   *   `dateFrom`, `timeByBlock`).
   * @returns The `whereClause` string (empty when no filters are provided) and
   *   the ordered `parameters` array aligned with the `$1..$N` placeholders.
   */
  private _buildRawFilter(filterDto: FilterDto): {
    whereClause: string;
    parameters: any[];
  } {
    const { userId, zoneId, search, dateFrom, timeByBlock } = filterDto;
    const conditions: string[] = [];
    const parameters: any[] = [];

    if (userId) {
      parameters.push(userId);
      conditions.push(`p."userId" = $${parameters.length}`);
    }

    if (zoneId) {
      parameters.push(zoneId);
      conditions.push(`p."zoneId" = $${parameters.length}`);
    }

    if (search) {
      parameters.push(search);
      conditions.push(`p."card" = $${parameters.length}`);
    }

    if (dateFrom) {
      parameters.push(dateFrom);
      conditions.push(`DATE(p."registerAt") = $${parameters.length}`);
    }

    if (timeByBlock) {
      parameters.push(timeByBlock);
      conditions.push(`p."timeByBlock" = $${parameters.length}`);
    }

    const whereClause = conditions.length
      ? `WHERE ${conditions.join(' AND ')}`
      : '';
    return { whereClause, parameters };
  }
}
