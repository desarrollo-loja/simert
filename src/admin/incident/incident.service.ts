import { Inject, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import axios, { AxiosRequestConfig } from 'axios';
import { JwtPayload } from 'src/auth/interfaces';
import { CommonGimService } from 'src/common/common.gim.service';
import { FilterDto } from 'src/common/dto/filter.dto';
import handleDbExceptions from 'src/common/exceptions/error.db.exception';
import { ErrorCode } from 'src/common/glob/error';
import { IncidentStatus } from 'src/common/glob/type/type_incident';
import { InternalStateIncident } from 'src/common/glob/type/type_internal_state_incident';
import { TypeRol } from 'src/common/glob/type/type_rol';
import { LoggerService } from 'src/common/logger.service.ts';
import { Repository } from 'typeorm';

import { CreateIncidentDto } from './dto/create-incident.dto';
import { IncidentDto } from './dto/incident.dto';
import { IncidentFilterDto } from './dto/incident-filterdto.dto';
import { UpdateIncidentDto } from './dto/update-incident.dto';
import { Incident } from './entities/incident.entity';

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

  // Validates that `year` and `month` are safe integers within sensible bounds
  // before being interpolated into a SQL identifier (historical table name).
  // Existence of the resulting table is still verified via `_tableExists` against
  // `information_schema`, but this guard prevents malformed identifiers reaching
  // the query string at all.
  private _isValidYearMonth(year: any, month: any): boolean {
    const y = Number(year);
    const m = Number(month);
    return (
      Number.isInteger(y) && y >= 2000 && y <= 2100 &&
      Number.isInteger(m) && m >= 1 && m <= 12
    );
  }

  async create(createIncidentDto: CreateIncidentDto) {
    try {
      const incident = this.incidentRepository.create({ ...createIncidentDto });
      const savedIncident = await this.incidentRepository.save(incident);
      return { incident: savedIncident, errorCode: ErrorCode.NONE };
    } catch (error) {
      handleDbExceptions(error, this.logger);
    }
  }

  async findAll(filterDto: IncidentFilterDto, user: JwtPayload) {
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
        // No historical table for the requested year/month: return empty result.
        return { incidents: [], errorCode: ErrorCode.NONE, message: 'No se encontro la tabla' };
      }
    }

    const { roles } = user;

    const internalState = this._getInternalStateIncident(roles);

    const { conditions, parameters } = this._buildConditionsAndParametersPg(filterDto);

    // Adds an extra value to the parameters array and returns its $N placeholder.
    const addParamOutside = (value: any) => {
      parameters.push(value);
      return `$${parameters.length}`;
    };

    // Filter incidents by the internal state(s) derived from the caller roles.
    if (Array.isArray(internalState) && internalState.length > 0) {
      const placeholders = internalState.map(v => addParamOutside(v)).join(', ');
      conditions.push(`i."internalState" IN (${placeholders})`);
    }

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
        queryInfo += ` LIMIT ${addParamOutside(lim)}`;
      }
    }

    if (filterDto.offset !== undefined && filterDto.offset !== null) {
      const off = Math.trunc(Number(filterDto.offset));
      if (Number.isFinite(off) && off >= 0) {
        queryInfo += ` OFFSET ${addParamOutside(off)}`;
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

  async findAllTotal(filterDto: IncidentFilterDto, user: JwtPayload) {
    const table = 'public.incident';
    const { conditions, parameters } = this._buildConditionsAndParametersPg(filterDto);

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

  private _getInternalStateIncident(roles: string[]) {
    const roleStateMap: Partial<Record<TypeRol, InternalStateIncident>> = {
      [TypeRol.SIMERT_ADMINISTRATION]: InternalStateIncident.SIMERT_ADMINISTRATION,
      [TypeRol.TRAFFIC_POLICE_STATION]: InternalStateIncident.TRAFFIC_POLICE_STATION,
      [TypeRol.REVENUE_DEPARTMENT]: InternalStateIncident.REVENUE_DEPARTMENT,
    };

    const internalState: InternalStateIncident[] = roles
      .filter(role => roleStateMap[role] !== undefined)
      .map(role => roleStateMap[role]!);

    return internalState;
  }

  async findOne(id: number) {
    const incident = await this.incidentRepository.findOne({ where: { id } });
    return { incident, errorCode: ErrorCode.NONE };
  }

  async update(
    id: number,
    updateIncidentDto: UpdateIncidentDto,
    isTransacional: number,
  ) {
    try {
      // Case 1: transactional flag set => update the main `public.incident` table.
      if (isTransacional) {
        const incident = await this.incidentRepository.preload({
          id,
          ...updateIncidentDto,
        });

        if (!incident) {
          return { incident: null, errorCode: ErrorCode.NOT_FOUND };
        }

        await this.incidentRepository.save(incident);
        return { incident, errorCode: ErrorCode.NONE };
      }

      // Case 2: historical update. Read createdAt to derive the target year/month
      // table; identifier is built from DB-owned data, not user input.
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

      const table = `history."${year}_${month}_incident"`;

      const exists = await this._tableExists(table);
      if (!exists) {
        // Same policy as findAll: no fallback to main table when historical
        // table is missing.
        return { incident: null, errorCode: ErrorCode.NONE };
      }

      // Direct UPDATE on the historical table.
      const result = await this.incidentRepository
        .createQueryBuilder()
        .update(table)
        .set(updateIncidentDto)
        .where('id = :id', { id })
        .returning('*')
        .execute();

      const incident = result.raw?.[0] ?? null;

      return { incident, errorCode: ErrorCode.NONE };
    } catch (error) {
      handleDbExceptions(error, this.logger);
    }
  }

  async updateStatusGim(id: number, updateIncidentDto: UpdateIncidentDto) {
    try {
      const incident = await this.incidentRepository.preload({
        id: id,
        ...updateIncidentDto,
      });

      if (incident) {
        await this.incidentRepository.save(incident);
        return { incident, errorCode: ErrorCode.NONE };
      }
    } catch (error) {
      handleDbExceptions(error, this.logger);
    }
  }

  async uploadToAlfresco(
    fileBuffer: Buffer,
    fileName: string,
    relativePath?: string,
  ): Promise<Object> {
    try {
      const alfrescoBaseUrl = process.env.ALFRESCO_BASE_URL;
      const username = process.env.ALFRESCO_USER;
      const password = process.env.ALFRESCO_PASS;
      const directory = process.env.ALFRESCO_DIR;

      if (!alfrescoBaseUrl || !username || !password) {
        this.logger.error('Alfresco configuration is missing in environment variables');
        return { errorCode: ErrorCode.HTTP_ERROR_REINTENT };
      }

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

  async getFileUrlAlfresco(alfrescoId: string): Promise<Object> {
    try {
      const alfrescoBaseUrl = process.env.ALFRESCO_BASE_URL;
      const username = process.env.ALFRESCO_USER;
      const password = process.env.ALFRESCO_PASS;

      if (!alfrescoBaseUrl || !username || !password) {
        this.logger.error('Alfresco configuration is missing in environment variables');
        return { errorCode: ErrorCode.HTTP_ERROR_REINTENT };
      }

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

  async remove(id: number) {
    try {
      const incident = await this.incidentRepository.findOne({ where: { id } });
      if (incident) {
        // Soft-delete: business rule is to deactivate, not physically remove.
        incident.isActivated = false;
        await this.incidentRepository.save(incident);
        return { incident, errorCode: ErrorCode.NONE };
      }
    } catch (error) {
      handleDbExceptions(error, this.logger);
    }
  }

  async findStatistics(filterDto: IncidentFilterDto) {

    try {

      let tableName = 'public.incident';

      const { parameters, conditions } = this._buildConditionsAndParametersPg(filterDto);

      let query = `
              SELECT
                i."incidentTypeId",
                COUNT(i.id) as total,
                it.name as name
              FROM ${tableName} i
              INNER JOIN public."incident_type" it ON i."incidentTypeId" = it.id
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

  async findStatisticsByFraction(filterDto: IncidentFilterDto) {

    try {

      let tableName = 'public.incident';

      const { parameters, conditions } = this._buildConditionsAndParametersPg(filterDto);

      let query = `
              SELECT
                i."incidentTypeId",
                COUNT(i.id) as total,
                it.name as name
              FROM ${tableName} i
              INNER JOIN public."incident_type" it ON i."incidentTypeId" = it.id
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

  private _buildConditionsAndParametersPg(
    filterDto: IncidentFilterDto,
    excludeStatus = []
  ): { conditions: string[]; parameters: any[] } {

    const {
      search = '',
      incidentTypeId,
      statusIncident,
      dateFrom,
      dateTo,
      zoneId,
      blockId,
      userId,
      blockOperatorId,
      incidentCategory

    } = filterDto;

    const conditions: string[] = [];
    const parameters: any[] = [];

    const addParam = (value: any) => {
      parameters.push(value);
      return `$${parameters.length}`;
    };

    // Search guard: ignore empty/whitespace strings and literal 'undefined'/'null'
    // sent by clients that stringify missing values.
    if (search && search.trim() && search.trim() !== 'undefined' && search.trim() !== 'null' && search.trim() !== '') {
      conditions.push(`(i."description" ILIKE ${addParam(`%${search}%`)} OR i."plate" ILIKE ${addParam(`%${search}%`)} OR i."supervisorObservations" ILIKE ${addParam(`%${search}%`)})`);
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
    if (userId) {
      conditions.push(`i."controllerId" = ${addParam(userId)}`);
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

  async findAllFractionSanction(filterDto: FilterDto) {

    try {
      const { year, month, limit = 10, offset = 0, typeFractionId } = filterDto;

      let tableNameIncident = 'public.incident';
      let tableNameFraction = 'public.fraction';
      let tableExistsIncident = false;
      let tableExistsFraction = false;
      let schema = 'history';

      if (year && month && this._isValidYearMonth(year, month)) {
        const monthString = month.toString().padStart(2, '0')

        let tableNameIncidentAux = `"${year}_${monthString}_incident"`;
        tableNameIncidentAux = `${schema}.${tableNameIncidentAux}`;
        tableExistsIncident = await this._tableExists(tableNameIncidentAux);

        let tableNameFractionAux = `"${year}_${monthString}_fraction"`;
        tableNameFractionAux = `${schema}.${tableNameFractionAux}`;
        tableExistsFraction = await this._tableExists(tableNameFractionAux);

        if (tableExistsIncident) {
          tableNameIncident = tableNameIncidentAux;
        }

        // Only route the fraction join to the historical table when BOTH the
        // incident and the fraction archive exist for the requested period.
        // Mixing historical incidents with public fractions (or vice versa)
        // can leave rows orphaned by the INNER JOIN once fractions are purged
        // from public.fraction after monthly archival.
        if (tableExistsIncident && tableExistsFraction) {
          tableNameFraction = tableNameFractionAux;
        }
      }

      const { parameters, conditions } = this._buildConditionsAndParametersPg(filterDto);

      if (typeFractionId) {
        parameters.push(typeFractionId);
        conditions.push(`f."typeFraction" = $${parameters.length}`);
      }

      let query = `
          SELECT
            i.id, i."zoneId", i."blockId", i."controllerId", i."statusIncident", i."plate", i."description",
            TO_CHAR(i."createdAt", 'YYYY-MM-DD"T"HH24:MI:SS.MS') AS "createdAt",
            it.name as reason,
            z.name as "nameZone",
            b.name as "nameBlock",
            f.time as "timeFraction"
          FROM
            ${tableNameIncident} i
            INNER JOIN public."incident_type" it ON i."incidentTypeId" = it.id
            INNER JOIN public.zone z ON z.id = i."zoneId"
            INNER JOIN public.block b ON b.id = i."blockId"
            INNER JOIN ${tableNameFraction} f ON f.id = i."fractionId"
            WHERE i."fractionId" IS NOT NULL
        `;

      if (conditions.length > 0) {
        query += ' AND ' + conditions.join(' AND ');
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

  async findAllFractionSanctionTotal(filterDto: FilterDto) {

    try {
      const { year, month, typeFractionId } = filterDto;

      let tableNameIncident = 'public.incident';
      let tableNameFraction = 'public.fraction';
      let tableExistsIncident = false;
      let tableExistsFraction = false;
      let schema = 'history';

      if (year && month && this._isValidYearMonth(year, month)) {
        const monthString = month.toString().padStart(2, '0')

        let tableNameIncidentAux = `"${year}_${monthString}_incident"`;
        tableNameIncidentAux = `${schema}.${tableNameIncidentAux}`;
        tableExistsIncident = await this._tableExists(tableNameIncidentAux);

        let tableNameFractionAux = `"${year}_${monthString}_fraction"`;
        tableNameFractionAux = `${schema}.${tableNameFractionAux}`;
        tableExistsFraction = await this._tableExists(tableNameFractionAux);

        if (tableExistsIncident) {
          tableNameIncident = tableNameIncidentAux;
        }

        // Mirror the list query in findAllFractionSanction: only route to the
        // historical fraction table when both archives exist for the period.
        if (tableExistsIncident && tableExistsFraction) {
          tableNameFraction = tableNameFractionAux;
        }
      }

      const { parameters, conditions } = this._buildConditionsAndParametersPg(filterDto);

      if (typeFractionId) {
        parameters.push(typeFractionId);
        conditions.push(`f."typeFraction" = $${parameters.length}`);
      }

      // Use the same FROM/JOIN chain as findAllFractionSanction so the total
      // matches the paginated list row-by-row. Any incident whose related
      // zone/block/fraction is missing is excluded from both queries identically.
      let query = `
          SELECT
            COUNT(*) as total
          FROM
            ${tableNameIncident} i
            INNER JOIN public."incident_type" it ON i."incidentTypeId" = it.id
            INNER JOIN public.zone z ON z.id = i."zoneId"
            INNER JOIN public.block b ON b.id = i."blockId"
            INNER JOIN ${tableNameFraction} f ON f.id = i."fractionId"
            WHERE i."fractionId" IS NOT NULL
       `;

      if (conditions.length > 0) {
        query += ' AND ' + conditions.join(' AND ');
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

  // Verifies the existence of a fully-qualified schema-prefixed table via
  // information_schema. Returns false (and logs) if the name has no schema.
  private async _tableExists(tableName: string): Promise<boolean> {
    const names = tableName.split('.');
    if (names.length <= 1) {
      this.logger.error(`No schema was specified for table ${tableName}`);
      return false;
    }

    const table_schema = names[0].replace(/"/g, '').trim();
    const table_name = names[1].replace(/"/g, '').trim();

    const query = `
    SELECT EXISTS(
      SELECT 1
      FROM information_schema.tables
      WHERE table_schema = $1
        AND table_name = $2
    ) AS "exists";
  `;

    const result = await this.incidentRepository.query(query, [table_schema, table_name]);
    return !!result[0]?.exists;
  }

  async findAllTotalVehicleClientTime(filterDto: FilterDto) {
    try {
      const { year, month, dateFrom, dateTo, typeFractionId } = filterDto;

      let tableNameIncident = 'public.incident';
      let tableNameFraction = 'public.fraction';
      let tableExistsIncident = false;
      let tableExistsFraction = false;
      let schema = 'history';

      if (year && month && this._isValidYearMonth(year, month)) {
        const monthString = month.toString().padStart(2, '0')

        let tableNameIncidentAux = `"${year}_${monthString}_incident"`;
        tableNameIncidentAux = `${schema}.${tableNameIncidentAux}`;
        tableExistsIncident = await this._tableExists(tableNameIncidentAux);

        let tableNameFractionAux = `"${year}_${monthString}_fraction"`;
        tableNameFractionAux = `${schema}.${tableNameFractionAux}`;
        tableExistsFraction = await this._tableExists(tableNameFractionAux);

        if (tableExistsIncident) {
          tableNameIncident = tableNameIncidentAux;
        }

        if (tableExistsFraction) {
          tableNameFraction = tableNameFractionAux;
        }
      }

      const { parameters, conditions } = this._buildConditionsAndParametersPg(filterDto);

      if (typeFractionId) {
        parameters.push(typeFractionId);
        conditions.push(`fraction."typeFraction" = $${parameters.length}`);
      }

      let query = `
          SELECT
            COUNT(DISTINCT fraction.plate) AS "totalVehicle",
            COUNT(DISTINCT fraction."userId") AS "totalClient",
            SUM(fraction.time)::time AS "totalTime"
          FROM
            ${tableNameIncident} i
            INNER JOIN ${tableNameFraction} fraction ON fraction.id = i."fractionId"
            WHERE i."fractionId" IS NOT NULL
       `;

      if (conditions.length > 0) {
        query += ' AND ' + conditions.join(' AND ');
      }

      const fractionSanction = await this.incidentRepository.query(query, parameters);

      return {
        fractionSanction
      };

    } catch (error) {
      handleDbExceptions(error, this.logger);
    }
  }

  async findAllStatisticsFractionSanction(filterDto: FilterDto) {
    const { year, month, typeFractionId } = filterDto;
    try {
      let tableNameIncident = 'public.incident';
      let tableNameFraction = 'public.fraction';
      let tableExistsIncident = false;
      let tableExistsFraction = false;
      let schema = 'history';

      if (year && month && this._isValidYearMonth(year, month)) {
        const monthString = month.toString().padStart(2, '0')

        let tableNameIncidentAux = `"${year}_${monthString}_incident"`;
        tableNameIncidentAux = `${schema}.${tableNameIncidentAux}`;
        tableExistsIncident = await this._tableExists(tableNameIncidentAux);

        let tableNameFractionAux = `"${year}_${monthString}_fraction"`;
        tableNameFractionAux = `${schema}.${tableNameFractionAux}`;
        tableExistsFraction = await this._tableExists(tableNameFractionAux);

        if (tableExistsIncident) {
          tableNameIncident = tableNameIncidentAux;
        }

        if (tableExistsFraction) {
          tableNameFraction = tableNameFractionAux;
        }
      }

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
              MAX(fraction.time) AS "time",
            COUNT(*) FILTER (WHERE fraction."zoneId" IS NOT NULL) AS "totalZone",
            COUNT(*) FILTER (WHERE fraction."blockId" IS NOT NULL) AS "totalBlock",
            COUNT(*) FILTER (WHERE fraction.time IS NOT NULL) AS "totalTime"
          FROM
              ${tableNameIncident} i
                  INNER JOIN
              ${tableNameFraction} fraction ON fraction.id = i."fractionId"
                  INNER JOIN
              public.zone z ON z.id = fraction."zoneId"
                  INNER JOIN
              public.block b ON b.id = fraction."blockId"
        `;

      if (conditions.length > 0) {
        query += ' WHERE ' + conditions.join(' AND ');
      }

      query += ' GROUP BY fraction."zoneId" , fraction."blockId" , fraction.time';

      const fractionSanction = await this.incidentRepository.query(query, parameters);

      return {
        fractionSanction
      }

    } catch (error) {
      handleDbExceptions(error, this.logger);
    }
  }

  // Reads pending incidents and synchronizes their state against GIM, marking
  // those that match an active obligation as emitted.
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

    const updateIncidentDto = {
      internalState,
    }

    // Case 1: transactional flag set => update the main `public.incident` table.
    if (isTransacional) {
      const incident = await this.incidentRepository.preload({
        id: incidentDto.id,
        ...updateIncidentDto,
      });

      if (!incident) {
        return { incident: null, errorCode: ErrorCode.NOT_FOUND, message: 'No se encontro la incidencia para actualizar' };
      }

      await this.incidentRepository.save(incident);
      return { incident, errorCode: ErrorCode.NONE };
    }

    // Case 2: historical update. Read createdAt to derive the target year/month
    // table; identifier is built from DB-owned data, not user input.
    const current = await this.incidentRepository.findOne({
      where: { id: incidentDto.id },
      select: ['id', 'createdAt'],
    });

    if (!current?.createdAt) {
      return { incident: null, errorCode: ErrorCode.NOT_FOUND, message: 'No se encontro la incidencia para actualizar' };
    }

    const date = new Date(current.createdAt);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');

    const table = `history."${year}_${month}_incident"`;

    const exists = await this._tableExists(table);
    if (!exists) {
      return { incident: null, errorCode: ErrorCode.NONE, message: 'No se encontro la incidencia para actualizar' };
    }

    const result = await this.incidentRepository
      .createQueryBuilder()
      .update(table)
      .set(updateIncidentDto)
      .where('id = :id', { id: incidentDto.id })
      .returning('*')
      .execute();

    const incident = result.raw?.[0] ?? null;

    if (!incident) {
      return { incident: null, errorCode: ErrorCode.NOT_FOUND, message: 'No se encontro la incidencia para actualizar' };
    }

    return { incident, errorCode: ErrorCode.NONE };

  }

}
