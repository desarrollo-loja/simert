import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import handleDbExceptions from 'src/common/exceptions/error.db.exception';
import { ErrorCode } from 'src/common/glob/error';
import { TypeOperation } from 'src/common/glob/type/type_operation';
import { LoggerService } from 'src/common/logger.service.ts';
import { Not, Repository } from 'typeorm';

import { CreateIncidentTypeDto } from './dto/create-incident-type.dto';
import { IncidentTypeFilterDto } from './dto/incident-type-filterdto.dto';
import { UpdateIncidentTypeDto } from './dto/update-incident-type.dto';
import { IncidentType } from './entities/incident-type.entity';

/**
 * Service for managing IncidentType (fine category) records. Provides full
 * CRUD with duplicate-code validation, activation/deactivation, and audit
 * logging via {@link LoggerService}.
 */
@Injectable()
export class IncidentTypeService {
  private readonly logger = new Logger(IncidentTypeService.name);

  /**
   *
   * @param incidentTypeRepository
   * @param loggerService
   */
  constructor(
    @InjectRepository(IncidentType)
    private readonly incidentTypeRepository: Repository<IncidentType>,

    @Inject(LoggerService)
    private readonly loggerService: LoggerService,
  ) {}

  /**
   * Creates a new incident type after validating that neither the `code` nor
   * the `name` is already taken.
   *
   * - Duplicate code: returns `{ errorCode: NAMEUNIQUE }` (HTTP 200) to match
   *   the update behavior and avoid a spurious 400 in client consoles.
   * - Duplicate name: throws `BadRequestException` with `{ codeError: NAMEUNIQUE }`.
   *
   * @param userId ID of the admin user performing the operation (for audit log).
   * @param createIncidentTypeDto Fields for the new incident type.
   * @returns `{ incidentType, errorCode: NONE }` on success, or an error
   *   envelope when the code/name is already taken.
   * @throws Delegates DB errors to {@link handleDbExceptions}.
   */
  async create(userId: number, createIncidentTypeDto: CreateIncidentTypeDto) {
    const existingByCode = await this.incidentTypeRepository.findOne({
      where: { code: createIncidentTypeDto.code },
    });

    if (existingByCode) {
      return {
        errorCode: ErrorCode.NAMEUNIQUE,
        message: 'El código ya existe',
      };
    }

    const existingByName = await this.incidentTypeRepository.findOne({
      where: { name: createIncidentTypeDto.name },
    });

    if (existingByName) {
      throw new BadRequestException({
        codeError: ErrorCode.NAMEUNIQUE,
        message: 'El nombre ya existe',
      });
    }

    try {
      const incidentType = this.incidentTypeRepository.create({
        ...createIncidentTypeDto,
      });
      const savedIncidentType =
        await this.incidentTypeRepository.save(incidentType);

      this.loggerService.saveIncidentTypeLoggerModel({
        id: savedIncidentType.id,
        userId,
        typeOperation: TypeOperation.CREATE,
        incidentType: savedIncidentType,
      });

      return { incidentType: savedIncidentType, errorCode: ErrorCode.NONE };
    } catch (error) {
      handleDbExceptions(error, this.logger);
    }
  }

  /**
   * Returns a paginated list of incident types filtered by the supplied DTO.
   * Supports free-text search on `name` (ILIKE) and date range on `createdAt`.
   *
   * @param filterDto Filter fields: `search`, `dateFrom`, `dateTo`.
   * @returns `{ incidentTypes, errorCode: NONE }` with rows sorted by
   *   `createdAt` descending.
   * @throws Delegates DB errors to {@link handleDbExceptions}.
   */
  async findAll(filterDto: IncidentTypeFilterDto) {
    const table = 'public."incidentType"';

    const { conditions, parameters } =
      this._buildConditionsAndParametersPg(filterDto);

    let queryInfo = `
    SELECT
      it."id",
      it."name",
      it."description",
      it."isActivated",
      TO_CHAR(it."createdAt", 'YYYY-MM-DD"T"HH24:MI:SS.MS') AS "createdAt",
      TO_CHAR(it."updatedAt", 'YYYY-MM-DD"T"HH24:MI:SS.MS') AS "updatedAt",
      it."percentage",
      it."code"
    FROM ${table} it
  `;

    if (conditions.length > 0) {
      queryInfo += ' WHERE ' + conditions.join(' AND ');
    }

    queryInfo += ' ORDER BY it."createdAt" DESC;';

    try {
      const incidentTypes = await this.incidentTypeRepository.query(
        queryInfo,
        parameters,
      );
      return { incidentTypes, errorCode: ErrorCode.NONE };
    } catch (error) {
      handleDbExceptions(error, this.logger);
    }
  }

  /**
   * Updates an existing incident type by id after validating uniqueness of
   * `name` and `code` against other records.
   *
   * - Duplicate name among other records: throws `BadRequestException`.
   * - Duplicate code among other records: returns `{ errorCode: NAMEUNIQUE }`.
   * - Record not found: returns `{ errorCode: NOT_FOUND }`.
   *
   * @param userId ID of the admin user performing the operation (for audit log).
   * @param id ID of the incident type to update.
   * @param updateIncidentTypeDto Partial fields to apply.
   * @returns `{ errorCode: NONE, incidentType }` on success, or an error
   *   envelope otherwise.
   * @throws Delegates DB errors to {@link handleDbExceptions}.
   */
  async update(
    userId: number,
    id: number,
    updateIncidentTypeDto: UpdateIncidentTypeDto,
  ) {
    try {
      const existingByName = await this.incidentTypeRepository.findOne({
        where: { name: updateIncidentTypeDto.name, id: Not(id) },
      });

      if (existingByName) {
        throw new BadRequestException({
          codeError: ErrorCode.NAMEUNIQUE,
          message: 'El nombre ya existe',
        });
      }

      const existingByCode = await this.incidentTypeRepository.findOne({
        where: { code: updateIncidentTypeDto.code, id: Not(id) },
      });

      if (existingByCode) {
        return {
          errorCode: ErrorCode.NAMEUNIQUE,
          message: 'El código ya existe',
        };
      }

      const incidentType = await this.incidentTypeRepository.preload({
        id: id,
        ...updateIncidentTypeDto,
      });

      if (incidentType) {
        await this.incidentTypeRepository.save(incidentType);
        this.loggerService.saveIncidentTypeLoggerModel({
          id: incidentType.id,
          userId,
          typeOperation: TypeOperation.UPDATE,
          incidentType,
        });
        return { errorCode: ErrorCode.NONE, incidentType };
      }

      return {
        errorCode: ErrorCode.NOT_FOUND,
        message: 'Error al actualizar el tipo de incidente',
      };
    } catch (error) {
      handleDbExceptions(error, this.logger);
    }
  }

  /**
   * Fetches a single incident type by its primary key.
   *
   * @param id ID of the incident type to retrieve.
   * @returns `{ incidentType, errorCode: NONE }` when found, or
   *   `{ errorCode: NOT_FOUND, message }` otherwise.
   */
  async getTypeIncidentById(id: number) {
    try {
      const incidentType = await this.incidentTypeRepository.findOne({
        where: { id },
      });

      if (!incidentType) {
        return {
          errorCode: ErrorCode.NOT_FOUND,
          message: 'Tipo de incidente no encontrado',
        };
      }
      return { incidentType, errorCode: ErrorCode.NONE };
    } catch {
      return {
        errorCode: ErrorCode.NOT_FOUND,
        message: 'Tipo de incidente no encontrado',
      };
    }
  }

  /**
   * Soft-deletes an incident type by setting `isActivated` to `false`.
   *
   * @param id ID of the incident type to deactivate.
   * @returns `{ incidentType }` with the updated entity when found,
   *   or `undefined` when the record does not exist.
   * @throws Delegates DB errors to {@link handleDbExceptions}.
   */
  async remove(id: number) {
    try {
      const incidentType = await this.incidentTypeRepository.findOne({
        where: { id },
      });
      if (incidentType) {
        incidentType.isActivated = false;
        await this.incidentTypeRepository.save(incidentType);
        return { incidentType };
      }
    } catch (error) {
      handleDbExceptions(error, this.logger);
    }
  }

  /**
   * Builds parameterized WHERE conditions for the `findAll` query.
   *
   * @param filterDto Filter fields: `search` (ILIKE on name), `dateFrom`,
   *   `dateTo` (range on `createdAt`).
   * @returns `{ conditions, parameters }` ready for a raw SQL query with
   *   positional `$N` placeholders.
   */
  private _buildConditionsAndParametersPg(filterDto: IncidentTypeFilterDto): {
    conditions: string[];
    parameters: any[];
  } {
    const { search = '', dateFrom, dateTo } = filterDto;

    const conditions: string[] = [];
    const parameters: any[] = [];

    const addParam = (value: any) => {
      parameters.push(value);
      return `$${parameters.length}`;
    };

    if (
      search.trim() &&
      search.trim() !== 'undefined' &&
      search.trim() !== 'null' &&
      search.trim() !== ''
    ) {
      // ILIKE performs case-insensitive pattern matching in Postgres.
      conditions.push(`it."name" ILIKE ${addParam(`%${search}%`)}`);
    }

    if (dateFrom && dateTo) {
      conditions.push(
        `it."createdAt" BETWEEN ${addParam(dateFrom)} AND ${addParam(dateTo)}`,
      );
    }

    return { conditions, parameters };
  }
}
