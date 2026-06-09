import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import handleDbExceptions from 'src/common/exceptions/error.db.exception';
import { Repository } from 'typeorm';

import { FilterDto } from '../../common/dto/filter.dto';
import { ErrorCode } from '../../common/glob/error';
import { StatusPayment } from '../../common/glob/status/status_payment';
import { IncidentStatus } from '../../common/glob/type/type_incident';
import { Checkbox } from './entities/checkbox.entity';

/**
 * Service that exposes admin-side queries and maintenance operations on
 * checkbox records: list/filter (current and historical tables by
 * year/month), find inconsistencies (paid without incident, paid with
 * pending incident), patch single records and archive to history.
 */
@Injectable()
export class CheckboxService {
  private readonly logger = new Logger('CheckboxService');

  /**
   * Creates a new CheckboxService.
   * @param checkboxRepository Repository for the `Checkbox` entity.
   */
  constructor(
    @InjectRepository(Checkbox)
    private readonly checkboxRepository: Repository<Checkbox>,
  ) { }

  /**
   * Lists checkbox records from the live or historical table, applying
   * pagination and the filters declared in the DTO.
   * @param filterDto Filter and pagination criteria (search, status, period, etc.).
   * @returns An object with the matching `checkbox` rows and, when querying a
   *          valid table, the `total` count plus the applied `limit`/`offset`.
   */
  async findAll(filterDto: FilterDto) {
    const {
      offset: rawOffset = 0,
      limit: rawLimit = 10,
      year,
      month,
    } = filterDto;
    // Defense-in-depth: coerce pagination to safe non-negative integers
    // even if class-validator was bypassed upstream.
    const safeLimit =
      Number.isFinite(Number(rawLimit)) && Number(rawLimit) >= 0
        ? Math.trunc(Number(rawLimit))
        : 10;
    const safeOffset =
      Number.isFinite(Number(rawOffset)) && Number(rawOffset) >= 0
        ? Math.trunc(Number(rawOffset))
        : 0;
    try {
      const resolved = await this._resolveYearMonthTable(year, month);
      // Invalid year/month supplied: deny historical lookup (preserves prior contract).
      if (resolved === null) {
        return { checkbox: [] };
      }
      const { tableName, tableExists } = resolved;

      const { conditions, parameters } =
        this._buildConditionsAndParameters(filterDto);

      if (tableExists || (!year && !month)) {
        let query = `
          SELECT c.id,
          c."userId", c."transactionId", c.checkboxes, c.amount,
          c.moment, c."statusPayment", c."typePaymentMethod",
          c."billingData" AS billing_data, c."cardId",
          TO_CHAR(c."createdAt", 'YYYY-MM-DD"T"HH24:MI:SS.MS') AS "createdAt",
          TO_CHAR(c."updatedAt", 'YYYY-MM-DD"T"HH24:MI:SS.MS') AS "updatedAt",
          c."statusIncident"
          FROM ${tableName} c
        `;

        if (conditions.length > 0) {
          query += ' WHERE ' + conditions.join(' AND ');
        }

        const totalQuery =
          `SELECT COUNT(*) AS total FROM ${tableName} AS c` +
          (conditions.length > 0 ? ' WHERE ' + conditions.join(' AND ') : '');
        const totalResult = await this.checkboxRepository.query(
          totalQuery,
          parameters,
        );
        const total = totalResult[0].total;

        parameters.push(safeLimit, safeOffset);
        const paramLimit = parameters.length - 1;
        const paramOffset = parameters.length;

        query += ` ORDER BY c.id DESC LIMIT $${paramLimit} OFFSET $${paramOffset};`;

        const checkbox = await this.checkboxRepository.query(query, parameters);

        return {
          checkbox,
          total,
          limit: safeLimit,
          offset: safeOffset,
        };
      } else {
        return {
          checkbox: [],
        };
      }
    } catch (error) {
      handleDbExceptions(error, this.logger);
    }
    return `This action returns all checkbox`;
  }

  /**
   * Lists checkbox records matching a set of transaction IDs.
   *
   * Source-table routing (only the FROM source is built dynamically; the
   * SELECT, the `transactionId IN (...)`/date-range filters and the ORDER BY
   * are identical across every branch):
   * - `dateFrom` + `dateTo` (current front-end contract) -> dynamically
   *   `UNION ALL`s every monthly archive `history."YYYY_MM_checkbox"` whose
   *   month falls within the range and that already exists, plus the live
   *   `public.checkbox` table only when `dateTo` is within the last 3 days, so
   *   the most recent, not-yet-archived rows are still returned. See
   *   {@link _buildCheckboxRangeSource}.
   * - Legacy `year`/`month` period -> single historical `YYYY_MM_checkbox`
   *   archive when it exists, otherwise the live `checkbox` table.
   * - No range and no period -> live `checkbox` table.
   *
   * @param filterDto Filter criteria including `transactionIds`, the
   *   `dateFrom`/`dateTo` range and the legacy `year`/`month` period.
   * @returns An object with an `errorCode` and the matching `checkbox`/`checkboxes` rows.
   * @throws Delegates DB errors to {@link handleDbExceptions}.
   */
  async findAllByTransactionId(filterDto: FilterDto) {
    const { transactionIds, year, month, dateFrom, dateTo } = filterDto;

    if (!Array.isArray(transactionIds) || transactionIds.length === 0) {
      return { errorCode: ErrorCode.NONE, checkbox: [] };
    }

    try {
      // Current front-end contract: a date range that may span several months.
      // Build the data source dynamically from the monthly archives in range
      // plus the live table when the range reaches the most recent days.
      if (dateFrom && dateTo) {
        const fromSource = await this._buildCheckboxRangeSource(
          dateFrom,
          dateTo,
        );
        if (!fromSource) {
          return { errorCode: ErrorCode.NONE, checkboxes: [] };
        }
        return await this._runFindByTransactionIdQuery(fromSource, filterDto);
      }

      // Legacy single-period routing (year/month) with live-table fallback.
      const resolved = await this._resolveYearMonthTable(year, month);
      if (resolved === null) {
        return { checkbox: [] };
      }
      const { tableName, tableExists } = resolved;

      if (tableExists || (!year && !month)) {
        return await this._runFindByTransactionIdQuery(tableName, filterDto);
      } else {
        return { errorCode: ErrorCode.NONE, checkboxes: [] };
      }
    } catch (error) {
      handleDbExceptions(error, this.logger);
    }
  }

  /**
   * Runs the `findAllByTransactionId` lookup against the supplied FROM source
   * (a single table name or a parenthesized `UNION ALL` subquery aliased as
   * `c`), applying the fixed SELECT, the `transactionId IN (...)` filter, the
   * optional `register` date-range filter and the `ORDER BY c.id DESC`.
   *
   * Every value is bound as a `$N` parameter, so nothing is interpolated from
   * raw input.
   *
   * @param fromSource Table identifier or parenthesized subquery aliased as `c`.
   * @param filterDto Filter carrying `transactionIds` and the optional
   *   `dateFrom`/`dateTo` range.
   * @returns `{ errorCode, checkboxes }` with the matching rows.
   */
  private async _runFindByTransactionIdQuery(
    fromSource: string,
    filterDto: FilterDto,
  ): Promise<{ errorCode: ErrorCode; checkboxes: any[] }> {
    const { transactionIds, dateFrom, dateTo } = filterDto;

    const parameters: any[] = [];
    const conditions: string[] = [];

    // Bind each transactionId to its own $N placeholder to prevent SQL injection.
    const placeholders = transactionIds
      .map((id) => {
        parameters.push(id);
        return `$${parameters.length}`;
      })
      .join(', ');
    conditions.push(`c."transactionId" IN (${placeholders})`);

    if (dateFrom && dateTo) {
      parameters.push(dateFrom, dateTo);
      conditions.push(
        `DATE(c.register) BETWEEN $${parameters.length - 1} AND $${parameters.length}`,
      );
    }

    const query = `
          SELECT c.id, c."transactionId", c."statusIncident", c."onResponseExternal", c."optionalData"
          FROM ${fromSource} c
          WHERE ${conditions.join(' AND ')}
          ORDER BY c.id DESC;
        `;

    const checkboxes = await this.checkboxRepository.query(query, parameters);

    return { errorCode: ErrorCode.NONE, checkboxes };
  }

  /**
   * Resolves the checkbox source table for a list query, validating the
   * optional year/month period in the process.
   *
   * Behavior — preserves the original inlined logic:
   *  - No year nor month supplied → use the live `checkbox` table.
   *  - Both year and month supplied AND in a sane range (2000 ≤ year ≤ 2100,
   *    1 ≤ month ≤ 12) → use the historical table `<yyyy>_<mm>_checkbox`
   *    and check whether it actually exists.
   *  - Otherwise (invalid year/month, or only one of the two supplied) →
   *    return `null` so the caller can deny the historical lookup.
   *
   * Numeric validation also blocks SQL injection through the interpolated
   * table name `${year}_${month}_checkbox`.
   *
   * @param year  Optional year from the filter DTO.
   * @param month Optional month from the filter DTO.
   * @returns The resolved `tableName` and whether it exists, or `null` when
   *          the period is malformed.
   */
  private async _resolveYearMonthTable(
    year: number | string | undefined,
    month: number | string | undefined,
  ): Promise<{ tableName: string; tableExists: boolean } | null> {
    const y = Number(year);
    const m = Number(month);
    const validYearMonth =
      Number.isInteger(y) &&
      y >= 2000 &&
      y <= 2100 &&
      Number.isInteger(m) &&
      m >= 1 &&
      m <= 12;

    if (year && month && validYearMonth) {
      const mm = String(m).padStart(2, '0');
      const tableName = `${y}_${mm}_checkbox`;
      const tableExists = await this._tableExists(tableName);
      return { tableName, tableExists };
    }

    if (year || month) {
      // Invalid year/month supplied: deny historical lookup.
      return null;
    }

    return { tableName: 'checkbox', tableExists: false };
  }

  /**
   * Checks whether a table with the given name exists in the `public` schema.
   * @param tableName Name of the table to look up.
   * @returns Promise resolving to `true` when the table exists, `false` otherwise.
   */
  private async _tableExists(tableName: string): Promise<boolean> {
    const query = `
    SELECT EXISTS (
      SELECT 1
      FROM information_schema.tables 
      WHERE table_schema = 'public'
      AND table_name = $1
    ) AS "exists";
  `;
    try {
      const result = await this.checkboxRepository.query(query, [tableName]);
      return result[0].exists;
    } catch {
      return false;
    }
  }

  /**
   * Builds the SQL WHERE conditions and their bound parameters from the
   * filter DTO, keeping placeholder indexes in sync with the parameter array.
   * @param filterDto Filter criteria (search, status, payment method, date range).
   * @returns An object with the `conditions` strings and their ordered `parameters`.
   */
  private _buildConditionsAndParameters(filterDto: FilterDto): {
    conditions: string[];
    parameters: any[];
  } {
    const {
      search,
      statusMomentId,
      statusPayment,
      typePaymentMethod,
      dateFrom,
      dateTo,
      userId,
    } = filterDto;

    const conditions: string[] = [];
    const parameters: any[] = [];

    if (search) {
      parameters.push(search);
      conditions.push(`c."transactionId" = $${parameters.length}`);
    }

    if (userId !== undefined && userId !== null) {
      parameters.push(userId);
      conditions.push(`c."userId" = $${parameters.length}`);
    }

    if (statusMomentId !== undefined && statusMomentId !== null) {
      parameters.push(statusMomentId);
      conditions.push(`c.moment = $${parameters.length}`);
    }

    if (statusPayment !== undefined && statusPayment !== null) {
      parameters.push(statusPayment);
      conditions.push(`c."statusPayment" = $${parameters.length}`);
    }

    if (typePaymentMethod !== undefined && typePaymentMethod !== null) {
      parameters.push(typePaymentMethod);
      conditions.push(`c."typePaymentMethod" = $${parameters.length}`);
    }

    if (dateFrom && dateTo) {
      parameters.push(dateFrom, dateTo);
      conditions.push(
        `DATE(c.register) BETWEEN $${parameters.length - 1} AND $${parameters.length}`,
      );
    }

    return { conditions, parameters };
  }

  /**
   * Builds the dynamic FROM source for a date-range checkbox query: a
   * `UNION ALL` of every monthly archive `history."YYYY_MM_checkbox"` whose
   * month falls within [`dateFrom`, `dateTo`] and that already exists, plus the
   * live `public.checkbox` table when `dateTo` is within the last 3 days (so
   * recent, not-yet-archived rows are still returned).
   *
   * Every UNION branch projects the same fixed column list — exactly the
   * columns the outer query references in its SELECT (`id`, `transactionId`,
   * `statusIncident`, `onResponseExternal`, `optionalData`), its WHERE
   * (`register`) and its ORDER BY (`id`) — so the rows stay union-compatible
   * regardless of incidental column drift between the archives and the live
   * table. The result is parenthesized so the caller can alias it as `c`.
   *
   * The table names are never interpolated from raw input: `year`/`month` are
   * validated by {@link _isValidYearMonth} (via {@link _extractYearMonth}) and
   * each resulting identifier is verified against `information_schema` through
   * {@link _historyTableExists}.
   *
   * @param dateFrom Inclusive range start (`YYYY-MM-DD`).
   * @param dateTo   Inclusive range end (`YYYY-MM-DD`).
   * @returns The parenthesized `UNION ALL` subquery, or `null` when no archive
   *   in range exists and the live table is not eligible.
   */
  private async _buildCheckboxRangeSource(
    dateFrom: string,
    dateTo: string,
  ): Promise<string | null> {
    const schema = 'history';
    const columns =
      '"id", "transactionId", "statusIncident", "onResponseExternal", "optionalData", "register"';

    const selects: string[] = [];

    for (const { year, month } of this._enumerateRangeMonths(
      dateFrom,
      dateTo,
    )) {
      const monthPadded = month.toString().padStart(2, '0');
      const historicalTable = `${schema}."${year}_${monthPadded}_checkbox"`;
      if (await this._historyTableExists(historicalTable)) {
        selects.push(`SELECT ${columns} FROM ${historicalTable}`);
      }
    }

    // Include the transactional table only when the range reaches the last 3 days.
    if (this._isDateWithinLastDays(dateTo, 3)) {
      selects.push(`SELECT ${columns} FROM public.checkbox`);
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
   * @param dateTo   Range end (`YYYY-MM-DD`); only year and month are used.
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
   * (inclusive). Used to decide whether the live `public.checkbox` table must
   * be included alongside the monthly archives.
   *
   * @param value Date string expected to start with `YYYY-MM-DD`.
   * @param days  Size of the recent window in days.
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
   * @param year  Value to validate as an integer in the range 2000–2100.
   * @param month Value to validate as an integer in the range 1–12.
   * @returns `true` when both values are in the accepted range.
   */
  private _isValidYearMonth(year: any, month: any): boolean {
    const y = Number(year);
    const m = Number(month);
    return (
      Number.isInteger(y) &&
      y >= 2000 &&
      y <= 2100 &&
      Number.isInteger(m) &&
      m >= 1 &&
      m <= 12
    );
  }

  /**
   * Checks whether a schema-qualified table (`schema."name"`) exists in
   * `information_schema.tables`. Used for the historical archive lookups in
   * the `history` schema, which the public-schema-only {@link _tableExists}
   * cannot resolve.
   *
   * @param tableName Fully-qualified name in the form `schema."name"`.
   * @returns `true` when the table exists, `false` when it does not, when no
   *   schema prefix was provided, or when the lookup fails.
   */
  private async _historyTableExists(tableName: string): Promise<boolean> {
    const names = tableName.split('.');
    if (names.length <= 1) {
      this.logger.error(`No schema was specified for table ${tableName}`);
      return false;
    }

    const tableSchema = names[0].replace(/"/g, '').trim();
    const tableNameOnly = names[1].replace(/"/g, '').trim();

    const query = `
      SELECT EXISTS(
        SELECT 1
        FROM information_schema.tables
        WHERE table_schema = $1
          AND table_name = $2
      ) AS "exists";
    `;

    try {
      const result = await this.checkboxRepository.query(query, [
        tableSchema,
        tableNameOnly,
      ]);
      return !!result[0]?.exists;
    } catch (error) {
      this.logger.error(error);
      return false;
    }
  }

  // ─── Endpoints consumed by CommonCheckboxService via HTTP ──────────────

  /**
   * Returns PAID checkboxes whose statusIncident is NULL
   * (pending emission + deposit in GIM).
   * @returns Promise resolving to an object with an `errorCode` and the matching checkbox `data`.
   */
  async findPaidWithoutIncident(): Promise<{
    errorCode: ErrorCode;
    data: Checkbox[];
  }> {
    try {
      const rows = await this.checkboxRepository.query(
        `SELECT * FROM public.checkbox
         WHERE "statusPayment" = $1
           AND "statusIncident" IS NULL`,
        [StatusPayment.PAID],
      );
      return { errorCode: ErrorCode.NONE, data: rows };
    } catch (error) {
      this.logger.error(`findPaidWithoutIncident error: ${error.message}`);
      return { errorCode: ErrorCode.HTTP_ERROR_REINTENT, data: [] };
    }
  }

  /**
   * Returns PAID checkboxes whose statusIncident is in an intermediate state:
   * ENTERED, APPROVED, CONVENIO, ON_CREDIT, PENDIENTE_LIQUIDACION or SUPPLIED.
   * @returns Promise resolving to an object with an `errorCode` and the matching checkbox `data`.
   */
  async findPaidWithPendingIncident(): Promise<{
    errorCode: ErrorCode;
    data: Checkbox[];
  }> {
    try {
      const pendingStatuses = [
        IncidentStatus.ENTERED,
        IncidentStatus.APPROVED,
        IncidentStatus.CONVENIO,
        IncidentStatus.ON_CREDIT,
        IncidentStatus.PENDIENTE_LIQUIDACION,
        IncidentStatus.SUPPLIED,
      ];
      const placeholders = pendingStatuses
        .map((_, i) => `$${i + 2}`)
        .join(', ');
      const rows = await this.checkboxRepository.query(
        `SELECT * FROM public.checkbox
         WHERE "statusPayment" = $1
           AND "statusIncident" IN (${placeholders})`,
        [StatusPayment.PAID, ...pendingStatuses],
      );
      return { errorCode: ErrorCode.NONE, data: rows };
    } catch (error) {
      this.logger.error(`findPaidWithPendingIncident error: ${error.message}`);
      return { errorCode: ErrorCode.HTTP_ERROR_REINTENT, data: [] };
    }
  }

  /**
   * Updates a checkbox by its id.
   * Receives a partial object with the fields to modify (excluding 'id').
   * @param id Identifier of the checkbox to update.
   * @param fields Partial set of checkbox fields to modify.
   * @returns Promise resolving to an object with an `errorCode`, `data` and a result `message`.
   */
  async updateCheckboxById(
    id: number,
    fields: Partial<Checkbox>,
  ): Promise<{ errorCode: ErrorCode; data: any; message: string }> {
    try {
      await this.checkboxRepository.update(id, fields);
      return {
        errorCode: ErrorCode.NONE,
        data: [],
        message: 'Checkbox actualizado correctamente',
      };
    } catch (error) {
      this.logger.error(`updateCheckboxById error: ${error.message}`);
      return {
        errorCode: ErrorCode.HTTP_ERROR_REINTENT,
        data: [],
        message: 'Error al actualizar el checkbox',
      };
    }
  }

  /**
   * Transfers a checkbox to the corresponding historical table
   * history."YYYY_MM_checkbox" based on its createdAt date.
   * @param id Identifier of the checkbox to archive into the historical table.
   * @returns Promise resolving to an object with an `errorCode`, `data` and a result `message`.
   */
  async moveCheckboxToHistory(
    id: number,
  ): Promise<{ errorCode: ErrorCode; data: any; message: string }> {
    try {
      const rows = await this.checkboxRepository.query(
        `SELECT id, "createdAt" FROM public.checkbox WHERE id = $1`,
        [id],
      );
      const current = rows?.[0];

      if (!current?.createdAt) {
        return {
          errorCode: ErrorCode.NOT_FOUND,
          data: [],
          message: 'No se encontró el checkbox',
        };
      }

      const date = new Date(current.createdAt);
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const tableCheckbox = `history."${year}_${month}_checkbox"`;

      const existsResult = await this.checkboxRepository.query(
        `SELECT EXISTS(
           SELECT 1 FROM information_schema.tables
           WHERE table_schema = $1 AND table_name = $2
         ) AS "exists"`,
        ['history', `${year}_${month}_checkbox`],
      );

      if (!existsResult[0]?.exists) {
        return {
          errorCode: ErrorCode.NONE,
          data: [],
          message:
            'No se encontró la tabla histórica para transferir el checkbox',
        };
      }

      await this.checkboxRepository.query(
        `INSERT INTO ${tableCheckbox} SELECT * FROM public.checkbox WHERE id = $1`,
        [id],
      );

      return {
        errorCode: ErrorCode.NONE,
        data: [],
        message: 'Checkbox transferido correctamente',
      };
    } catch (error) {
      this.logger.error(`moveCheckboxToHistory error: ${error.message}`);
      return {
        errorCode: ErrorCode.HTTP_ERROR_REINTENT,
        data: [],
        message: 'Error al transferir el checkbox',
      };
    }
  }
}
