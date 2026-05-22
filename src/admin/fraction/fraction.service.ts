import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { FilterDto } from 'src/common/dto/filter.dto';
import handleDbExceptions from 'src/common/exceptions/error.db.exception';
import { ErrorCode } from 'src/common/glob/error';
import { StatusFraction } from 'src/common/glob/status/status_fraction';
import { TypeSizeVehicle } from 'src/common/glob/type/type_size_vehicle';
import { Repository } from 'typeorm';

import { Fraction } from './entities/fraction.entity';

@Injectable()
export class FractionService {
  private readonly logger = new Logger('SlotService');

  constructor(
    @InjectRepository(Fraction)
    private readonly fractionRepository: Repository<Fraction>,
  ) { }

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
   * Each filter is bound as a `$N` parameter via {@link buildParametersConditions}.
   *
   * @param filterDto Filters and pagination: `year`, `month`, `limit` (default 10),
   *   `offset` (default 0), plus the conditions resolved by
   *   {@link buildParametersConditions} (zoneId, blockId, slotId, statusId, search, etc.).
   * @returns `{ fractions, total, limit, offset }` with the matching rows and the
   *   total count, or `{ fractions: [] }` when the requested period is invalid or
   *   its archive does not exist.
   * @throws Delegates DB errors to {@link handleDbExceptions}.
   */
  async findAll(filterDto: FilterDto) {
    const { year, month,

      limit = 10, offset = 0 } = filterDto;

    try {
      let tableName = 'fraction';
      let tableExists = false;
      if (year && month) {
        if (!this._isValidYearMonth(year, month)) {
          return { fractions: [] };
        }
        const monthComplite = month.toString().padStart(2, '0')
        // Unquoted name for the existence check (information_schema lookup splits on '.').
        const historyTableName = `history.${year}_${monthComplite}_fraction`;
        tableExists = await this._tableExists(historyTableName);
        // Quoted name for the raw query: identifiers starting with a digit
        // (e.g. "2025_05_fraction") must be double-quoted or Postgres throws a syntax error.
        tableName = `history."${year}_${monthComplite}_fraction"`;
      }
      if (tableExists || (!year && !month)) {
        const { parameters, conditions } = this.buildParametersConditions(filterDto);
        let query = `
        SELECT f.id, f."userId", f."transactionId", f.time, f."typeFraction",
        f.plate, f.alias, f.tint, f.image,
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

        const totalQuery = `SELECT COUNT(*) AS total FROM ${tableName} AS f   INNER JOIN slot ON f."slotId" = slot.id ` + (conditions.length > 0 ? ' WHERE ' + conditions.join(' AND ') : '');
        const totalResult = await this.fractionRepository.query(totalQuery, parameters);
        const total = totalResult[0].total;

        parameters.push(limit, offset);
        const paramLimit = parameters.length - 1;
        const paramOffset = parameters.length;

        query += ` ORDER BY f.id DESC LIMIT $${paramLimit} OFFSET $${paramOffset};`;

        const fractions = await this.fractionRepository.query(query, parameters);

        return {
          fractions,
          total,
          limit,
          offset,
        };
      } else {
        return { fractions: [] };
      }
    } catch (error) {
      handleDbExceptions(error, this.logger);
    }
  }

  // para postgres
  async findFractionHistory(filterDto: FilterDto) {
    const { offset = 0, limit = 10, year, month } = filterDto;

    const { parameters, conditions } = this.buildParametersConditions(filterDto);

    try {
      let tableNameFraction = 'public.fraction';
      let tableExistsFraction = false;
      const schema = 'history';

      const params: any[] = [...parameters];
      let queryParts: string[] = [];

      if (year && month) {
        if (!this._isValidYearMonth(year, month)) {
          return { errorCode: ErrorCode.NONE, fraction: [] };
        }
        const monthString = month.toString().padStart(2, '0')

        // No quotes — used to check existence of the historical table.
        let tableNameFractionAux = `${year}_${monthString}_fraction`;
        tableNameFractionAux = `${schema}.${tableNameFractionAux}`;
        tableExistsFraction = await this._tableExists(tableNameFractionAux);

        if (tableExistsFraction) {
          this.logger.log('TABLE EXISTS' + tableNameFractionAux);
          //comillas para poder buscar data en la historica
          tableNameFraction = `${schema}."${year}_${monthString}_fraction"`;
        }
      }

      const addParam = (v: any) => {
        params.push(v);
        return `$${params.length}`;
      };

      const buildSelect = (fromTable: string, includeYearMonthFilter: boolean) => {
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

      // historical (if it exists)
      if (tableExistsFraction) {
        queryParts.push(buildSelect(tableNameFraction, false));
      }

      // currentMonth or day 1 -> current table filtered by year/month
      queryParts.push(buildSelect('public.fraction', true));

      // If nothing was appended, avoid an empty query.
      if (queryParts.length === 0) {
        return { errorCode: ErrorCode.NONE, fraction: [] };
      }

      let query = queryParts.join(' UNION ALL ');
      query += `
      ORDER BY "createdAt" DESC
      LIMIT ${addParam(limit)} OFFSET ${addParam(offset)};
    `;

      this.logger.log('QUERY FOR FRACTIONS ');
      this.logger.log(query);
      this.logger.log('PARAMS FOR FRACTIONS ');
      this.logger.log(params);

      const fraction = await this.fractionRepository.query(query, params);
      return { errorCode: ErrorCode.NONE, fraction };
    } catch (error) {
      handleDbExceptions(error, this.logger);
    }
  }

  private _convertRangeToTimeZone = (startUTC: string, endUTC: string, timeZone: string): { start: string; end: string } => {
    try {
      // Extract hours and minutes from the timezone string (e.g. "-05:00").
      const [sign, hours, minutes] = timeZone.match(/([+-])(\d{2}):(\d{2})/)?.slice(1) || [];
      const timeZoneOffset = (parseInt(hours) * 60 + parseInt(minutes)) * (sign === "-" ? 1 : -1);

      // Convert both dates from UTC to Date.
      const startDateUTC = new Date(startUTC + "Z"); // "Z" forces UTC interpretation
      const endDateUTC = new Date(endUTC + "Z");

      // Apply the timezone offset.
      const startDateInTimeZone = new Date(startDateUTC.getTime() + timeZoneOffset * 60 * 1000);
      const endDateInTimeZone = new Date(endDateUTC.getTime() + timeZoneOffset * 60 * 1000);

      // Format the dates as "YYYY-MM-DD HH:mm:ss".
      const formatDate = (date: Date) =>
        date.getUTCFullYear() +
        "-" +
        String(date.getUTCMonth() + 1).padStart(2, "0") +
        "-" +
        String(date.getUTCDate()).padStart(2, "0") +
        " " +
        String(date.getUTCHours()).padStart(2, "0") +
        ":" +
        String(date.getUTCMinutes()).padStart(2, "0") +
        ":" +
        String(date.getUTCSeconds()).padStart(2, "0");

      return { start: formatDate(startDateInTimeZone), end: formatDate(endDateInTimeZone) };

    } catch (error) {
      return { start: '', end: '' };
    }
  }

  async findAllTotalVehicleClientTime(filterDto: FilterDto) {

    const { year, month } = filterDto;
    try {
      const { tableName, tableExists, invalid } = await this._resolveStatisticsFractionTable(year, month);
      if (invalid) {
        return { fractions: [] };
      }
      if (tableExists || (!year && !month)) {
        const { parameters, conditions } = this.buildParametersConditions(filterDto);
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
        const fractions = await this.fractionRepository.query(query, parameters);
        return {
          fractions
        }

      } else {
        return { fractions: [] };
      }
    } catch (error) {
      console.error(`output-> error `, error)
    }
  }

  async findAllTotalOccupationRotationParking(filterDto: FilterDto) {

    const { year, month, zoneId, blockId, slotId } = filterDto;
    try {
      const { tableName, tableExists, invalid } = await this._resolveStatisticsFractionTable(year, month);
      if (invalid) {
        return { fractions: [] };
      }
      if (tableExists || (!year && !month)) {

        // Compute slot total.
        let queryTotalSlot = `SELECT COUNT(*) AS total FROM slot`;
        let parametersSlot = [];
        const conditionsSlot: string[] = [];

        if (zoneId) {
          conditionsSlot.push(`"zoneId" = $1`);
          parametersSlot.push(zoneId);
        }
        if (blockId) {
          conditionsSlot.push(`"blockId" = $1`);
          parametersSlot.push(blockId);
        }
        if (slotId) {
          conditionsSlot.push(`"slotId" = $1`);
          parametersSlot.push(slotId);
        }

        if (conditionsSlot.length > 0) {
          queryTotalSlot += ' WHERE ' + conditionsSlot.join(' AND ');
        }
        const totalSlot = await this.fractionRepository.query(queryTotalSlot, parametersSlot);
        const total = totalSlot[0].total;

        const { parameters, conditions } = this.buildParametersConditions(filterDto);
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
        const fractions = await this.fractionRepository.query(query, parameters);

        if (fractions.length > 0) {
          fractions[0].totalSlot = total;
          fractions[0].occupation = (+fractions[0].totalSlotOccupation * 100 / +total).toFixed(2);
          fractions[0].rotation = (+fractions[0].totalParking / +total).toFixed(2);
        }
        return { fractions }

      } else {
        return { fractions: [] };
      }
    } catch (error) {
      console.error(`output-> error `, error)
    }
  }

  async findAllStatistics(filterDto: FilterDto) {
    const { year, month } = filterDto;
    try {
      const { tableName, tableExists, invalid } = await this._resolveStatisticsFractionTable(year, month);
      if (invalid) {
        return { fractions: [] };
      }

      if (tableExists || (!year && !month)) {
        const { parameters, conditions } = this.buildParametersConditions(filterDto);
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
        const fractions = await this.fractionRepository.query(query, parameters);
        return {
          fractions
        }
      } else {
        return { fractions: [] };
      }
    } catch (error) {
      handleDbExceptions(error, this.logger);

    }
  }

  // Defense-in-depth validator for year/month before interpolating them into
  // raw SQL table names. DTO validation already enforces a number type, but
  // this guards against bypasses and out-of-range values.
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
      const monthString = month.toString().padStart(2, '0');
      tableName = `${year}_${monthString}_fraction`;
      tableExists = await this._tableExists(tableName);
    }

    return { tableName, tableExists, invalid: false };
  }

  private async _tableExists(tableName: string): Promise<boolean> {
    const names = tableName.split('.');
    if (names.length <= 1) {
      this.logger.error(`Schema not specified in table ${tableName}`);
      return false;
    }

    const table_schema: string = names[0];
    const table_name: string = names[1];

    const query = `
    SELECT EXISTS(
      SELECT 1
      FROM information_schema.tables
      WHERE table_schema = $1
        AND table_name = $2
    ) AS "exists";
  `;

    try {
      const result = await this.fractionRepository.query(query, [table_schema, table_name]);
      this.logger.log('TABLE EXISTS RESULT');
      this.logger.log(result);
      return result[0].exists;
    } catch (error) {
      this.logger.error(error);
      return false;
    }
  }

  async findStatisticsFractions(filterDto: FilterDto) {

    try {

      const { year, month } = filterDto;
      let tableName = 'public.fraction';
      let tableExists = false;
      const schema = 'history';
      if (year && month) {
        if (!this._isValidYearMonth(year, month)) {
          return { errorCode: ErrorCode.NOT_FOUND, message: 'No se encontraron resultados' };
        }
        const monthString = month.toString().padStart(2, '0')
        let tableNameAux = `${schema}."${year}_${monthString}_fraction"`;
        tableExists = await this._tableExists(tableNameAux);
        if (tableExists)
          tableName = tableNameAux;
      }

      const { parameters, conditions } = this.buildParametersConditions(filterDto);

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
              FROM ${tableName} f
      `;

      if (conditions.length > 0) {
        query += ' WHERE ' + conditions.join(' AND ');
      }

      query += ` GROUP BY TO_CHAR(f."createdAt", 'YYYY-MM-DD') ORDER BY date;`;

      const fractions = await this.fractionRepository.query(query, parameters);

      if (fractions.length === 0)
        return { errorCode: ErrorCode.NOT_FOUND, message: 'No se encontraron resultados' };
      return { errorCode: ErrorCode.NONE, message: 'Resultados encontrados', fractions };

    } catch (error) {
      handleDbExceptions(error, this.logger);
    }

  }

  buildParametersConditions = (filterDto) => {
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
    } = filterDto;

    const conditions: string[] = [];
    const parameters: any[] = [];

    // Helper to number positional placeholders.
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

    if (typeSize) {
      if (typeSize === TypeSizeVehicle.VEHICLE || typeSize === TypeSizeVehicle.OTHERS || typeSize === TypeSizeVehicle.UNDEFINED) {
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
        conditions.push(
          `f."createdAt" AT TIME ZONE 'UTC' AT TIME ZONE ${addParam(timeZoneUTC)} BETWEEN ${addParam(fromCreatedAt)} AND ${addParam(toCreatedAt)}`
        );
      }
    } else {
      if (dateFrom && dateTo) {
        conditions.push(`DATE(f."register") BETWEEN ${addParam(dateFrom)} AND ${addParam(dateTo)}`); // TEMP: review if time is also sent
      }
    }

    return { parameters, conditions };
  };

}
