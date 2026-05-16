import { BadRequestException, Inject, Injectable, Logger } from '@nestjs/common';
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

@Injectable()
export class IncidentTypeService {
  private readonly logger = new Logger(IncidentTypeService.name);

  constructor(
    @InjectRepository(IncidentType)
    private readonly incidentTypeRepository: Repository<IncidentType>,

    @Inject(LoggerService)
    private readonly loggerService: LoggerService,
  ) { }

  async create(userId: number, createIncidentTypeDto: CreateIncidentTypeDto) {
    const findIncidentTypeCode = await this.incidentTypeRepository.findOne({
      where: { code: createIncidentTypeDto.code },
    });

    if (findIncidentTypeCode) {
      throw new BadRequestException({ codeError: ErrorCode.NAMEUNIQUE, message: 'El código ya existe' });
    }

    const findIncidentType = await this.incidentTypeRepository.findOne({
      where: { name: createIncidentTypeDto.name },
    });

    if (findIncidentType) {
      throw new BadRequestException({ codeError: ErrorCode.NAMEUNIQUE, message: 'El nombre ya existe' });
    }

    try {
      const incidentType = this.incidentTypeRepository.create({ ...createIncidentTypeDto });
      // incidentType.geofence = ... (Not applicable for IncidentType)

      const savedIncidentType = await this.incidentTypeRepository.save(incidentType);

      // Logger specific for IncidentType is not yet implemented in LoggerService. 
      // Assuming generic logging or skipping until Logger model is created.
      this.loggerService.saveIncidentTypeLoggerModel({ id: savedIncidentType.id, userId, typeOperation: TypeOperation.CREATE, incidentType: savedIncidentType });

      return { incidentType: savedIncidentType, errorCode: ErrorCode.NONE };
    } catch (error) {
      handleDbExceptions(error, this.logger);
    }
  }

  async findAll(filterDto: IncidentTypeFilterDto) {
    // const table = 'simert.incident_type';
    const table = 'public.incident_type';

    const { conditions, parameters } = this._buildConditionsAndParametersPg(filterDto);

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
      // this.logger.debug(`SQL => ${queryInfo}`);
      // this.logger.debug(`PARAMS => ${JSON.stringify(parameters)}`);

      const incidentTypes = await this.incidentTypeRepository.query(queryInfo, parameters);
      return { incidentTypes, errorCode: ErrorCode.NONE };
    } catch (error) {
      handleDbExceptions(error, this.logger);
    }
  }

  async update(userId: number, id: number, updateIncidentTypeDto: UpdateIncidentTypeDto) {
    try {

      const findIncidentType = await this.incidentTypeRepository.findOne({
        where: { name: updateIncidentTypeDto.name, id: Not(id) },
      });

      if (findIncidentType) {
        throw new BadRequestException({ codeError: ErrorCode.NAMEUNIQUE, message: 'El nombre ya existe' });
      }

      const findIncidentTypeCode = await this.incidentTypeRepository.findOne({
        where: { code: updateIncidentTypeDto.code, id: Not(id) },
      });

      if (findIncidentTypeCode) {
        // throw new BadRequestException({ codeError: ErrorCode.NAMEUNIQUE, message: 'El código ya existe' });
        return { errorCode: ErrorCode.NAMEUNIQUE, message: 'El código ya existe' };
      }

      const incidentType = await this.incidentTypeRepository.preload({
        id: id,
        ...updateIncidentTypeDto,
      });

      if (incidentType) {
        await this.incidentTypeRepository.save(incidentType);
        this.loggerService.saveIncidentTypeLoggerModel({ id: incidentType.id, userId: userId, typeOperation: TypeOperation.UPDATE, incidentType });
        return { errorCode: ErrorCode.NONE, incidentType };
      }

      return { errorCode: ErrorCode.NOT_FOUND, message: 'Error al actualizar el tipo de incidente' };
    } catch (error) {
      handleDbExceptions(error, this.logger);
    }
  }

  async getTypeIncidentById(id: number) {
    try {
      const incidentType = await this.incidentTypeRepository.findOne({ where: { id } });

      if (!incidentType) {
        return { errorCode: ErrorCode.NOT_FOUND, message: 'Tipo de incidente no encontrado' };
      }
      return { incidentType, errorCode: ErrorCode.NONE };
    } catch (error) {
      return { errorCode: ErrorCode.NOT_FOUND, message: 'Tipo de incidente no encontrado' };
    }
  }

  async remove(id: number) {
    try {
      const incidentType = await this.incidentTypeRepository.findOne({ where: { id } });
      if (incidentType) {
        incidentType.isActivated = false;
        await this.incidentTypeRepository.save(incidentType);
        return { incidentType };
      }
    } catch (error) {
      handleDbExceptions(error, this.logger);
    }
  }

  private _buildConditionsAndParametersPg(
    filterDto: IncidentTypeFilterDto,
  ): { conditions: string[]; parameters: any[] } {

    const {
      search = '',
      dateFrom,
      dateTo,
    } = filterDto;

    const conditions: string[] = [];
    const parameters: any[] = [];

    const addParam = (value: any) => {
      parameters.push(value);
      return `$${parameters.length}`;
    };

    if (search.trim() && search.trim() !== 'undefined' && search.trim() !== 'null' && search.trim() !== '') {
      conditions.push(`it."name" ILIKE ${addParam(`%${search}%`)}`); // ILIKE: case-insensitive match in Postgres
    }

    if (dateFrom && dateTo) {
      conditions.push(`it."createdAt" BETWEEN ${addParam(dateFrom)} AND ${addParam(dateTo)}`);
    }

    return { conditions, parameters };
  }

}
