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
/**
 * Service for managing Zone entities — the top-level geographic unit in the
 * Zone → Block → Slot hierarchy. Handles CRUD, GeoJSON multi-polygon parsing,
 * geofence updates and audit logging via {@link LoggerService}.
 */
@Injectable()
export class ZoneService {

  private readonly logger = new Logger(ZoneService.name);

  constructor(
    @InjectRepository(Zone)
    private readonly zoneRepository: Repository<Zone>,

    @Inject(LoggerService)
    private readonly loggerService: LoggerService,

  ) { }

  /**
   * Creates a new zone with an optional geofence polygon.
   * Returns `NAMEUNIQUE` when a duplicate name constraint is violated.
   *
   * @param userId        ID of the authenticated user performing the operation.
   * @param createZoneDto Creation payload (name, color, geofence WKT, etc.).
   * @returns `{ errorCode, zone }`.
   */
  async create(userId: number, createZoneDto: CreateZoneDto) {
    try {
      const zoneEntity = this.zoneRepository.create({ ...createZoneDto });

      if (createZoneDto.geofence) {
        const wkt = `POLYGON((${createZoneDto.geofence}))`;
        zoneEntity.geofence = () => `ST_GeomFromText('${wkt}')`;
      }

      const zone = await this.zoneRepository.save(zoneEntity);
      this.loggerService.saveZoneLogger({ id: zone.id, userId, typeOperation: TypeOperation.CREATE, zone });
      return { errorCode: ErrorCode.NONE, zone };
    } catch (error) {
      const driverError = (error as any).driverError;
      // PostgreSQL error code 23505 = unique_violation
      if (error instanceof QueryFailedError && driverError?.code === '23505') {
        this.logger.error(`Unique constraint violated: ${driverError.constraint}`);
        return { errorCode: ErrorCode.NAMEUNIQUE };
      }
      handleDbExceptions(error, this.logger);
    }
  }

  /**
   * Returns zones filtered for the parking map view (id, name, color, parsed geofence).
   *
   * @param paginationDto Optional `search` filter.
   * @returns `{ zones }` with parsed multi-polygon geofence arrays.
   */
  async findAllByFilterParking(paginationDto: FilterDto) {
    const { search } = paginationDto;
    try {
      const queryBuilder = this.zoneRepository.createQueryBuilder('z')
        .select(['z.id', 'z.name', 'z.geofence', 'z.color']);

      if (search) {
        queryBuilder.andWhere('z.name ILIKE :search', { search: `%${search}%` });
      }

      let zones = await queryBuilder.getMany();

      if (zones.length > 0) {
        zones = zones.map(zone => ({
          ...zone,
          geofence: parseGeoJsonMultiPolygon(zone.geofence),
        }) as Zone);
      }

      return { zones };
    } catch (error) {
      handleDbExceptions(error, this.logger);
    }
  }

  /**
   * Returns all zones with their full payload and parsed multi-polygon geofences.
   *
   * @param filterDto Optional `search` filter.
   * @returns `{ errorCode, zones }` with a `numberPolygon` count per zone.
   */
  async findAll(filterDto: FilterDto) {
    try {
      const { search } = filterDto;
      const queryBuilder = this.zoneRepository.createQueryBuilder('z')
        .select(['z.id', 'z.name', 'z.color', 'z.acronym', 'z.lt', 'z.lg',
          'z.geofence', 'z.isActivated', 'z.description', 'z.schedules', 'z.type', 'z.fromTemporary', 'z.toTemporary']);

      if (search) {
        queryBuilder.where('z.name ILIKE :search', { search: `%${search}%` });
      }

      const zones = await queryBuilder.getMany();

      if (zones.length > 0) {
        const zonesWithParsedGeofence = zones.map(zone => {
          const geofenceData = parseGeoJsonMultiPolygon(zone.geofence);
          return { ...zone, geofence: geofenceData, numberPolygon: geofenceData.length };
        });
        return { errorCode: ErrorCode.NONE, zones: zonesWithParsedGeofence };
      }
      return { errorCode: ErrorCode.NONE, zones: [] };
    } catch (error) {
      handleDbExceptions(error, this.logger);
    }
  }

  /**
   * Returns only active zones (id, name) with an optional name filter.
   *
   * @param filterDto Optional `search` filter.
   * @returns `{ errorCode, zones }` with reduced zone objects.
   */
  async findAllByActive(filterDto: FilterDto) {
    return this._queryActiveZones(filterDto);
  }

  /**
   * Alias for {@link findAllByActive} — kept for backward compatibility with
   * existing client calls to the `find-all-actives` endpoint.
   *
   * @param filterDto Optional `search` filter.
   * @returns `{ errorCode, zones }` with reduced zone objects.
   */
  async findAllByActives(filterDto: FilterDto) {
    return this._queryActiveZones(filterDto);
  }

  /**
   * Shared implementation for active-zone listing.
   * Extracted to avoid duplicating the identical query in `findAllByActive`
   * and `findAllByActives`.
   *
   * @param filterDto Optional `search` filter.
   * @returns `{ errorCode, zones }`.
   */
  private async _queryActiveZones(filterDto: FilterDto) {
    try {
      const { search } = filterDto;
      const queryBuilder = this.zoneRepository.createQueryBuilder('z')
        .select(['z.id', 'z.name'])
        .where('z.isActivated = :isActivated', { isActivated: true });

      if (search) {
        queryBuilder.andWhere('z.name ILIKE :search', { search: `%${search}%` });
      }

      const zones = await queryBuilder.getMany();
      return { errorCode: ErrorCode.NONE, zones };
    } catch (error) {
      handleDbExceptions(error, this.logger);
    }
  }

  /**
   * Updates an existing zone and writes an audit log entry.
   * Returns an empty zone object when the id is not found.
   * Returns `NAMEUNIQUE` on duplicate name constraint violation.
   *
   * @param userId        ID of the authenticated user performing the operation.
   * @param id            Target zone ID.
   * @param updateZoneDto Fields to update.
   * @returns `{ errorCode, zone }`.
   */
  async update(userId: number, id: number, updateZoneDto: UpdateZoneDto) {
    try {
      const zone = await this.zoneRepository.preload({ id, ...updateZoneDto });
      if (zone) {
        if (updateZoneDto.geofence) {
          const wkt = `${updateZoneDto.geofence}`;
          zone.geofence = () => `ST_GeomFromText('${wkt}')`;
        }
        await this.zoneRepository.save(zone);
        this.loggerService.saveZoneLogger({ id: zone.id, userId, typeOperation: TypeOperation.UPDATE, zone });
        return { errorCode: ErrorCode.NONE, zone };
      }
      return { errorCode: ErrorCode.NONE, zone: {} };
    } catch (error) {
      const driverError = (error as any).driverError;
      // PostgreSQL error code 23505 = unique_violation
      if (error instanceof QueryFailedError && driverError?.code === '23505') {
        this.logger.error(`Unique constraint violated: ${driverError.constraint}`);
        return { errorCode: ErrorCode.NAMEUNIQUE };
      }
      handleDbExceptions(error, this.logger);
    }
  }

  /**
   * Soft-deletes a zone by setting `isActivated = false` and writing an audit log entry.
   * Returns an empty zone object when the id is not found.
   *
   * @param userId ID of the authenticated user performing the operation.
   * @param id     Target zone ID.
   * @returns `{ errorCode, zone }`.
   */
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
