import { Inject, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { FilterDto } from 'src/common/dto/filter.dto';
import handleDbExceptions from 'src/common/exceptions/error.db.exception';
import { ErrorCode } from 'src/common/glob/error';
import { TypeOperation } from 'src/common/glob/type/type_operation';
import { parseGeoJsonMultiPolygon } from 'src/common/glob/utilities/funtions';
import { LoggerService } from 'src/common/logger.service.ts';
import { QueryFailedError, Repository } from 'typeorm';

import { CreateZoneDto } from './dto/create-zone.dto';
import { UpdateZoneDto } from './dto/update-zone.dto';
import { Zone } from './entities/zone.entity';
@Injectable()
export class ZoneService {

  private readonly logger = new Logger('ZoneService');

  constructor(
    @InjectRepository(Zone)
    private readonly zoneRepository: Repository<Zone>,

    @Inject(LoggerService)
    private readonly loggerService: LoggerService,

  ) { }

  async create(userId: number, createZoneDto: CreateZoneDto) {
    try {
      const query = this.zoneRepository.create({ ...createZoneDto });

      if (createZoneDto.geofence) {
        const wkt = `POLYGON((${createZoneDto.geofence}))`
        query.geofence = () => `ST_GeomFromText('${wkt}')`;
      }

      const zone = await this.zoneRepository.save(query);
      this.loggerService.saveZoneLogger({ id: zone.id, userId: userId, typeOperation: TypeOperation.CREATE, zone });
      return { errorCode: ErrorCode.NONE, zone };
    } catch (error) {
      const driverError = (error as any).driverError;
      // Code 23505: unique constraint violation
      if (error instanceof QueryFailedError && driverError?.code === '23505') {
        // Temporary log: inspect the console to see the real constraint name
        this.logger.error(`Violación detectada en: ${driverError.constraint}`);
        // If the error comes from the composite constraint defined on the entity,
        // adjust the 'UQ_...' name according to what appears in the DB or logs
        if (driverError.constraint?.includes('name')) {
          return { errorCode: ErrorCode.NAMEUNIQUE };
        }
        return { errorCode: ErrorCode.NAMEUNIQUE }; // Generic duplicate error
      }
      // If it is not a duplicate error, let the global handler process it
      handleDbExceptions(error, this.logger);
    }
  }

  async findAllByFilterParking(paginationDto: FilterDto) {
    const { search } = paginationDto;
    try {
      const query = await this.zoneRepository.createQueryBuilder('z')
        .select(['z.id', 'z.name', 'z.geofence', 'z.color']);

      if (search) {
        query.andWhere('z.name ILIKE :search', { search: `%${search}%` });
      }

      let zones = await query.getMany();

      if (zones.length > 0) {
        zones = zones.map(item => {
          const geofenceData = parseGeoJsonMultiPolygon(item.geofence);
          return {
            ...item,
            geofence: geofenceData
          } as Zone
        })
      }

      return { zones };
    } catch (error) {
      handleDbExceptions(error, this.logger);
    }
  }

  async findAll(filterDto: FilterDto) {
    try {
      const { search } = filterDto;
      const query = this.zoneRepository.createQueryBuilder('z')
        .select(['z.id', 'z.name', 'z.color', 'z.acronym', 'z.lt', 'z.lg',
          'z.geofence', 'z.isActivated', 'z.description', 'z.schedules', 'z.type', 'z.fromTemporary', 'z.toTemporary']);

      if (search) {
        query.where('z.name ILIKE :search', { search: `%${search}%` });
      }

      const data = await query.getMany();

      if (data.length > 0) {
        const dataSend = data.map(item => {
          const geofenceData = parseGeoJsonMultiPolygon(item.geofence);
          return {
            ...item,
            geofence: geofenceData,
            numberPolygon: geofenceData.length
          }
        })
        return { errorCode: ErrorCode.NONE, zones: dataSend };
      }
      return { errorCode: ErrorCode.NONE, zones: [] };
    } catch (error) {
      handleDbExceptions(error, this.logger);
    }
  }

  async findAllByActive(filterDto: FilterDto) {
    try {
      const { search } = filterDto;
      const query = this.zoneRepository.createQueryBuilder('z')
        .select(['z.id', 'z.name'])
        .where('z.isActivated = :isActivated', { isActivated: true });

      if (search) {
        query.andWhere('z.name ILIKE :search', { search: `%${search}%` });
      }

      const data = await query.getMany();

      return { errorCode: ErrorCode.NONE, zones: data };
    } catch (error) {
      handleDbExceptions(error, this.logger);
    }
  }

  async findAllByActives(filterDto: FilterDto) {
    try {
      const { search } = filterDto;
      const query = this.zoneRepository.createQueryBuilder('z')
        .select(['z.id', 'z.name'])
        .where('z.isActivated = :isActivated', { isActivated: true })

      if (search) {
        query.andWhere('z.name ILIKE :search', { search: `%${search}%` });
      }

      const data = await query.getMany();

      return { errorCode: ErrorCode.NONE, zones: data };
    } catch (error) {
      handleDbExceptions(error, this.logger);
    }
  }

  async update(userId: number, id: number, updateZoneDto: UpdateZoneDto) {
    try {
      const zone = await this.zoneRepository.preload({ id: id, ...updateZoneDto });
      if (zone) {
        if (updateZoneDto.geofence) {
          const wkt = `${updateZoneDto.geofence}`
          zone.geofence = () => `ST_GeomFromText('${wkt}')`;
        }
        await this.zoneRepository.save(zone);
        this.loggerService.saveZoneLogger({ id: zone.id, userId: userId, typeOperation: TypeOperation.UPDATE, zone });
        return { errorCode: ErrorCode.NONE, zone };
      } else {
        return { errorCode: ErrorCode.NONE, zone: {} };
      }
    } catch (error) {
      const driverError = (error as any).driverError;
      // Code 23505: unique constraint violation
      if (error instanceof QueryFailedError && driverError?.code === '23505') {
        // Temporary log: inspect the console to see the real constraint name
        this.logger.error(`Violación detectada en: ${driverError.constraint}`);
        // If the error comes from the composite constraint defined on the entity,
        // adjust the 'UQ_...' name according to what appears in the DB or logs
        if (driverError.constraint?.includes('name')) {
          return { errorCode: ErrorCode.NAMEUNIQUE };
        }
        return { errorCode: ErrorCode.NAMEUNIQUE }; // Generic duplicate error
      }
      // If it is not a duplicate error, let the global handler process it
      handleDbExceptions(error, this.logger);
    }
  }

  async remove(userId: number, id: number) {
    try {
      const zone = await this.zoneRepository.findOne({ where: { id } });
      if (zone) {
        zone.isActivated = false;
        await this.zoneRepository.save(zone);
        this.loggerService.saveZoneLogger({ id: zone.id, userId, typeOperation: TypeOperation.DELETE, zone });
        return { errorCode: ErrorCode.NONE, zone };
      }
      return { errorCode: ErrorCode.NONE, zone: {} };
    } catch (error) {
      handleDbExceptions(error, this.logger);
    }
  }
}
