import { Inject, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import axios, { AxiosRequestConfig } from 'axios';
import { CommonGimService } from 'src/common/common.gim.service';
import { FilterDto } from 'src/common/dto/filter.dto';
import handleDbExceptions from 'src/common/exceptions/error.db.exception';
import { ErrorCode } from 'src/common/glob/error';
import { IncidentStatus } from 'src/common/glob/type/type_incident';
import { InternalStateIncident } from 'src/common/glob/type/type_internal_state_incident';
import { TypeOperation } from 'src/common/glob/type/type_operation';
import { LoggerService } from 'src/common/logger.service.ts';
import { Repository } from 'typeorm';

import { CreateIncidentDto } from './dto/create-incident.dto';
import { IncidentDto } from './dto/incident.dto';
import { IncidentFilterDto } from './dto/incident-filterdto.dto';
import { UpdateIncidentDto } from './dto/update-incident.dto';
import { Incident } from './entities/incident.entity';

/**
 * Service that owns the admin-side incident (sanction) lifecycle:
 * creation, listing/filtering, status transitions, GIM synchronization
 * and the multi-step approval/notification flow used by supervisors.
 *
 * Persists to `public.incident` (current) and historical monthly tables.
 * Cooperates with {@link CommonGimService} for external obligation emission.
 */
@Injectable()
export class IncidentService {
  private readonly logger = new Logger(IncidentService.name);

  constructor(
    @InjectRepository(Incident)
    private readonly incidentRepository: Repository<Incident>,

    @Inject(LoggerService)
    private readonly loggerService: LoggerService,

    @Inject(CommonGimService)
    private readonly commonGimService: CommonGimService,
  ) { }

  /**
   * Validates that `year` and `month` are safe integers within sensible bounds
   * before being interpolated into a SQL identifier (historical table name).
   * Existence of the resulting table is still verified via `_tableExists` against
   * `information_schema`, but this guard prevents malformed identifiers reaching
   * the query string at all.
   *
   * @param year  Value to validate as a year (2000–2100).
   * @param month Value to validate as a month (1–12).
   * @returns `true` when both values are integers within the accepted ranges.
   */
  private _isValidYearMonth(year: any, month: any): boolean {
    const y = Number(year);
    const m = Number(month);
    return (
      Number.isInteger(y) && y >= 2000 && y <= 2100 &&
      Number.isInteger(m) && m >= 1 && m <= 12
    );
  }

  /**
   * Creates a new incident record, persists it, and writes an audit log entry.
   *
   * @param createIncidentDto Fields for the new incident.
   * @param userId            Optional ID of the user triggering the creation;
   *   falls back to `controllerId` from the DTO when omitted.
   * @returns Object with the saved `incident` and `errorCode`.
   */
  async create(createIncidentDto: CreateIncidentDto, userId?: number) {
    try {
      const incident = this.incidentRepository.create({ ...createIncidentDto });
      const savedIncident = await this.incidentRepository.save(incident);

      this.loggerService.saveIncidentLogger({
        id: savedIncident.id,
        userId: userId ?? savedIncident.controllerId,
        typeOperation: TypeOperation.CREATE,
        incident: savedIncident,
      });

      return { incident: savedIncident, errorCode: ErrorCode.NONE };
    } catch (error) {
      handleDbExceptions(error, this.logger);
    }
  }

  /**
   * Returns a paginated, filtered list of incidents from the appropriate table
   * (`public.incident` or a historical archive).
   *
   * Timestamps are serialized as `YYYY-MM-DD"T"HH24:MI:SS.MS` strings to avoid
   * the UTC-`Z` suffix that JS `Date` serialization would produce.
   *
   * @param filterDto Filters and pagination options.
   * @returns Object with the `incidents` array and `errorCode`.
   */
  async findAll(filterDto: IncidentFilterDto) {
    const table = await this._resolveIncidentTable(filterDto);

    const { conditions, parameters } = this._buildConditionsAndParametersPg(filterDto);

    // Appends a value to the parameters array and returns its $N placeholder.
    const appendParam = (value: any) => {
      parameters.push(value);
      return `$${parameters.length}`;
    };

    let queryInfo = `
    SELECT
      i."id",
      i."incidentTypeId",
      i."statusIncident",
      i."description",
      i."plate",
      i."optionalData",
      i."supervisorObservations",
      i."controllerId",
      i."dictumPdfUrl",
      i."resolutionPdfUrl",
      i."blockOperatorId",
      i."zoneId",
      i."blockId",
      i."slot",
      i."images",
      i."lt",
      i."lg",
      i."isActivated",
      TO_CHAR(i."createdAt", 'YYYY-MM-DD"T"HH24:MI:SS.MS') AS "createdAt",
      TO_CHAR(i."updatedAt", 'YYYY-MM-DD"T"HH24:MI:SS.MS') AS "updatedAt",
      i."incidentCategory",
      i."nroTicket",
      i."identityCard",
      i."fullNameClient",
      i."emailClient",
      i."amount",
      i."reference",
      i."address",
      i."vehicleType",
      i."controllerReportPdfUrl",
      i."nroObligation",
      i."internalState"
    FROM ${table} i
    `;

    if (conditions.length > 0) {
      queryInfo += ' WHERE ' + conditions.join(' AND ');
    }

    queryInfo += ' ORDER BY i."createdAt" DESC';

    // Parameterized LIMIT/OFFSET. Coerced and validated to safe integers as
    // defense-in-depth against any caller bypassing DTO validation.
    if (filterDto.limit !== undefined && filterDto.limit !== null) {
      const lim = Math.trunc(Number(filterDto.limit));
      if (Number.isFinite(lim) && lim > 0) {
        queryInfo += ` LIMIT ${appendParam(lim)}`;
      }
    }

    if (filterDto.offset !== undefined && filterDto.offset !== null) {
      const off = Math.trunc(Number(filterDto.offset));
      if (Number.isFinite(off) && off >= 0) {
        queryInfo += ` OFFSET ${appendParam(off)}`;
      }
    }

    queryInfo += ';';

    try {
      const repository = this.incidentRepository;
      const incidents = await repository.query(queryInfo, parameters);
      return { incidents, errorCode: ErrorCode.NONE };
    } catch (error) {
      handleDbExceptions(error, this.logger);
    }
  }

  /**
   * Returns the total count of incidents matching the given filters, without
   * applying any pagination. Uses the same table-resolution logic as
   * {@link findAll} so counts always reflect the correct archive.
   *
   * @param filterDto Filters (same shape as `findAll`, pagination ignored).
   * @returns Object with the numeric `total` and `errorCode`.
   */
  async findAllTotal(filterDto: IncidentFilterDto) {
    const table = await this._resolveIncidentTable(filterDto);

    const { conditions, parameters } = this._buildConditionsAndParametersPg(filterDto);

    const appendParam = (value: any) => {
      parameters.push(value);
      return `$${parameters.length}`;
    };

    let queryInfo = `SELECT COUNT(*) as total FROM ${table} i`;

    if (conditions.length > 0) {
      queryInfo += ' WHERE ' + conditions.join(' AND ');
    }

    queryInfo += ';';

    try {
      const result = await this.incidentRepository.query(queryInfo, parameters);
      const total = result[0]?.total || 0;
      return { total: Number(total), errorCode: ErrorCode.NONE };
    } catch (error) {
      handleDbExceptions(error, this.logger);
    }
  }

  /**
   * Returns incidents filtered by a list of `transactionIds`.
   *
   * Mirrors `CheckboxService.findAllByTransactionId`: the only differences are
   * the queried table and how its name is resolved. The source table
   * (`public.incident` or `history."YYYY_MM_incident"`) is resolved through
   * {@link _resolveIncidentTable}, exactly as {@link findAll} does. No extra
   * business logic is applied here.
   *
   * SQL-injection safety:
   * - The table name is never built from raw input: `_resolveIncidentTable`
   *   validates `year`/`month` as bounded integers and verifies the resulting
   *   identifier against `information_schema` before use.
   * - Every `transactionId` and date value is bound as a `$N` parameter.
   *
   * @param filterDto Filter carrying `transactionIds`, and optionally
   *   `dateFrom`/`dateTo` and `year`/`month` for archive routing.
   * @returns Object with the `incidents` array and `errorCode`.
   */
  async findAllByTransactionId(filterDto: IncidentFilterDto) {
    const { transactionIds, dateFrom, dateTo } = filterDto;

    if (!Array.isArray(transactionIds) || transactionIds.length === 0) {
      return { errorCode: ErrorCode.NONE, incidents: [] };
    }

    try {
      const table = await this._resolveIncidentTable(filterDto);

      const parameters: any[] = [];
      const conditions: string[] = [];

      // Bind each transactionId to its own $N placeholder to prevent SQL injection.
      const placeholders = transactionIds.map((id) => {
        parameters.push(id);
        return `$${parameters.length}`;
      }).join(', ');
      conditions.push(`i."transactionId" IN (${placeholders})`);

      if (dateFrom && dateTo) {
        parameters.push(dateFrom, dateTo);
        conditions.push(
          `DATE(i.register) BETWEEN $${parameters.length - 1} AND $${parameters.length}`,
        );
      }

      const query = `
        SELECT i.id, i."transactionId", i."statusIncident", i."onResponseExternal"
        FROM ${table} i
        WHERE ${conditions.join(' AND ')}
        ORDER BY i.id DESC;
      `;

      const incidents = await this.incidentRepository.query(query, parameters);

      return { errorCode: ErrorCode.NONE, incidents };
    } catch (error) {
      handleDbExceptions(error, this.logger);
    }
  }

  /**
   * Returns a deduplicated list of incident clients for the combo/autocomplete
   * search in the admin incident view.
   *
   * Each row carries `identityCard` (used as the combo id) and `fullNameClient`
   * (used as the combo text). Rows without an identity card are excluded so every
   * option has a valid, selectable id. An optional `search` term matches either
   * field case-insensitively, and the result set is capped to keep the combo
   * lightweight.
   *
   * The source table is resolved through {@link _resolveIncidentTable}; every
   * value is bound as a `$N` parameter, so nothing is interpolated from raw input.
   *
   * @param filterDto Filter carrying the optional `search` term and `year`/`month`
   *   for archive routing.
   * @returns Object with the `clients` array and `errorCode`.
   */
  async findAllClient(filterDto: IncidentFilterDto) {
    try {
      const table = await this._resolveIncidentTable(filterDto);

      const parameters: any[] = [];
      const conditions: string[] = [
        `i."identityCard" IS NOT NULL`,
        `i."identityCard" <> ''`,
        `i."fullNameClient" IS NOT NULL`,
      ];

      const addParam = (value: any) => {
        parameters.push(value);
        return `$${parameters.length}`;
      };

      const search = (filterDto.search || '').trim();
      if (search && search !== 'undefined' && search !== 'null') {
        const like = `%${search}%`;
        conditions.push(
          `(i."fullNameClient" ILIKE ${addParam(like)} OR i."identityCard" ILIKE ${addParam(like)})`,
        );
      }

      const query = `
        SELECT DISTINCT i."identityCard", i."fullNameClient"
        FROM ${table} i
        WHERE ${conditions.join(' AND ')}
        ORDER BY i."fullNameClient" ASC
        LIMIT 25;
      `;

      const clients = await this.incidentRepository.query(query, parameters);
      return { clients, errorCode: ErrorCode.NONE };
    } catch (error) {
      handleDbExceptions(error, this.logger);
    }
  }

  /**
   * Picks the table to read incidents from (`public.incident` or the historical
   * archive `history."YYYY_MM_incident"`) based on `year`/`month`, mirroring
   * the resolution pattern used by {@link _resolveSanctionTables}:
   * - No `year`/`month`            → `public.incident`.
   * - Invalid `year`/`month`       → `public.incident` (defensive fallback).
   * - Valid + archive exists        → `history."YYYY_MM_incident"`.
   * - Valid + archive missing yet   → `public.incident` (e.g. the current month
   *   has not been archived).
   *
   * The table name is never interpolated from raw user input: `year`/`month`
   * are validated as bounded integers by {@link _isValidYearMonth}, and the
   * resulting identifier is additionally verified against
   * `information_schema.tables` via {@link _tableExists} (parameterized query).
   *
   * @param filterDto Filter carrying optional `year` and `month`.
   * @returns The fully-qualified table name to query.
   */
  private async _resolveIncidentTable(
    filterDto: IncidentFilterDto,
  ): Promise<string> {
    const { year, month } = filterDto;
    let tableNameIncident = 'public.incident';
    const schema = 'history';

    if (year && month && this._isValidYearMonth(year, month)) {
      const monthString = month.toString().padStart(2, '0');
      const tableNameIncidentAux = `${schema}."${year}_${monthString}_incident"`;
      const tableExistsIncident = await this._tableExists(tableNameIncidentAux);
      if (tableExistsIncident) {
        tableNameIncident = tableNameIncidentAux;
      }
    }

    return tableNameIncident;
  }

  /**
   * Resolves the incident and fraction source tables for the sanction
   * reports that JOIN both entities (`findAllFractionSanction`,
   * `findAllFractionSanctionTotal`, `findAllTotalVehicleClientTime`,
   * `findAllStatisticsFractionSanction`).
   *
   * Routing rules (identical across all callers):
   * - No/invalid `year`/`month` → `public.incident` + `public.fraction`.
   * - Valid period + incident archive exists → historical incident table.
   * - Valid period + BOTH archives exist → historical fraction table too.
   *   The fraction join is only routed to history when both archives are
   *   present, otherwise the INNER JOIN can orphan rows once fractions are
   *   purged from `public.fraction` after monthly archival.
   *
   * The table names are never interpolated from raw input: `year`/`month`
   * are validated by {@link _isValidYearMonth} and each resulting identifier is
   * verified against `information_schema` through {@link _tableExists}.
   *
   * @param filterDto Filter carrying the optional `year`/`month` period.
   * @returns The resolved incident and fraction table identifiers.
   */
  private async _resolveSanctionTables(
    filterDto: { year?: number; month?: number },
  ): Promise<{ tableNameIncident: string; tableNameFraction: string }> {
    const { year, month } = filterDto;
    const schema = 'history';

    let tableNameIncident = 'public.incident';
    let tableNameFraction = 'public.fraction';

    if (year && month && this._isValidYearMonth(year, month)) {
      const monthString = month.toString().padStart(2, '0');

      const tableNameIncidentAux = `${schema}."${year}_${monthString}_incident"`;
      const tableNameFractionAux = `${schema}."${year}_${monthString}_fraction"`;

      const tableExistsIncident = await this._tableExists(tableNameIncidentAux);
      const tableExistsFraction = await this._tableExists(tableNameFractionAux);

      if (tableExistsIncident) {
        tableNameIncident = tableNameIncidentAux;
      }

      if (tableExistsIncident && tableExistsFraction) {
        tableNameFraction = tableNameFractionAux;
      }
    }

    return { tableNameIncident, tableNameFraction };
  }

  /**
   * Retrieves a single incident by its primary key.
   *
   * @param id The incident ID.
   * @returns Object with the found `incident` (or `null`) and `errorCode`.
   */
  async findOne(id: number) {
    const incident = await this.incidentRepository.findOne({ where: { id } });
    return { incident, errorCode: ErrorCode.NONE };
  }

  /**
   * Updates an incident in either the live table or a historical archive,
   * depending on the `isTransacional` flag and the presence of `year`/`month`
   * in the DTO.
   *
   * Update paths:
   * 1. `isTransacional !== 0` → write to `public.incident`.
   * 2. `isTransacional === 0` + caller-supplied `year`/`month` → build the
   *    historical table name directly without touching the live table.
   * 3. `isTransacional === 0` + no `year`/`month` → derive the archive from
   *    `createdAt` on the live row (backward-compatible path).
   *
   * Uses `repository.update()` (not `save()`) to avoid TypeORM skipping JSON
   * column changes due to object-reference comparison in dirty-checking.
   *
   * @param id                Incident primary key.
   * @param updateIncidentDto Fields to apply; `year`/`month` are routing-only
   *   and are stripped before writing.
   * @param isTransacional    Non-zero to target `public.incident`.
   * @param userId            Optional audit-log actor ID.
   * @returns Object with the updated `incident` and `errorCode`.
   */
  async update(
    id: number,
    updateIncidentDto: UpdateIncidentDto,
    isTransacional: number,
    userId?: number,
  ) {
    try {
      // Strip routing-only fields before writing to any table.
      const { year: dtoYear, month: dtoMonth, ...fieldsToUpdate } = updateIncidentDto;

      // Case 1: transactional flag set — update the main `public.incident` table.
      // Uses update() directly to avoid TypeORM's dirty-checking skipping JSON
      // column changes (e.g. optionalData) due to object-reference comparison.
      if (isTransacional) {
        const exists = await this.incidentRepository.findOne({ where: { id } });
        if (!exists) {
          return { incident: null, errorCode: ErrorCode.NOT_FOUND };
        }
        await this.incidentRepository.update(id, fieldsToUpdate as any);
        const incident = await this.incidentRepository.findOne({ where: { id } });

        this.loggerService.saveIncidentLogger({
          id,
          userId,
          typeOperation: TypeOperation.UPDATE,
          incident,
        });

        return { incident, errorCode: ErrorCode.NONE };
      }

      // Case 2: historical update.
      // Path A: caller supplies year/month — build the historical table directly
      // without querying public.incident. Needed when the incident has been
      // archived and removed from the main table.
      // Path B: backward-compat — derive year/month from createdAt in public.incident.
      let table: string;

      if (dtoYear && dtoMonth && this._isValidYearMonth(dtoYear, dtoMonth)) {
        const monthStr = String(dtoMonth).padStart(2, '0');
        table = `history."${dtoYear}_${monthStr}_incident"`;
      } else {
        const current = await this.incidentRepository.findOne({
          where: { id },
          select: ['id', 'createdAt'],
        });

        if (!current?.createdAt) {
          return { incident: null, errorCode: ErrorCode.NOT_FOUND };
        }

        const date = new Date(current.createdAt);
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        table = `history."${year}_${month}_incident"`;
      }

      const exists = await this._tableExists(table);
      if (!exists) {
        return { incident: null, errorCode: ErrorCode.NONE };
      }

      const incident = await this._updateHistoricalRow(table, fieldsToUpdate, id);

      if (incident) {
        this.loggerService.saveIncidentLogger({
          id,
          userId,
          typeOperation: TypeOperation.UPDATE,
          incident,
        });
      }

      return { incident, errorCode: ErrorCode.NONE };
    } catch (error) {
      handleDbExceptions(error, this.logger);
    }
  }

  /**
   * Updates the GIM synchronization status of an incident in `public.incident`.
   * Unlike {@link update}, this always targets the live table and strips the
   * routing-only `year`/`month` fields before writing.
   *
   * @param id                Incident primary key.
   * @param updateIncidentDto Fields to apply (typically `statusIncident`,
   *   `nroObligation`, `onResponseExternal`).
   * @param userId            Optional audit-log actor ID.
   * @returns Object with the updated `incident` and `errorCode`.
   */
  async updateStatusGim(id: number, updateIncidentDto: UpdateIncidentDto, userId?: number) {
    try {
      const exists = await this.incidentRepository.findOne({ where: { id } });
      if (!exists) {
        return { incident: null, errorCode: ErrorCode.NOT_FOUND };
      }

      const { year: _y, month: _m, ...fieldsToUpdate } = updateIncidentDto;
      await this.incidentRepository.update(id, fieldsToUpdate as any);
      const incident = await this.incidentRepository.findOne({ where: { id } });

      this.loggerService.saveIncidentLogger({
        id: incident.id,
        userId,
        typeOperation: TypeOperation.UPDATE,
        incident,
      });

      return { incident, errorCode: ErrorCode.NONE };
    } catch (error) {
      handleDbExceptions(error, this.logger);
    }
  }

  /**
   * Reads the Alfresco connection settings from environment variables and
   * validates that the mandatory ones (base URL, user, password) are present.
   * Centralizing this avoids repeating the same read-and-validate block in
   * every Alfresco operation.
   *
   * @returns The Alfresco credentials, or `null` when a required variable is
   * missing (the absence is logged so callers can simply return their error).
   */
  private _getAlfrescoCredentials(): {
    alfrescoBaseUrl: string;
    username: string;
    password: string;
    directory: string;
  } | null {
    const alfrescoBaseUrl = process.env.ALFRESCO_BASE_URL;
    const username = process.env.ALFRESCO_USER;
    const password = process.env.ALFRESCO_PASS;
    const directory = process.env.ALFRESCO_DIR;

    if (!alfrescoBaseUrl || !username || !password) {
      this.logger.error('Alfresco configuration is missing in environment variables');
      return null;
    }

    return { alfrescoBaseUrl, username, password, directory };
  }

  /**
   * Uploads a file buffer to Alfresco as a multipart form POST.
   *
   * Uses Basic Auth with credentials from environment variables via
   * {@link _getAlfrescoCredentials}. The optional `relativePath` is forwarded
   * to Alfresco to place the file inside a sub-folder.
   *
   * @param fileBuffer   Raw file content.
   * @param fileName     Original file name (used as the Alfresco `name` field).
   * @param relativePath Optional sub-folder path within the Alfresco directory.
   * @returns Object with `errorCode` and `alfrescoData` on success,
   *   or `errorCode: HTTP_ERROR_REINTENT` on failure.
   */
  async uploadToAlfresco(
    fileBuffer: Buffer,
    fileName: string,
    relativePath?: string,
  ): Promise<Object> {
    try {
      const credentials = this._getAlfrescoCredentials();
      if (!credentials) {
        return { errorCode: ErrorCode.HTTP_ERROR_REINTENT };
      }
      const { alfrescoBaseUrl, username, password, directory } = credentials;

      const FormData = require('form-data');
      const form = new FormData();
      form.append('filedata', fileBuffer, fileName);
      form.append('name', fileName);

      if (relativePath) {
        form.append('relativePath', relativePath);
      }

      const config: AxiosRequestConfig = {
        method: 'post',
        url: `${alfrescoBaseUrl}/alfresco/api/-default-/public/alfresco/versions/1/nodes/${directory}/children`,
        headers: {
          ...form.getHeaders(),
        },
        auth: {
          username,
          password,
        },
        data: form,
        maxBodyLength: Infinity,
        maxContentLength: Infinity,
      };

      const response = await axios.request(config);

      const { data } = response;

      if (!data || !('entry' in data)) {
        return { errorCode: ErrorCode.HTTP_ERROR_REINTENT };
      }

      return { errorCode: ErrorCode.NONE, alfrescoData: data };
    } catch (error) {
      this.logger.error(
        `call uploadToAlfresco error.response?.data: ${JSON.stringify(error.response?.data)}`,
      );
    }

    return { errorCode: ErrorCode.HTTP_ERROR_REINTENT };
  }

  /**
   * Creates an Alfresco shared link for the given node ID and returns the
   * public download URL.
   *
   * The shared-link ID is extracted from the POST response and composed into
   * a URL using `ALFRESCO_BASE_URL_PUBLIC` so the URL is accessible without
   * Alfresco credentials.
   *
   * @param alfrescoId The Alfresco node ID (UUID) to share.
   * @returns Object with `errorCode`, `alfrescoData`, `sharedId`, and
   *   `sharedUrl` on success, or `errorCode: HTTP_ERROR_REINTENT` on failure.
   */
  async getFileUrlAlfresco(alfrescoId: string): Promise<Object> {
    try {
      const credentials = this._getAlfrescoCredentials();
      if (!credentials) {
        return { errorCode: ErrorCode.HTTP_ERROR_REINTENT };
      }
      const { alfrescoBaseUrl, username, password } = credentials;

      if (!alfrescoId) {
        return { errorCode: ErrorCode.HTTP_ERROR_REINTENT };
      }

      const payload = {
        nodeId: alfrescoId,
        expiresAt: null as null | string,
      };

      const config: AxiosRequestConfig = {
        method: 'post',
        url: `${alfrescoBaseUrl}/alfresco/api/-default-/public/alfresco/versions/1/shared-links`,
        headers: {
          'Content-Type': 'application/json',
        },
        auth: {
          username,
          password,
        },
        data: payload,
      };

      const response = await axios.request(config);
      const { data } = response;

      if (!data || !data.entry?.id) {
        return { errorCode: ErrorCode.HTTP_ERROR_REINTENT };
      }

      // The shared-link id is used to build the public download URL:
      // /shared-links/{sharedId}/content
      const sharedId = data.entry.id;
      const sharedUrl = `${process.env.ALFRESCO_BASE_URL_PUBLIC}/alf/alfresco/api/-default-/public/alfresco/versions/1/shared-links/${sharedId}/content`;

      return {
        errorCode: ErrorCode.NONE,
        alfrescoData: data,
        sharedId,
        sharedUrl,
      };
    } catch (error) {
      this.logger.error(
        `call getFileUrlAlfresco error.response?.data: ${JSON.stringify(error.response?.data)}`,
      );
      return { errorCode: ErrorCode.HTTP_ERROR_REINTENT };
    }
  }

  /**
   * Resolves the Alfresco node ID from a stored shared-link URL or a raw
   * shared-link ID by calling the Alfresco shared-links API.
   *
   * Delegates ID extraction to {@link extractSharedId} so callers can pass
   * either the full URL or just the ID portion.
   *
   * @param sharedUrlOrId Full shared-link URL or bare shared-link ID.
   * @returns Object with `errorCode`, `sharedId`, `alfrescoId` (node ID), and
   *   `alfrescoData` on success, or `errorCode: HTTP_ERROR_REINTENT` on failure.
   */
  async getAlfrescoIdBySharedUrl(sharedUrlOrId: string): Promise<Object> {
    try {
      const credentials = this._getAlfrescoCredentials();
      if (!credentials) {
        return { errorCode: ErrorCode.HTTP_ERROR_REINTENT };
      }
      const { alfrescoBaseUrl, username, password } = credentials;

      const sharedId = this.extractSharedId(sharedUrlOrId);
      if (!sharedId) {
        return { errorCode: ErrorCode.HTTP_ERROR_REINTENT };
      }

      const config: AxiosRequestConfig = {
        method: 'get',
        url: `${alfrescoBaseUrl}/alfresco/api/-default-/public/alfresco/versions/1/shared-links/${sharedId}`,
        auth: {
          username,
          password,
        },
      };

      const response = await axios.request(config);
      const { data } = response;

      if (!data?.entry?.nodeId) {
        return { errorCode: ErrorCode.HTTP_ERROR_REINTENT };
      }

      return {
        errorCode: ErrorCode.NONE,
        sharedId,
        alfrescoId: data.entry.nodeId,
        alfrescoData: data,
      };
    } catch (error) {
      this.logger.error(
        `call getAlfrescoIdBySharedUrl error.response?.data: ${JSON.stringify(error.response?.data)}`,
      );
      return { errorCode: ErrorCode.HTTP_ERROR_REINTENT };
    }
  }

  /**
   * Extracts the shared-link ID segment from an Alfresco URL or returns the
   * input unchanged if it appears to be a bare ID (no `/` separator).
   *
   * @param input Full shared-link URL or raw shared-link ID.
   * @returns The extracted shared-link ID, or `null` when extraction fails.
   */
  private extractSharedId(input: string): string | null {
    if (!input) return null;
    const match = input.match(/\/shared-links\/([^\/?#]+)/);
    if (match) return match[1];
    return input.includes('/') ? null : input;
  }

  /**
   * Soft-deletes an incident by setting `isActivated = false` and writes an
   * audit log entry. The record is never physically removed from the database.
   *
   * @param id     Incident primary key.
   * @param userId Optional audit-log actor ID.
   * @returns Object with the deactivated `incident` and `errorCode`.
   */
  async remove(id: number, userId?: number) {
    try {
      const incident = await this.incidentRepository.findOne({ where: { id } });
      if (incident) {
        // Soft-delete: business rule is to deactivate, not physically remove.
        incident.isActivated = false;
        await this.incidentRepository.save(incident);

        this.loggerService.saveIncidentLogger({
          id: incident.id,
          userId,
          typeOperation: TypeOperation.DELETE,
          incident,
        });

        return { incident, errorCode: ErrorCode.NONE };
      }
    } catch (error) {
      handleDbExceptions(error, this.logger);
    }
  }

  /**
   * Returns aggregate incident counts grouped by incident type, optionally
   * restricted to a date range and other filter criteria.
   *
   * Always queries `public.incident` (no historical archive routing).
   *
   * @param filterDto Filters applied via {@link _buildConditionsAndParametersPg}.
   * @returns Object with `errorCode`, `message`, and the `incidents` statistics
   *   array (each row: `incidentTypeId`, `total`, `name`).
   */
  async findStatistics(filterDto: IncidentFilterDto) {

    try {

      const tableName = 'public.incident';

      const { parameters, conditions } = this._buildConditionsAndParametersPg(filterDto);

      let query = `
              SELECT
                i."incidentTypeId",
                COUNT(i.id) as total,
                it.name as name
              FROM ${tableName} i
              INNER JOIN public."incidentType" it ON i."incidentTypeId" = it.id
      `;

      if (conditions.length > 0) {
        query += ' WHERE ' + conditions.join(' AND ');
      }

      query += ' GROUP BY i."incidentTypeId", it.name';
      const incidents = await this.incidentRepository.query(query, parameters);

      if (incidents.length === 0)
        return { errorCode: ErrorCode.NOT_FOUND, message: 'No se encontraron resultados' };
      return { errorCode: ErrorCode.NONE, message: 'Resultados encontrados', incidents };

    } catch (error) {
      handleDbExceptions(error, this.logger);
    }

  }

  /**
   * Returns aggregate incident counts grouped by incident type, restricted to
   * incidents that have an associated fraction (`fractionId IS NOT NULL`).
   *
   * Always queries `public.incident` (no historical archive routing).
   *
   * @param filterDto Filters applied via {@link _buildConditionsAndParametersPg}.
   * @returns Object with `errorCode`, `message`, and the `incidents` statistics
   *   array (each row: `incidentTypeId`, `total`, `name`).
   */
  async findStatisticsByFraction(filterDto: IncidentFilterDto) {

    try {

      const tableName = 'public.incident';

      const { parameters, conditions } = this._buildConditionsAndParametersPg(filterDto);

      let query = `
              SELECT
                i."incidentTypeId",
                COUNT(i.id) as total,
                it.name as name
              FROM ${tableName} i
              INNER JOIN public."incidentType" it ON i."incidentTypeId" = it.id
              WHERE i."fractionId" IS NOT NULL
      `;

      if (conditions.length > 0) {
        query += ' AND ' + conditions.join(' AND ');
      }

      query += ' GROUP BY i."incidentTypeId", it.name';
      const incidents = await this.incidentRepository.query(query, parameters);

      if (incidents.length === 0)
        return { errorCode: ErrorCode.NOT_FOUND, message: 'No se encontraron resultados' };
      return { errorCode: ErrorCode.NONE, message: 'Resultados encontrados', incidents };

    } catch (error) {
      handleDbExceptions(error, this.logger);
    }

  }

  /**
   * Builds the parameterized WHERE conditions and positional parameter array
   * for PostgreSQL raw queries against the incident table alias `i`.
   *
   * Each filter appends its value to the `parameters` array and inserts the
   * corresponding `$N` placeholder into `conditions`. This ensures every
   * user-supplied value is bound and never interpolated directly into SQL.
   *
   * Column names are double-quoted to preserve camelCase casing, which
   * Postgres would otherwise fold to lowercase.
   *
   * @param filterDto     The filter bag carrying search, date range, and
   *   entity-scoping fields.
   * @param excludeStatus Optional pair of {@link IncidentStatus} values to
   *   exclude via `NOT IN`. Defaults to empty (no exclusion).
   * @returns Object with the `conditions` array and the ordered `parameters`
   *   array aligned with their `$1..$N` placeholders.
   */
  private _buildConditionsAndParametersPg(
    filterDto: IncidentFilterDto,
    excludeStatus = []
  ): { conditions: string[]; parameters: any[] } {

    const {
      search = '',
      incidentTypeId,
      statusIncident,
      internalState,
      dateFrom,
      dateTo,
      zoneId,
      blockId,
      userId,
      blockOperatorId,
      incidentCategory,
      controllerId,
      identityCard,

    } = filterDto;

    const conditions: string[] = [];
    const parameters: any[] = [];

    const addParam = (value: any) => {
      parameters.push(value);
      return `$${parameters.length}`;
    };

    // Ignore empty/whitespace strings and literal 'undefined'/'null'
    // sent by clients that stringify missing values.
    if (search && search.trim() && search.trim() !== 'undefined' && search.trim() !== 'null' && search.trim() !== '') {
      const like = `%${search}%`;
      conditions.push(
        `(i."description" ILIKE ${addParam(like)}` +
        ` OR i."plate" ILIKE ${addParam(like)}` +
        ` OR i."supervisorObservations" ILIKE ${addParam(like)}` +
        ` OR i."identityCard" ILIKE ${addParam(like)}` +
        ` OR i."nroTicket" ILIKE ${addParam(like)}` +
        ` OR i."nroObligation" ILIKE ${addParam(like)}` +
        ` OR i."fullNameClient" ILIKE ${addParam(like)})`,
      );
    }

    if (incidentTypeId) {
      conditions.push(`i."incidentTypeId" = ${addParam(incidentTypeId)}`);
    }

    if (zoneId) {
      conditions.push(`i."zoneId" = ${addParam(zoneId)}`);
    }

    if (blockId) {
      conditions.push(`i."blockId" = ${addParam(blockId)}`);
    }

    if (statusIncident) {
      conditions.push(`i."statusIncident" = ${addParam(statusIncident)}`);
    }

    if (internalState) {
      conditions.push(`i."internalState" = ${addParam(internalState)}`);
    }

    if (userId) {
      conditions.push(`i."controllerId" = ${addParam(userId)}`);
    }

    if (controllerId) {
      conditions.push(`i."controllerId" = ${addParam(controllerId)}`);
    }

    // Exact-match filter by the fined client's national identity card. Set by the
    // client combo (id = identityCard) so the listing narrows to that person.
    if (identityCard) {
      conditions.push(`i."identityCard" = ${addParam(identityCard)}`);
    }

    if (blockOperatorId) {
      conditions.push(`i."blockOperatorId" = ${addParam(blockOperatorId)}`);
    }

    if (incidentCategory) {
      conditions.push(`i."incidentCategory" = ${addParam(incidentCategory)}`);
    }

    if (dateFrom && dateTo) {
      conditions.push(`DATE(i."createdAt") BETWEEN ${addParam(dateFrom)} AND ${addParam(dateTo)}`);
    }

    if (excludeStatus.length > 0) {
      const p1 = addParam(excludeStatus[0]);
      const p2 = addParam(excludeStatus[1]);
      conditions.push(`i."statusIncident" NOT IN (${p1}, ${p2})`);
    }

    return { conditions, parameters };
  }

  /**
   * Returns a paginated list of fractions that have associated sanctions,
   * enriched with zone, block, and incident-type details.
   *
   * Routes to the correct archive via {@link _resolveSanctionTables} and
   * applies the standard filter set through {@link _buildConditionsAndParametersPg}.
   *
   * @param filterDto Filters and pagination (`limit`, `offset`,
   *   `typeFractionId`, date range, etc.).
   * @returns Object with the `fractionSanction` rows, `limit`, and `offset`.
   */
  async findAllFractionSanction(filterDto: FilterDto) {

    try {
      const { limit = 10, offset = 0, typeFractionId } = filterDto;

      const { tableNameIncident, tableNameFraction } = await this._resolveSanctionTables(filterDto);

      const { parameters, conditions } = this._buildConditionsAndParametersPg(filterDto);

      if (typeFractionId) {
        parameters.push(typeFractionId);
        conditions.push(`f."typeFraction" = $${parameters.length}`);
      }

      let query = `
          SELECT
            i.id, i."zoneId", i."blockId", i."controllerId", i."statusIncident", i."plate", i."description",
            i."identityCard", i."emailClient", i."fullNameClient", i."nroTicket", i."nroObligation", i."vehicleType",
            i."amount", i."incidentTypeId", i."address", i."images",
            TO_CHAR(i."createdAt", 'YYYY-MM-DD"T"HH24:MI:SS.MS') AS "createdAt",
            TO_CHAR(i."updatedAt", 'YYYY-MM-DD"T"HH24:MI:SS.MS') AS "updatedAt",
            it.name as reason,
            z.name as "nameZone",
            b.name as "nameBlock",
            f.time as "timeFraction"
          FROM
            ${tableNameIncident} i
            INNER JOIN public."incidentType" it ON i."incidentTypeId" = it.id
            INNER JOIN public.zone z ON z.id = i."zoneId"
            INNER JOIN public.block b ON b.id = i."blockId"
            LEFT JOIN ${tableNameFraction} f ON f.id = i."fractionId"
        `;

      if (conditions.length > 0) {
        query += ' WHERE ' + conditions.join(' AND ');
      }
      query += ' ORDER BY i.id DESC';
      // Parameterized pagination (defense-in-depth on top of DTO validation).
      const safeLimit = Math.max(0, Math.trunc(Number(limit)) || 0);
      const safeOffset = Math.max(0, Math.trunc(Number(offset)) || 0);
      query += ` LIMIT $${parameters.length + 1} OFFSET $${parameters.length + 2}`;
      parameters.push(safeLimit, safeOffset);

      const fractionSanction = await this.incidentRepository.query(query, parameters);

      return {
        fractionSanction,
        limit,
        offset,
      };

    } catch (error) {
      handleDbExceptions(error, this.logger);
    }
  }

  /**
   * Returns the total row count for the fraction-sanction list so callers can
   * implement pagination without a full data fetch.
   *
   * Uses the same FROM/JOIN chain as {@link findAllFractionSanction} so the
   * total always matches the paginated list. The fraction JOIN is `LEFT` to
   * count incidents even when they have no associated fraction.
   *
   * @param filterDto Filters (same shape as `findAllFractionSanction`,
   *   pagination ignored).
   * @returns Object with the numeric `total`.
   */
  async findAllFractionSanctionTotal(filterDto: FilterDto) {

    try {
      const { typeFractionId } = filterDto;

      const { tableNameIncident, tableNameFraction } = await this._resolveSanctionTables(filterDto);

      const { parameters, conditions } = this._buildConditionsAndParametersPg(filterDto);

      if (typeFractionId) {
        parameters.push(typeFractionId);
        conditions.push(`f."typeFraction" = $${parameters.length}`);
      }

      let query = `
          SELECT
            COUNT(*) as total
          FROM
            ${tableNameIncident} i
            INNER JOIN public."incidentType" it ON i."incidentTypeId" = it.id
            INNER JOIN public.zone z ON z.id = i."zoneId"
            INNER JOIN public.block b ON b.id = i."blockId"
            LEFT JOIN ${tableNameFraction} f ON f.id = i."fractionId"
       `;

      if (conditions.length > 0) {
        query += ' WHERE ' + conditions.join(' AND ');
      }

      const fractionSanction = await this.incidentRepository.query(query, parameters);

      let total = 0;
      if (fractionSanction.length > 0) {
        total = parseInt(fractionSanction[0].total, 10);
      }

      return {
        total
      };

    } catch (error) {
      handleDbExceptions(error, this.logger);
    }
  }

  /**
   * Runs a parameterized UPDATE on a historical table (`schema."name"`) and
   * returns the updated row via `RETURNING *`, or `null` if no row matched.
   *
   * Uses raw SQL because TypeORM's QueryBuilder mishandles quoted
   * `schema."table"` identifiers in the UPDATE target, producing
   * zero-length identifier errors.
   *
   * @param table  Fully-qualified historical table name (e.g.
   *   `history."2024_01_incident"`).
   * @param fields Key/value pairs of columns to set; JSON objects are
   *   stringified before binding.
   * @param id     The incident primary key used in the WHERE clause.
   * @returns The updated row object, or `null` when no row matched.
   */
  private async _updateHistoricalRow(
    table: string,
    fields: Record<string, any>,
    id: number,
  ): Promise<Record<string, any> | null> {
    const keys = Object.keys(fields);
    if (keys.length === 0) return null;

    const params: any[] = [];
    const setClauses = keys.map(key => {
      const value = fields[key];
      params.push(value !== null && typeof value === 'object' ? JSON.stringify(value) : value);
      return `"${key}" = $${params.length}`;
    });
    params.push(id);

    const sql = `UPDATE ${table} SET ${setClauses.join(', ')} WHERE id = $${params.length} RETURNING *`;
    const rows = await this.incidentRepository.query(sql, params);
    return rows?.[0] ?? null;
  }

  /**
   * Verifies the existence of a fully-qualified schema-prefixed table via
   * `information_schema.tables`. Returns `false` (and logs an error) when the
   * name contains no schema prefix.
   *
   * @param tableName Fully-qualified table name in `schema."table"` form.
   * @returns `true` when the table exists in the database.
   */
  private async _tableExists(tableName: string): Promise<boolean> {
    const names = tableName.split('.');
    if (names.length <= 1) {
      this.logger.error(`No schema was specified for table ${tableName}`);
      return false;
    }

    const tableSchema = names[0].replace(/"/g, '').trim();
    const tableName2 = names[1].replace(/"/g, '').trim();

    const query = `
    SELECT EXISTS(
      SELECT 1
      FROM information_schema.tables
      WHERE table_schema = $1
        AND table_name = $2
    ) AS "exists";
  `;

    const result = await this.incidentRepository.query(query, [tableSchema, tableName2]);
    return !!result[0]?.exists;
  }

  /**
   * Returns aggregate parking metrics across the matching incidents:
   * - `totalVehicle`: distinct incident license plates (`i."plate"`).
   * - `totalClient`: distinct incident client names (`i."fullNameClient"`).
   * - `totalTime`: summed parking time from the associated fractions.
   *
   * Vehicle and client counts come from the INCIDENT, so sanctions without an
   * associated fraction still contribute their plate/client. The fraction is
   * `LEFT JOIN`ed only to aggregate parking time; fraction-less rows add zero
   * and `totalTime` is wrapped in `COALESCE(..., '00:00:00')` so it never
   * returns `NULL` when the filtered set has no fraction time at all.
   *
   * `COUNT(DISTINCT ...)` ignores `NULL`, so incidents without a plate or
   * client name simply do not add to those counts.
   *
   * Routes to the correct archives via {@link _resolveSanctionTables}.
   *
   * @param filterDto Filters applied via {@link _buildConditionsAndParametersPg}.
   * @returns Object with the `fractionSanction` aggregate row.
   */
  async findAllTotalVehicleClientTime(filterDto: IncidentFilterDto) {
    try {
      const { typeFractionId } = filterDto;

      const { tableNameIncident, tableNameFraction } = await this._resolveSanctionTables(filterDto);

      const { parameters, conditions } = this._buildConditionsAndParametersPg(filterDto);

      if (typeFractionId) {
        parameters.push(typeFractionId);
        conditions.push(`fraction."typeFraction" = $${parameters.length}`);
      }

      let query = `
          SELECT
            COUNT(DISTINCT i."plate") AS "totalVehicle",
            COUNT(DISTINCT i."fullNameClient") AS "totalClient",
            COALESCE(SUM(fraction.time), '00:00:00')::time AS "totalTime"
          FROM
            ${tableNameIncident} i
            LEFT JOIN ${tableNameFraction} fraction ON fraction.id = i."fractionId"
       `;

      if (conditions.length > 0) {
        query += ' WHERE ' + conditions.join(' AND ');
      }

      const fractionSanction = await this.incidentRepository.query(query, parameters);

      return {
        fractionSanction
      };

    } catch (error) {
      handleDbExceptions(error, this.logger);
    }
  }

  /**
   * Returns sanction statistics grouped by zone, block, and parking time slot.
   * Each result row aggregates the sanction count for the corresponding
   * combination.
   *
   * Zone and block are taken from the INCIDENT (not the fraction) and the
   * fraction is `LEFT JOIN`ed, so incidents without an associated fraction are
   * still counted, keeping this metric aligned with the report in
   * {@link findAllFractionSanction}. Fraction-less rows have no parking time, so
   * they fall under the `00:00:00` bucket; the `time` column is wrapped in
   * `COALESCE(..., '00:00:00')` so it never returns `NULL`, while `totalTime`
   * counts only the rows that actually carry a fraction time.
   *
   * Routes to the correct archives via {@link _resolveSanctionTables}.
   *
   * @param filterDto Filters applied via {@link _buildConditionsAndParametersPg}.
   * @returns Object with the `fractionSanction` rows grouped by zone/block/time.
   */
  async findAllStatisticsFractionSanction(filterDto: IncidentFilterDto) {
    const { typeFractionId } = filterDto;
    try {
      const { tableNameIncident, tableNameFraction } = await this._resolveSanctionTables(filterDto);

      const { parameters, conditions } = this._buildConditionsAndParametersPg(filterDto);

      if (typeFractionId) {
        parameters.push(typeFractionId);
        conditions.push(`fraction."typeFraction" = $${parameters.length}`);
      }

      let query = `
          SELECT
              MAX(z.id) AS "idZone",
              MAX(z.name) AS "nameZone",
              MAX(b.id) AS "idBlock",
              MAX(b.name) AS "nameBlock",
              COALESCE(MAX(fraction.time), '00:00:00'::time) AS "time",
            COUNT(*) AS "totalZone",
            COUNT(*) AS "totalBlock",
            COUNT(*) FILTER (WHERE fraction.time IS NOT NULL) AS "totalTime"
          FROM
              ${tableNameIncident} i
                  LEFT JOIN
              ${tableNameFraction} fraction ON fraction.id = i."fractionId"
                  INNER JOIN
              public.zone z ON z.id = i."zoneId"
                  INNER JOIN
              public.block b ON b.id = i."blockId"
        `;

      if (conditions.length > 0) {
        query += ' WHERE ' + conditions.join(' AND ');
      }

      query += ' GROUP BY i."zoneId" , i."blockId" , fraction.time';

      const fractionSanction = await this.incidentRepository.query(query, parameters);

      return {
        fractionSanction
      }

    } catch (error) {
      handleDbExceptions(error, this.logger);
    }
  }

  /**
   * Reads pending incidents and synchronizes their state against GIM, marking
   * those that match an active obligation as emitted.
   *
   * Skips incidents in `SUPPLIED` or `PAYED` status. For each remaining
   * incident, calls {@link CommonGimService.findObligationsByCitation} and
   * then {@link CommonGimService.validateStatusWithGim} to apply the GIM
   * status. If GIM returns a non-`NONE` error code the operation short-circuits
   * and returns that error to the caller.
   *
   * @param userId         Actor user ID forwarded to GIM calls.
   * @param idDevice       Device UUID forwarded to GIM calls.
   * @param filterDto      Filters to scope which pending incidents are fetched.
   * @param isTransacional Non-zero to write updates inside a DB transaction.
   * @returns Object with the synchronized `incidents` array, `errorCode`, and
   *   a status `message`.
   */
  async findAndSincronizeToEmit(userId: number, idDevice: string, filterDto: IncidentFilterDto, isTransacional: number) {
    const { year, month } = filterDto;
    let table = 'public.incident';
    let isHistorical = false;

    if (year && month) {
      if (!this._isValidYearMonth(year, month)) {
        return { incidents: [], errorCode: ErrorCode.NONE, message: 'No se encontro la tabla' };
      }
      const monthString = month.toString().padStart(2, '0');
      const historicalTable = `history."${year}_${monthString}_incident"`;

      if (await this._tableExists(historicalTable)) {
        table = historicalTable;
        isHistorical = true;
      } else {
        return { incidents: [], errorCode: ErrorCode.NONE, message: 'No se encontro la tabla' };
      }
    }

    const { conditions, parameters } = this._buildConditionsAndParametersPg(filterDto, [IncidentStatus.SUPPLIED, IncidentStatus.PAYED]);

    let queryInfo = `
    SELECT
      i."id",
      i."nroTicket"
    FROM ${table} i
    `;

    if (conditions.length > 0) {
      queryInfo += ' WHERE ' + conditions.join(' AND ');
    }

    queryInfo += ' ORDER BY i."nroTicket" DESC';

    queryInfo += ';';

    try {
      const incidents = await this.incidentRepository.query(queryInfo, parameters);

      if (incidents.length === 0)
        return { errorCode: ErrorCode.NOT_FOUND, incidents };

      const incidentsSupplied = [];
      let messageInfo = 'Incidencias sincronizadas correctamente';
      for (const incident of incidents) {

        const validateIncident = await this.commonGimService.findObligationsByCitation(userId, idDevice, incident.nroTicket, incident.identityCard);

        if (validateIncident.errorCode === ErrorCode.NONE) {

          const validateStatus = await this.commonGimService.validateStatusWithGim(
            userId,
            idDevice,
            validateIncident.data,
            incident.id,
            incident,
            isTransacional,
          );
          if (validateStatus.errorCode !== ErrorCode.NONE) {
            return {
              errorCode: ErrorCode.NOT_FOUND,
              message: validateStatus.message,
              data: validateStatus.data
            };
          }

          incidentsSupplied.push({
            ...incident,
          });
        }

        if (incidentsSupplied.length === 0) {
          messageInfo = 'No se encontraron incidencias para sincronizar';
        }
      }

      return { incidents: incidentsSupplied, errorCode: ErrorCode.NONE, message: messageInfo };
    } catch (error) {
      handleDbExceptions(error, this.logger);
    }
  }

  /**
   * Returns a lightweight, paginated list of incidents for the notification
   * feed (`id`, `description`, `plate`, `statusIncident`, `updatedAt`).
   *
   * Always queries `public.incident`, ordered by most recently updated first.
   *
   * @param filterDto Pagination options (`limit`, `offset`); other filters are
   *   not applied in this query.
   * @returns Object with the `incidents` array and `errorCode`.
   */
  async findAllNotification(filterDto: IncidentFilterDto) {
    const { limit = 30, offset = 0 } = filterDto;
    const table = 'public.incident';

    // Parameterized LIMIT/OFFSET. Coerced to safe integers to prevent any
    // SQL injection regardless of upstream DTO validation.
    const safeLimit = Math.max(0, Math.trunc(Number(limit)) || 0);
    const safeOffset = Math.max(0, Math.trunc(Number(offset)) || 0);

    let queryInfo = `
      SELECT i."id", i."description",
      i."plate", i."statusIncident", i."updatedAt"
      FROM ${table} i
    `;

    queryInfo += ` ORDER BY i."updatedAt" DESC LIMIT $1 OFFSET $2;`;

    try {
      const incidents = await this.incidentRepository.query(queryInfo, [safeLimit, safeOffset]);
      return { errorCode: ErrorCode.NONE, incidents }

    } catch (error) {
      handleDbExceptions(error, this.logger);
    }
  }

  /**
   * Advances an incident to the next step in the internal approval workflow
   * and synchronizes its status with GIM if an active obligation is found.
   *
   * Workflow state machine:
   * - `SIMERT_ADMINISTRATION` → `TRAFFIC_POLICE_STATION`
   * - `TRAFFIC_POLICE_STATION` → `REVENUE_DEPARTMENT`
   * - `REVENUE_DEPARTMENT` → `REVENUE_DEPARTMENT` (terminal, stays in place)
   *
   * When GIM already holds an obligation for the incident's citation number,
   * the state jumps directly to `REVENUE_DEPARTMENT` regardless of the current
   * step.
   *
   * Update paths (same as {@link update}):
   * 1. `isTransacional !== 0` + row exists in `public.incident` → live table.
   * 2. Caller-supplied `year`/`month` → build historical table directly.
   * 3. `createdAt` on the DTO → derive archive month from the timestamp.
   * 4. Last resort → look up `createdAt` from `public.incident`.
   *
   * @param userId         Actor user ID forwarded to GIM and audit log.
   * @param idDevice       Device UUID forwarded to GIM calls.
   * @param incidentDto    Current incident snapshot; must carry `id`,
   *   `identityCard`, `nroTicket`, and `internalState`.
   * @param isTransacional Non-zero to prefer the live table over the archive.
   * @returns Object with the updated `incident`, `errorCode`, and an optional
   *   `message` on failure.
   */
  async advanceNextProcess(userId: number, idDevice: string, incidentDto: IncidentDto, isTransacional: number) {
    if (!incidentDto.identityCard) {
      return { errorCode: ErrorCode.NOT_FOUND, message: 'La incidencia no tiene una cedula ruc o pasaporte vinculado' };
    }

    if (!incidentDto.nroTicket) {
      return { errorCode: ErrorCode.NOT_FOUND, message: 'La incidencia no tiene un numero de boleta vinculado' };
    }

    const validateIncident = await this.commonGimService.findObligationsByCitation(userId, idDevice, incidentDto.nroTicket, incidentDto.identityCard);

    let internalState = incidentDto.internalState;

    // Workflow transition: each handler advances to the next department.
    // REVENUE_DEPARTMENT is terminal and stays in place.
    if (incidentDto.internalState === InternalStateIncident.SIMERT_ADMINISTRATION) {
      internalState = InternalStateIncident.TRAFFIC_POLICE_STATION;
    }
    else if (incidentDto.internalState === InternalStateIncident.TRAFFIC_POLICE_STATION) {
      internalState = InternalStateIncident.REVENUE_DEPARTMENT;
    }
    else if (incidentDto.internalState === InternalStateIncident.REVENUE_DEPARTMENT) {
      internalState = InternalStateIncident.REVENUE_DEPARTMENT;
    }

    if (validateIncident.errorCode === ErrorCode.NONE) {
      // If GIM already returned an existing obligation, the debt has been
      // emitted and the incident jumps directly to the revenue department.
      if (validateIncident.data.length > 0) {
        internalState = InternalStateIncident.REVENUE_DEPARTMENT;
      }
    }

    const fieldsToUpdate = { internalState };
    const incidentId = incidentDto.id;

    // Case 1: transactional flag set — try main `public.incident` table first,
    // then fall through to historical if not found there.
    if (isTransacional) {
      const exists = await this.incidentRepository.findOne({ where: { id: incidentId } });
      if (exists) {
        await this.incidentRepository.update(incidentId, fieldsToUpdate);
        const incident = await this.incidentRepository.findOne({ where: { id: incidentId } });

        this.loggerService.saveIncidentLogger({
          id: incidentId,
          userId,
          typeOperation: TypeOperation.UPDATE,
          incident,
        });

        return { incident, errorCode: ErrorCode.NONE };
      }
      // Not in public.incident — fall through to historical resolution below.
    }

    // Historical update.
    // Path A: caller supplies year/month — build the historical table directly.
    // Path B: derive year/month from createdAt in the body (incidentDto.createdAt).
    // Path C (Case 1 fallback only): last resort — no date available at all.
    let table: string;

    if (incidentDto.year && incidentDto.month && this._isValidYearMonth(incidentDto.year, incidentDto.month)) {
      const monthStr = String(incidentDto.month).padStart(2, '0');
      table = `history."${incidentDto.year}_${monthStr}_incident"`;
    } else if (incidentDto.createdAt) {
      // Normalize "YYYY-MM-DD HH:mm:ss" (space separator) to ISO format so
      // Date parsing is consistent across all JS environments.
      const normalized = incidentDto.createdAt.replace(' ', 'T');
      const date = new Date(normalized);
      if (!isNaN(date.getTime())) {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        table = `history."${year}_${month}_incident"`;
      }
    }

    if (!table) {
      const current = await this.incidentRepository.findOne({
        where: { id: incidentId },
        select: ['id', 'createdAt'],
      });

      if (!current?.createdAt) {
        return { incident: null, errorCode: ErrorCode.NOT_FOUND, message: 'No se encontro la incidencia para actualizar' };
      }

      const date = new Date(current.createdAt);
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      table = `history."${year}_${month}_incident"`;
    }

    const exists = await this._tableExists(table);
    if (!exists) {
      return { incident: null, errorCode: ErrorCode.NOT_FOUND, message: 'No se encontro la incidencia para actualizar' };
    }

    const incident = await this._updateHistoricalRow(table, fieldsToUpdate, incidentId);

    if (!incident) {
      return { incident: null, errorCode: ErrorCode.NOT_FOUND, message: 'No se encontro la incidencia para actualizar' };
    }

    this.loggerService.saveIncidentLogger({
      id: incidentDto.id,
      userId,
      typeOperation: TypeOperation.UPDATE,
      incident,
    });

    return { incident, errorCode: ErrorCode.NONE };

  }

}
