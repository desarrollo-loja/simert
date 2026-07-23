import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { FilterDto } from 'src/common/dto/filter.dto';
import handleDbExceptions from 'src/common/exceptions/error.db.exception';
import { ErrorCode } from 'src/common/glob/error';
import { StatusFraction } from 'src/common/glob/status/status_fraction';
import { TypeSizeVehicle } from 'src/common/glob/type/type_size_vehicle';
import { Repository } from 'typeorm';

import { Fraction } from './entities/fraction.entity';

/**
 * Service for querying parking fractions, including paginated listings,
 * historical archive routing, and aggregated statistics reports.
 * All raw SQL identifiers starting with a digit are double-quoted per
 * PostgreSQL requirements.
 */
@Injectable()
export class FractionService {
  private readonly logger = new Logger('FractionService');

  /**
   * Creates the service with its required dependencies.
   *
   * @param fractionRepository TypeORM repository for the Fraction entity.
   */
  constructor(
    @InjectRepository(Fraction)
    private readonly fractionRepository: Repository<Fraction>,
  ) {}

  /**
   * Lists parking fractions with pagination, reading either from the live
   * `public.fraction` table or from a monthly historical archive when a
   * `year`/`month` period is requested.
   *
   * Source-table routing:
   * - No `year`/`month`           -> live `fraction` table.
   * - Valid period + archive exists -> `history."YYYY_MM_fraction"`.
   * - Invalid period, or archive not found yet -> empty result (`{ fractions: [] }`).
   *
   * The historical identifier is double-quoted because names starting with a
   * digit (e.g. `2025_05_fraction`) are invalid unquoted in PostgreSQL. The
   * unquoted variant is used only for the `information_schema` existence check.
   * Each filter is bound as a `$N` parameter via {@link _buildQueryParameters}.
   *
   * @param filterDto Filters and pagination: `year`, `month`, `limit` (default 10),
   *   `offset` (default 0), plus the conditions resolved by
   *   {@link _buildQueryParameters} (zoneId, blockId, slotId, statusId, search, etc.).
   * @returns `{ fractions, total, limit, offset }` with the matching rows and the
   *   total count, or `{ fractions: [] }` when the requested period is invalid or
   *   its archive does not exist.
   * @throws Delegates DB errors to {@link handleDbExceptions}.
   */
  async findAll(filterDto: FilterDto) {
    const { year, month, limit = 10, offset = 0 } = filterDto;

    try {
      let tableName = 'fraction';
      let tableExists = false;

      if (year && month) {
        if (!this._isValidYearMonth(year, month)) {
          return { fractions: [] };
        }
        const monthPadded = month.toString().padStart(2, '0');
        // Unquoted name for the existence check (information_schema lookup splits on '.').
        const historyTableName = `history.${year}_${monthPadded}_fraction`;
        tableExists = await this._tableExists(historyTableName);
        // Quoted name for the raw query: identifiers starting with a digit
        // (e.g. "2025_05_fraction") must be double-quoted or Postgres throws a syntax error.
        tableName = `history."${year}_${monthPadded}_fraction"`;
      }

      if (tableExists || (!year && !month)) {
        const { parameters, conditions } =
          this._buildQueryParameters(filterDto);
        // `availableCheckboxes` only exists on the live `fraction` table; the
        // monthly `history.*` archives predate it, so it is selected only when
        // querying the live table to avoid breaking historical queries.
        const availableCheckboxesCol =
          tableName === 'fraction' ? 'f."availableCheckboxes",' : '';
        let query = `
        SELECT f.id, f."userId", f."transactionId", f.time, f."typeFraction",
        f.plate, f.alias, f.tint, f.image, ${availableCheckboxesCol}
        TO_CHAR(f."createdAt", 'YYYY-MM-DD"T"HH24:MI:SS.MS') AS "createdAt",
        TO_CHAR(f."departureDate", 'YYYY-MM-DD"T"HH24:MI:SS.MS') AS "departureDate",
        f."timeByBlock",
        zone.id AS "zoneId", zone.name AS "zoneName",
        block.id AS "blockId", block.name AS "blockName",
        slot.id AS "slotId", slot.slot AS "slotName", slot."typeSlot"  as "typeSlot",
        status.id AS "statusId", status.name AS "statusName"
        FROM ${tableName} AS f
        INNER JOIN zone ON f."zoneId" = zone.id
        INNER JOIN block ON f."blockId" = block.id
        INNER JOIN slot ON f."slotId" = slot.id
        INNER JOIN status ON f."statusId" = status.id`;

        if (conditions.length > 0) {
          query += ' WHERE ' + conditions.join(' AND ');
        }

        const totalQuery =
          `SELECT COUNT(*) AS total FROM ${tableName} AS f   INNER JOIN slot ON f."slotId" = slot.id ` +
          (conditions.length > 0 ? ' WHERE ' + conditions.join(' AND ') : '');
        const totalResult = await this.fractionRepository.query(
          totalQuery,
          parameters,
        );
        const total = totalResult[0].total;

        parameters.push(limit, offset);
        const paramLimit = parameters.length - 1;
        const paramOffset = parameters.length;

        query += ` ORDER BY f.id DESC LIMIT $${paramLimit} OFFSET $${paramOffset};`;

        const fractions = await this.fractionRepository.query(
          query,
          parameters,
        );

        return { fractions, total, limit, offset };
      } else {
        return { fractions: [] };
      }
    } catch (error) {
      handleDbExceptions(error, this.logger);
    }
  }

  /**
   * Returns fractions from both the live `public.fraction` table and the
   * monthly historical archive (when it exists), combined via `UNION ALL`.
   * Routes to `history.<yyyy_mm>_fraction` when a valid year/month period is
   * supplied and the table exists.
   *
   * @param filterDto Filters including `year`, `month`, `limit`, `offset`,
   *   and the conditions resolved by {@link _buildQueryParameters}.
   * @returns `{ errorCode, fraction }` with the merged rows sorted by
   *   `createdAt` descending, or an empty array when the period is invalid.
   * @throws Delegates DB errors to {@link handleDbExceptions}.
   */
  async findFractionHistory(filterDto: FilterDto) {
    const { offset = 0, limit = 10, year, month } = filterDto;

    const { parameters, conditions } = this._buildQueryParameters(filterDto);

    try {
      let tableNameFraction = 'public.fraction';
      let tableExistsFraction = false;
      const schema = 'history';

      const params: any[] = [...parameters];
      const queryParts: string[] = [];

      if (year && month) {
        if (!this._isValidYearMonth(year, month)) {
          return { errorCode: ErrorCode.NONE, fraction: [] };
        }
        const monthPadded = month.toString().padStart(2, '0');

        // No quotes — used to check existence of the historical table.
        const tableNameForCheck = `${schema}.${year}_${monthPadded}_fraction`;
        tableExistsFraction = await this._tableExists(tableNameForCheck);

        if (tableExistsFraction) {
          // Wrap the table name in double quotes so Postgres preserves the
          // mixed-case identifier when querying the historical table.
          tableNameFraction = `${schema}."${year}_${monthPadded}_fraction"`;
        }
      }

      const addParam = (v: any) => {
        params.push(v);
        return `$${params.length}`;
      };

      const buildSelect = (fromTable: string) => {
        let q = `
        SELECT f.id, f."userId", f."transactionId", f.time, f."typeFraction",
        f.plate, f.alias, f.tint, f.image,
        TO_CHAR(f."createdAt", 'YYYY-MM-DD"T"HH24:MI:SS.MS') AS "createdAt",
        TO_CHAR(f."departureDate", 'YYYY-MM-DD"T"HH24:MI:SS.MS') AS "departureDate",
        f."timeByBlock",
        zone.id AS "zoneId", zone.name AS "zoneName",
        block.id AS "blockId", block.name AS "blockName",
        slot.id AS "slotId", slot.slot AS "slotName", slot."typeSlot"  as "typeSlot",
        status.id AS "statusId", status.name AS "statusName"
        FROM ${fromTable} f
        INNER JOIN zone ON zone.id = f."zoneId"
        INNER JOIN block ON block.id = f."blockId"
        INNER JOIN slot ON slot.id = f."slotId"
        INNER JOIN status ON f."statusId" = status.id
      `;

        if (conditions.length > 0) {
          q += ' WHERE ' + conditions.join(' AND ');
        }

        return q;
      };

      // Include historical archive rows when the archive table exists.
      if (tableExistsFraction) {
        queryParts.push(buildSelect(tableNameFraction));
      }

      // Always include the live table filtered by the same conditions.
      queryParts.push(buildSelect('public.fraction'));

      if (queryParts.length === 0) {
        return { errorCode: ErrorCode.NONE, fraction: [] };
      }

      let query = queryParts.join(' UNION ALL ');
      query += `
      ORDER BY "createdAt" DESC
      LIMIT ${addParam(limit)} OFFSET ${addParam(offset)};
    `;

      const fraction = await this.fractionRepository.query(query, params);
      return { errorCode: ErrorCode.NONE, fraction };
    } catch (error) {
      handleDbExceptions(error, this.logger);
    }
  }

  /**
   * Converts a UTC date range to a target timezone offset for use in queries.
   *
   * @param startUTC ISO date string for the range start (interpreted as UTC).
   * @param endUTC ISO date string for the range end (interpreted as UTC).
   * @param timeZone Offset string in the form `+HH:MM` or `-HH:MM`.
   * @returns `{ start, end }` formatted as `YYYY-MM-DD HH:mm:ss`, or empty
   *   strings if parsing fails.
   */
  private _convertRangeToTimeZone = (
    startUTC: string,
    endUTC: string,
    timeZone: string,
  ): { start: string; end: string } => {
    try {
      // Extract hours and minutes from the timezone string (e.g. "-05:00").
      const [sign, hours, minutes] =
        timeZone.match(/([+-])(\d{2}):(\d{2})/)?.slice(1) || [];
      const timeZoneOffset =
        (parseInt(hours) * 60 + parseInt(minutes)) * (sign === '-' ? 1 : -1);

      // "Z" forces UTC interpretation.
      const startDateUTC = new Date(startUTC + 'Z');
      const endDateUTC = new Date(endUTC + 'Z');

      const startDateInTimeZone = new Date(
        startDateUTC.getTime() + timeZoneOffset * 60 * 1000,
      );
      const endDateInTimeZone = new Date(
        endDateUTC.getTime() + timeZoneOffset * 60 * 1000,
      );

      const formatDate = (date: Date) =>
        date.getUTCFullYear() +
        '-' +
        String(date.getUTCMonth() + 1).padStart(2, '0') +
        '-' +
        String(date.getUTCDate()).padStart(2, '0') +
        ' ' +
        String(date.getUTCHours()).padStart(2, '0') +
        ':' +
        String(date.getUTCMinutes()).padStart(2, '0') +
        ':' +
        String(date.getUTCSeconds()).padStart(2, '0');

      return {
        start: formatDate(startDateInTimeZone),
        end: formatDate(endDateInTimeZone),
      };
    } catch {
      return { start: '', end: '' };
    }
  };

  /**
   * Returns aggregated totals: unique vehicles, unique clients, and total
   * parking time for the filtered set of fractions.
   *
   * @param filterDto Filters including optional year/month period and
   *   the conditions resolved by {@link _buildQueryParameters}.
   * @returns `{ fractions }` with one aggregate row, or `{ fractions: [] }`
   *   when the period is invalid or no archive table was found.
   */
  async findAllTotalVehicleClientTime(filterDto: FilterDto) {
    const { year, month } = filterDto;
    try {
      const { tableName, tableExists, invalid } =
        await this._resolveStatisticsFractionTable(year, month);
      if (invalid) {
        return { fractions: [] };
      }
      if (tableExists || (!year && !month)) {
        const { parameters, conditions } =
          this._buildQueryParameters(filterDto);
        let query = `
          SELECT
          COUNT(DISTINCT f.plate) AS totalVehicle,
          COUNT(DISTINCT f."userId") AS totalClient,
            TO_CHAR(
      SUM(EXTRACT(EPOCH FROM f.time)) * INTERVAL '1 second',
      'HH24:MI:SS'
    ) AS "totaltime"
          FROM ${tableName} f
          INNER JOIN slot ON f."slotId" = slot.id
        `;

        if (conditions.length > 0) {
          query += ' WHERE ' + conditions.join(' AND ');
        }
        const fractions = await this.fractionRepository.query(
          query,
          parameters,
        );
        return { fractions };
      } else {
        return { fractions: [] };
      }
    } catch (error) {
      this.logger.error(`findAllTotalVehicleClientTime error: ${error}`);
    }
  }

  /**
   * Returns occupation and rotation metrics: total parkings, average time,
   * occupied slots vs. total slots in the filtered zone/block/slot.
   *
   * @param filterDto Filters including optional year/month period, zoneId,
   *   blockId, slotId, and the conditions resolved by {@link _buildQueryParameters}.
   * @returns `{ fractions }` with one row containing `totalSlot`, `occupation`
   *   (%), and `rotation`, or `{ fractions: [] }` when no data is found.
   */
  async findAllTotalOccupationRotationParking(filterDto: FilterDto) {
    const { year, month, zoneId, blockId, slotId } = filterDto;
    try {
      const { tableName, tableExists, invalid } =
        await this._resolveStatisticsFractionTable(year, month);
      if (invalid) {
        return { fractions: [] };
      }
      if (tableExists || (!year && !month)) {
        const slotParameters: number[] = [];
        const slotConditions: string[] = [];

        const addSlotParam = (value: number) => {
          slotParameters.push(value);
          return `$${slotParameters.length}`;
        };

        if (zoneId) {
          slotConditions.push(`"zoneId" = ${addSlotParam(zoneId)}`);
        }
        if (blockId) {
          slotConditions.push(`"blockId" = ${addSlotParam(blockId)}`);
        }
        if (slotId) {
          // The slot table's primary key is "id"; "slotId" only exists on the fraction table.
          slotConditions.push(`"id" = ${addSlotParam(slotId)}`);
        }

        let queryTotalSlot = `SELECT COUNT(*) AS total FROM slot`;
        if (slotConditions.length > 0) {
          queryTotalSlot += ' WHERE ' + slotConditions.join(' AND ');
        }
        const totalSlot = await this.fractionRepository.query(
          queryTotalSlot,
          slotParameters,
        );
        const total = totalSlot[0].total;

        const { parameters, conditions } =
          this._buildQueryParameters(filterDto);
        let query = `
          SELECT
            COUNT(*) AS "totalParking",
            TO_CHAR(
                AVG(EXTRACT(EPOCH FROM f.time)) * INTERVAL '1 second',
                'HH24:MI:SS'
            ) AS avgTime,
            COUNT(DISTINCT f."slotId") AS "totalSlotOccupation"
          FROM ${tableName} f
          INNER JOIN slot ON f."slotId" = slot.id
        `;

        if (conditions.length > 0) {
          query += ' WHERE ' + conditions.join(' AND ');
        }
        const fractions = await this.fractionRepository.query(
          query,
          parameters,
        );

        if (fractions.length > 0) {
          fractions[0].totalSlot = total;
          fractions[0].occupation = (
            (+fractions[0].totalSlotOccupation * 100) /
            +total
          ).toFixed(2);
          fractions[0].rotation = (+fractions[0].totalParking / +total).toFixed(
            2,
          );
        }
        return { fractions };
      } else {
        return { fractions: [] };
      }
    } catch (error) {
      this.logger.error(
        `findAllTotalOccupationRotationParking error: ${error}`,
      );
    }
  }

  /**
   * Returns fraction counts grouped by zone/block/time for general
   * statistics reporting.
   *
   * @param filterDto Filters including optional year/month period and
   *   the conditions resolved by {@link _buildQueryParameters}.
   * @returns `{ fractions }` with grouped aggregate rows, or `{ fractions: [] }`.
   * @throws Delegates DB errors to {@link handleDbExceptions}.
   */
  async findAllStatistics(filterDto: FilterDto) {
    const { year, month } = filterDto;
    try {
      const { tableName, tableExists, invalid } =
        await this._resolveStatisticsFractionTable(year, month);
      if (invalid) {
        return { fractions: [] };
      }

      if (tableExists || (!year && !month)) {
        const { parameters, conditions } =
          this._buildQueryParameters(filterDto);
        let query = `
          SELECT z.id AS "idZone", z.name AS "nameZone", b.id AS "idBlock", b.name AS "nameBlock", f.time,
          COUNT(f."zoneId") AS "totalZone",
          COUNT(f."blockId") AS "totalBlock",
          COUNT(f.time) AS "totalTime"

          FROM ${tableName} f
          INNER JOIN "zone" z ON z."id" = f."zoneId"
          INNER JOIN "block" b ON b."id" = f."blockId"
          INNER JOIN "slot" ON f."slotId" = slot.id

        `;
        if (conditions.length > 0) {
          query += ' WHERE ' + conditions.join(' AND ');
        }

        query += `   GROUP BY     z."id", z.name,    b."id", b.name, f.time ; `;
        const fractions = await this.fractionRepository.query(
          query,
          parameters,
        );
        return { fractions };
      } else {
        return { fractions: [] };
      }
    } catch (error) {
      handleDbExceptions(error, this.logger);
    }
  }

  /**
   * Returns daily fraction counts grouped by status for a date range or period.
   *
   * Source-table routing (only the FROM source is built dynamically; the
   * aggregation SELECT, filters, GROUP BY and ORDER BY are identical across
   * every branch):
   * - `dateFrom` + `dateTo` (current front-end contract) -> dynamically
   *   `UNION ALL`s every monthly archive `history."YYYY_MM_fraction"` whose
   *   month falls within the range and that already exists, plus the live
   *   `public.fraction` table only when `dateTo` is within the last 3 days, so
   *   the most recent, not-yet-archived rows are still counted. See
   *   {@link _buildStatisticsFractionRangeSource}.
   * - Legacy `year`/`month` period -> single `history."YYYY_MM_fraction"`
   *   archive when it exists, otherwise the live `public.fraction` table.
   * - No range and no period -> live `public.fraction` table.
   *
   * @param filterDto Filters including the `dateFrom`/`dateTo` range, the legacy
   *   `year`/`month` period and the conditions resolved by
   *   {@link _buildQueryParameters}.
   * @returns `{ errorCode, fractions }` with per-day status counts,
   *   or `{ errorCode: NOT_FOUND, message }` when no rows match or no source
   *   table is available for the requested range.
   * @throws Delegates DB errors to {@link handleDbExceptions}.
   */
  async findStatisticsFractions(filterDto: FilterDto) {
    try {
      const { year, month, dateFrom, dateTo } = filterDto;

      // Current front-end contract: a date range that may span several months.
      // Build the data source dynamically from the monthly archives in range
      // plus the live table when the range reaches the most recent days.
      if (dateFrom && dateTo) {
        const fromSource = await this._buildStatisticsFractionRangeSource(
          dateFrom,
          dateTo,
        );
        if (!fromSource) {
          return {
            errorCode: ErrorCode.NOT_FOUND,
            message: 'No se encontraron resultados',
          };
        }
        return await this._runStatisticsFractionQuery(fromSource, filterDto);
      }

      // Legacy single-period routing (year/month) with live-table fallback.
      let tableName = 'public.fraction';
      let tableExists = false;
      const schema = 'history';

      if (year && month) {
        if (!this._isValidYearMonth(year, month)) {
          return {
            errorCode: ErrorCode.NOT_FOUND,
            message: 'No se encontraron resultados',
          };
        }
        const monthPadded = month.toString().padStart(2, '0');
        const tableNameAux = `${schema}."${year}_${monthPadded}_fraction"`;
        tableExists = await this._tableExists(tableNameAux);
        if (tableExists) tableName = tableNameAux;
      }

      return await this._runStatisticsFractionQuery(tableName, filterDto);
    } catch (error) {
      handleDbExceptions(error, this.logger);
    }
  }

  /**
   * Executes the daily status-count aggregation against the supplied FROM
   * source (a single table name or a parenthesized `UNION ALL` subquery) using
   * the filters from {@link _buildQueryParameters}, and shapes the standard
   * response.
   *
   * @param fromSource Table identifier or parenthesized subquery aliased as `f`.
   * @param filterDto Filters resolved into parameterized WHERE conditions.
   * @returns `{ errorCode, message, fractions }`, or
   *   `{ errorCode: NOT_FOUND, message }` when the query returns no rows.
   */
  private async _runStatisticsFractionQuery(
    fromSource: string,
    filterDto: FilterDto,
  ) {
    const { parameters, conditions } = this._buildQueryParameters(filterDto);
    const query = this._buildStatisticsFractionQuery(fromSource, conditions);
    const fractions = await this.fractionRepository.query(query, parameters);

    if (fractions.length === 0)
      return {
        errorCode: ErrorCode.NOT_FOUND,
        message: 'No se encontraron resultados',
      };
    return {
      errorCode: ErrorCode.NONE,
      message: 'Resultados encontrados',
      fractions,
    };
  }

  /**
   * Builds the daily status-count aggregation SQL for fractions over the given
   * FROM source. The SELECT list, GROUP BY and ORDER BY are fixed; only the
   * source table/subquery and the optional WHERE conditions vary.
   *
   * @param fromSource Table identifier or parenthesized subquery aliased as `f`.
   * @param conditions Parameterized WHERE fragments from
   *   {@link _buildQueryParameters} (joined with AND when present).
   * @returns The complete raw SQL string ready for `repository.query`.
   */
  private _buildStatisticsFractionQuery(
    fromSource: string,
    conditions: string[],
  ): string {
    let query = `
              SELECT
                TO_CHAR(f."createdAt", 'YYYY-MM-DD') AS date,
                COUNT(CASE WHEN f."statusId" = ${StatusFraction.REQUESTED} THEN 1 END) AS requested,
                COUNT(CASE WHEN f."statusId" = ${StatusFraction.RESERVERD} THEN 1 END) AS reserved,
                COUNT(CASE WHEN f."statusId" = ${StatusFraction.ACTIVE} THEN 1 END) AS active,
                COUNT(CASE WHEN f."statusId" = ${StatusFraction.INCREMENTED} THEN 1 END) AS incremented,
                COUNT(CASE WHEN f."statusId" = ${StatusFraction.FINISHED_BY_OPERATOR} THEN 1 END) AS finished_by_operator,
                COUNT(CASE WHEN f."statusId" = ${StatusFraction.NEXT_TO_EXCEEDED_TIME} THEN 1 END) AS next_to_exceeded,
                COUNT(CASE WHEN f."statusId" = ${StatusFraction.EXCEEDED_TIME} THEN 1 END) AS exceeded_time,
                COUNT(CASE WHEN f."statusId" = ${StatusFraction.SANCTIONED} THEN 1 END) AS sanctioned,
                COUNT(CASE WHEN f."statusId" = ${StatusFraction.CANCELED} THEN 1 END) AS canceled,
                COUNT(CASE WHEN f."statusId" = ${StatusFraction.FINISHED} THEN 1 END) AS finish,
                COUNT(CASE WHEN f."statusId" = ${StatusFraction.FINISHED_BY_INCREMENT} THEN 1 END) AS finished_by_increment,
                COUNT(CASE WHEN f."statusId" = ${StatusFraction.FINISHED_BY_CONTROLLER} THEN 1 END) AS finished_by_controller,
                COUNT(CASE WHEN f."statusId" = ${StatusFraction.RATED_CLIENT} THEN 1 END) AS rated_client,
                COUNT(CASE WHEN f."statusId" = ${StatusFraction.ERROR} THEN 1 END) AS error
              FROM ${fromSource} f
      `;

    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }

    query += ` GROUP BY TO_CHAR(f."createdAt", 'YYYY-MM-DD') ORDER BY date;`;
    return query;
  }

  /**
   * Builds the dynamic FROM source for a date-range statistics query: a
   * `UNION ALL` of every monthly archive `history."YYYY_MM_fraction"` whose
   * month falls within [`dateFrom`, `dateTo`] and that already exists, plus the
   * live `public.fraction` table when `dateTo` is within the last 3 days (so
   * recent, not-yet-archived rows are still counted).
   *
   * Every UNION branch projects the same fixed column list, so the rows stay
   * union-compatible regardless of incidental column drift between the archives
   * and the live table. The result is parenthesized to be aliased as `f`.
   *
   * @param dateFrom Inclusive range start (`YYYY-MM-DD`).
   * @param dateTo Inclusive range end (`YYYY-MM-DD`).
   * @returns The parenthesized `UNION ALL` subquery, or `null` when no archive
   *   in range exists and the live table is not eligible.
   */
  private async _buildStatisticsFractionRangeSource(
    dateFrom: string,
    dateTo: string,
  ): Promise<string | null> {
    const schema = 'history';
    const columns =
      '"createdAt", "statusId", "register", "plate", "typeFraction", "zoneId", "blockId", "slotId", "userId"';

    const selects: string[] = [];

    for (const { year, month } of this._enumerateRangeMonths(
      dateFrom,
      dateTo,
    )) {
      const monthPadded = month.toString().padStart(2, '0');
      const historicalTable = `${schema}."${year}_${monthPadded}_fraction"`;
      if (await this._tableExists(historicalTable)) {
        selects.push(`SELECT ${columns} FROM ${historicalTable}`);
      }
    }

    // Include the transactional table only when the range reaches the last 3 days.
    if (this._isDateWithinLastDays(dateTo, 3)) {
      selects.push(`SELECT ${columns} FROM public.fraction`);
    }

    if (selects.length === 0) {
      return null;
    }

    return `(${selects.join(' UNION ALL ')})`;
  }

  /**
   * Enumerates every `{ year, month }` between two dates, inclusive of both the
   * start and end months. Used to resolve which monthly history archives a
   * date-range query must read.
   *
   * @param dateFrom Range start (`YYYY-MM-DD`); only year and month are used.
   * @param dateTo Range end (`YYYY-MM-DD`); only year and month are used.
   * @returns Ordered list of months in range, or an empty array when either
   *   bound is missing/invalid or `dateFrom` is after `dateTo`.
   */
  private _enumerateRangeMonths(
    dateFrom: string,
    dateTo: string,
  ): { year: number; month: number }[] {
    const from = this._extractYearMonth(dateFrom);
    const to = this._extractYearMonth(dateTo);
    if (!from || !to) {
      return [];
    }

    const months: { year: number; month: number }[] = [];
    let year = from.year;
    let month = from.month;

    while (year < to.year || (year === to.year && month <= to.month)) {
      months.push({ year, month });
      month += 1;
      if (month > 12) {
        month = 1;
        year += 1;
      }
    }

    return months;
  }

  /**
   * Parses the leading `YYYY-MM` of a date string and validates it through
   * {@link _isValidYearMonth}, guarding against SQL injection before the values
   * are interpolated into historical table identifiers.
   *
   * @param value Date string expected to start with `YYYY-MM`.
   * @returns `{ year, month }` when valid, otherwise `null`.
   */
  private _extractYearMonth(
    value: string,
  ): { year: number; month: number } | null {
    if (!value) {
      return null;
    }
    const match = /^(\d{4})-(\d{2})/.exec(String(value));
    if (!match) {
      return null;
    }
    const year = Number(match[1]);
    const month = Number(match[2]);
    return this._isValidYearMonth(year, month) ? { year, month } : null;
  }

  /**
   * Checks whether a date falls within the last `days` days relative to today
   * (inclusive). Used to decide whether the live `public.fraction` table must
   * be included alongside the monthly archives.
   *
   * @param value Date string expected to start with `YYYY-MM-DD`.
   * @param days Size of the recent window in days.
   * @returns `true` when `value` is on or after `today - days`.
   */
  private _isDateWithinLastDays(value: string, days: number): boolean {
    const target = this._extractDate(value);
    if (!target) {
      return false;
    }
    const threshold = new Date();
    threshold.setHours(0, 0, 0, 0);
    threshold.setDate(threshold.getDate() - days);
    return target.getTime() >= threshold.getTime();
  }

  /**
   * Parses the leading `YYYY-MM-DD` of a string into a local `Date` at
   * midnight, ignoring any time/zone suffix.
   *
   * @param value Date string expected to start with `YYYY-MM-DD`.
   * @returns The parsed `Date`, or `null` when the format does not match.
   */
  private _extractDate(value: string): Date | null {
    const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value));
    if (!match) {
      return null;
    }
    const date = new Date(
      Number(match[1]),
      Number(match[2]) - 1,
      Number(match[3]),
    );
    date.setHours(0, 0, 0, 0);
    return date;
  }

  /**
   * Guards against SQL injection by validating year and month values before
   * they are interpolated into raw SQL table identifiers.
   *
   * @param year Value to validate as an integer in the range 2000–2100.
   * @param month Value to validate as an integer in the range 1–12.
   * @returns `true` when both values are in the accepted range.
   */
  private _isValidYearMonth(year: any, month: any): boolean {
    return (
      Number.isInteger(year) &&
      year >= 2000 &&
      year <= 2100 &&
      Number.isInteger(month) &&
      month >= 1 &&
      month <= 12
    );
  }

  /**
   * Resolves the fraction source table for the statistics reports that do not
   * qualify the historical table with a schema (`findAllTotalVehicleClientTime`,
   * `findAllTotalOccupationRotationParking`, `findAllStatistics`).
   *
   * NOTE: the historical name is intentionally built WITHOUT a schema prefix,
   * so `_tableExists` (which requires a schema) reports `false` for any
   * requested period. This preserves the long-standing behavior of these
   * reports: a valid year/month falls through to an empty result, and only the
   * live `fraction` table (no period requested) yields data.
   *
   * @param year Requested year (optional period filter).
   * @param month Requested month (optional period filter).
   * @returns The resolved table name, whether the historical table exists, and
   *   whether the supplied year/month failed validation.
   */
  private async _resolveStatisticsFractionTable(
    year: number,
    month: number,
  ): Promise<{ tableName: string; tableExists: boolean; invalid: boolean }> {
    let tableName = 'fraction';
    let tableExists = false;

    if (year && month) {
      if (!this._isValidYearMonth(year, month)) {
        return { tableName, tableExists, invalid: true };
      }
      const monthPadded = month.toString().padStart(2, '0');
      tableName = `${year}_${monthPadded}_fraction`;
      tableExists = await this._tableExists(tableName);
    }

    return { tableName, tableExists, invalid: false };
  }

  /**
   * Checks whether a fully-qualified table (`schema.tableName`) exists in
   * `information_schema.tables`.
   *
   * @param tableName Fully-qualified name in the form `schema.name`.
   * @returns `true` when the table exists, `false` when it does not or when
   *   no schema prefix was provided.
   */
  private async _tableExists(tableName: string): Promise<boolean> {
    const names = tableName.split('.');
    if (names.length <= 1) {
      this.logger.error(`Schema not specified in table ${tableName}`);
      return false;
    }

    const tableSchema: string = names[0];
    const tableNameOnly: string = names[1];

    const query = `
    SELECT EXISTS(
      SELECT 1
      FROM information_schema.tables
      WHERE table_schema = $1
        AND table_name = $2
    ) AS "exists";
  `;

    try {
      const result = await this.fractionRepository.query(query, [
        tableSchema,
        tableNameOnly,
      ]);
      return result[0].exists;
    } catch (error) {
      this.logger.error(error);
      return false;
    }
  }

  /**
   * Builds the parameterized WHERE conditions for fraction queries based on
   * the supplied filter DTO fields.
   *
   * @param filterDto Filter fields: plate search, statusId, typeFraction,
   *   zoneId, blockId, slotId, userId, timeByBlock, typeSize, typeSlot, and
   *   date ranges (either timezone-aware `fromCreatedAt`/`toCreatedAt` or
   *   plain `dateFrom`/`dateTo`).
   * @returns `{ parameters, conditions }` ready to be spliced into a raw
   *   SQL query with positional `$N` placeholders.
   */
  private _buildQueryParameters(filterDto: FilterDto): {
    parameters: any[];
    conditions: string[];
  } {
    const {
      typeFraction,
      zoneId,
      blockId,
      slotId,
      statusId,
      search,
      isTimeZone,
      dateFrom,
      typeSlot,
      dateTo,
      timeZoneUTC,
      fromCreatedAt,
      toCreatedAt,
      userId,
      typeSize,
      timeByBlock,
    } = filterDto;

    const conditions: string[] = [];
    const parameters: any[] = [];

    const addParam = (value: any) => {
      parameters.push(value);
      return `$${parameters.length}`;
    };

    if (search) {
      conditions.push(`f."plate" = ${addParam(search)}`);
    }

    if (statusId) {
      conditions.push(`f."statusId" = ${addParam(statusId)}`);
    }

    if (typeFraction) {
      conditions.push(`f."typeFraction" = ${addParam(typeFraction)}`);
    }

    if (zoneId) {
      conditions.push(`f."zoneId" = ${addParam(zoneId)}`);
    }

    if (blockId) {
      conditions.push(`f."blockId" = ${addParam(blockId)}`);
    }

    if (slotId) {
      conditions.push(`f."slotId" = ${addParam(slotId)}`);
    }

    if (userId) {
      conditions.push(`f."userId" = ${addParam(userId)}`);
    }

    if (timeByBlock) {
      conditions.push(`f."timeByBlock" = ${addParam(timeByBlock)}`);
    }

    if (typeSize) {
      if (
        typeSize === TypeSizeVehicle.VEHICLE ||
        typeSize === TypeSizeVehicle.OTHERS ||
        typeSize === TypeSizeVehicle.UNDEFINED
      ) {
        conditions.push(`f."plate" ~ '[0-9]$'`);
      } else if (typeSize === TypeSizeVehicle.BIKE) {
        conditions.push(`f."plate" ~ '[A-Za-z]$'`);
      }
    }

    if (typeSlot) {
      conditions.push(`slot."typeSlot" = ${addParam(Number(typeSlot))}`);
    }

    if (isTimeZone) {
      if (fromCreatedAt && toCreatedAt && timeZoneUTC) {
        // `createdAt` is stored in UTC, while `fromCreatedAt`/`toCreatedAt` are the
        // whole-day boundaries the client selected in its local time (e.g. Ecuador,
        // UTC-5). Translate that local range to its equivalent UTC window before
        // comparing, so rows are matched by the user's local day. Example for -05:00:
        // 2026-06-05 00:00:00 .. 2026-06-05 23:59:59 -> 2026-06-05 05:00:00 .. 2026-06-06 04:59:59 (UTC).
        const { start, end } = this._convertRangeToTimeZone(
          fromCreatedAt,
          toCreatedAt,
          timeZoneUTC,
        );
        conditions.push(
          `f."createdAt" BETWEEN ${addParam(start)} AND ${addParam(end)}`,
        );
      }
    } else {
      if (dateFrom && dateTo) {
        conditions.push(
          `DATE(f."register") BETWEEN ${addParam(dateFrom)} AND ${addParam(dateTo)}`,
        );
      }
    }

    return { parameters, conditions };
  }

  /**
   * Builds the parameterized SQL conditions for the given filters.
   *
   * @param filterDto Filters used to build the bound parameters and WHERE conditions.
   * @returns An object with the bound `parameters` array and the `conditions` clauses.
   * @deprecated Use {@link _buildQueryParameters} instead.
   * Kept as a pass-through alias so any external callers are not broken
   * while the codebase migrates to the renamed method.
   */
  buildParametersConditions = (filterDto: FilterDto) =>
    this._buildQueryParameters(filterDto);
}
