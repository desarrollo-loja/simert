import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Block } from 'src/admin/block/entities/block.entity';
import { Schedule } from 'src/admin/schedule/entities/schedule.entity';
import { Slot } from 'src/admin/slot/entities/slot.entity';
import { Zone } from 'src/admin/zone/entities/zone.entity';
import { StatusSlot } from 'src/common/glob/status/status_slot';
import { parseGeoJsonMultiPolygon } from 'src/common/glob/utilities/funtions';
import { Repository } from 'typeorm';

import { PublicFilterDto } from './dto/public-filter.dto';
import {
  IPublicService,
  MapDataResponse,
  OccupancySummaryResponse,
  ScheduleListResponse,
  SectorAvailabilityResponse,
  SectorDetailResponse,
  SectorListResponse,
  ZoneAvailabilityResponse,
  ZoneDetailResponse,
  ZoneListResponse,
} from './interfaces/public-service.interface';

/**
 * Read-only service that exposes public parking data.
 *
 * All queries are SELECT-only and never mutate state. Sensitive fields
 * such as user IDs, transactions, and audit records are never returned.
 */
@Injectable()
export class PublicService implements IPublicService {
  private readonly logger = new Logger(PublicService.name);

  constructor(
    @InjectRepository(Zone)
    private readonly zoneRepository: Repository<Zone>,
    @InjectRepository(Block)
    private readonly blockRepository: Repository<Block>,
    @InjectRepository(Slot)
    private readonly slotRepository: Repository<Slot>,
    @InjectRepository(Schedule)
    private readonly scheduleRepository: Repository<Schedule>,
  ) {}

  /**
   * Returns all active zones with basic display information.
   *
   * Supports optional name search and pagination.
   */
  async findAllZones(filter: PublicFilterDto): Promise<ZoneListResponse> {
    const limit = filter.limit ?? 50;
    const offset = filter.offset ?? 0;

    const qb = this.zoneRepository
      .createQueryBuilder('z')
      .select([
        'z.id',
        'z.name',
        'z.acronym',
        'z.color',
        'z.lt',
        'z.lg',
        'z.type',
        'z.isActivated',
      ])
      .where('z.isActivated = :active', { active: true });

    if (filter.search) {
      qb.andWhere('z.name ILIKE :search', { search: `%${filter.search}%` });
    }

    qb.orderBy('z.name', 'ASC').take(limit).skip(offset);

    const [zones, total] = await qb.getManyAndCount();

    return { zones, total };
  }

  /**
   * Returns a single zone with its sectors summary and real-time slot counts.
   *
   * Executes a single optimized query with aggregated slot statistics.
   */
  async findZoneById(id: number): Promise<ZoneDetailResponse> {
    const result = await this.zoneRepository
      .createQueryBuilder('z')
      .select([
        'z.id',
        'z.name',
        'z.acronym',
        'z.color',
        'z.lt',
        'z.lg',
        'z.type',
        'z.isActivated',
        'z.description',
      ])
      .where('z.id = :id', { id })
      .andWhere('z.isActivated = :active', { active: true })
      .getOne();

    if (!result) {
      return { zone: null };
    }

    const stats = await this.slotRepository
      .createQueryBuilder('s')
      .select('COUNT(*)', 'totalSlots')
      .addSelect(
        `COUNT(CASE WHEN s.status = ${StatusSlot.AVAILABLE} THEN 1 END)`,
        'availableSlots',
      )
      .addSelect(
        `COUNT(CASE WHEN s.status != ${StatusSlot.AVAILABLE} AND s.status != ${StatusSlot.OUT_OF_SERVICE} AND s.status != ${StatusSlot.PCD} THEN 1 END)`,
        'occupiedSlots',
      )
      .where('s."zoneId" = :zoneId', { zoneId: id })
      .getRawOne();

    const sectorCount = await this.blockRepository
      .createQueryBuilder('b')
      .where('b."zoneId" = :zoneId', { zoneId: id })
      .andWhere('b.isActivated = :active', { active: true })
      .getCount();

    return {
      zone: {
        id: result.id,
        name: result.name,
        acronym: result.acronym,
        color: result.color,
        lt: result.lt,
        lg: result.lg,
        type: result.type,
        isActivated: result.isActivated,
        description: result.description,
        totalSectors: sectorCount,
        totalSlots: parseInt(stats?.totalSlots ?? '0', 10),
        availableSlots: parseInt(stats?.availableSlots ?? '0', 10),
        occupiedSlots: parseInt(stats?.occupiedSlots ?? '0', 10),
      },
    };
  }

  /**
   * Returns all active sectors, optionally filtered by zone.
   *
   * Supports name search and pagination. Joins zone for parent context.
   */
  async findAllSectors(filter: PublicFilterDto): Promise<SectorListResponse> {
    const limit = filter.limit ?? 50;
    const offset = filter.offset ?? 0;

    const qb = this.blockRepository
      .createQueryBuilder('b')
      .select([
        'b.id',
        'b.name',
        'b.acronym',
        'b.color',
        'b.lt',
        'b.lg',
        'b.priority',
        'b.neighborhood',
        'b.mainStreet',
        'b.sideStreet',
        'b.timeLimit',
        'b.timeGrace',
        'b.timePerFraction',
        'b.isActivated',
        'zone.id',
        'zone.name',
      ])
      .innerJoin('b.zone', 'zone')
      .where('b.isActivated = :active', { active: true })
      .andWhere('zone.isActivated = :zoneActive', { zoneActive: true });

    if (filter.zoneId) {
      qb.andWhere('b."zoneId" = :zoneId', { zoneId: filter.zoneId });
    }

    if (filter.search) {
      qb.andWhere('b.name ILIKE :search', { search: `%${filter.search}%` });
    }

    qb.orderBy('b.priority', 'ASC')
      .addOrderBy('b.name', 'ASC')
      .take(limit)
      .skip(offset);

    const [blocks, total] = await qb.getManyAndCount();

    const sectors = blocks.map((b) => ({
      id: b.id,
      name: b.name,
      acronym: b.acronym,
      color: b.color,
      lt: b.lt,
      lg: b.lg,
      priority: b.priority,
      neighborhood: b.neighborhood,
      mainStreet: b.mainStreet,
      sideStreet: b.sideStreet,
      timeLimit: b.timeLimit,
      timeGrace: b.timeGrace,
      timePerFraction: b.timePerFraction,
      isActivated: b.isActivated,
      zoneId: b.zone?.id,
      zoneName: b.zone?.name,
    }));

    return { sectors, total };
  }

  /**
   * Returns a single sector with its schedules and real-time slot counts.
   */
  async findSectorById(id: number): Promise<SectorDetailResponse> {
    const block = await this.blockRepository
      .createQueryBuilder('b')
      .select([
        'b.id',
        'b.name',
        'b.acronym',
        'b.color',
        'b.lt',
        'b.lg',
        'b.priority',
        'b.neighborhood',
        'b.mainStreet',
        'b.sideStreet',
        'b.timeLimit',
        'b.timeGrace',
        'b.timePerFraction',
        'b.isActivated',
        'b.description',
        'zone.id',
        'zone.name',
      ])
      .innerJoin('b.zone', 'zone')
      .where('b.id = :id', { id })
      .andWhere('b.isActivated = :active', { active: true })
      .getOne();

    if (!block) {
      return { sector: null };
    }

    const [schedules, stats] = await Promise.all([
      this.scheduleRepository
        .createQueryBuilder('s')
        .select([
          's.id',
          's.isActivated',
          's.dayOfWeekInit',
          's.dayOfWeekEnd',
          's.openingTime',
          's.closingTime',
        ])
        .where('s."blockId" = :blockId', { blockId: id })
        .andWhere('s.isActivated = :active', { active: true })
        .orderBy('s.dayOfWeekInit', 'ASC')
        .getMany(),

      this.slotRepository
        .createQueryBuilder('sl')
        .select('COUNT(*)', 'totalSlots')
        .addSelect(
          `COUNT(CASE WHEN sl.status = ${StatusSlot.AVAILABLE} THEN 1 END)`,
          'availableSlots',
        )
        .addSelect(
          `COUNT(CASE WHEN sl.status != ${StatusSlot.AVAILABLE} AND sl.status != ${StatusSlot.OUT_OF_SERVICE} AND sl.status != ${StatusSlot.PCD} THEN 1 END)`,
          'occupiedSlots',
        )
        .where('sl."blockId" = :blockId', { blockId: id })
        .getRawOne(),
    ]);

    return {
      sector: {
        id: block.id,
        name: block.name,
        acronym: block.acronym,
        color: block.color,
        lt: block.lt,
        lg: block.lg,
        priority: block.priority,
        neighborhood: block.neighborhood,
        mainStreet: block.mainStreet,
        sideStreet: block.sideStreet,
        timeLimit: block.timeLimit,
        timeGrace: block.timeGrace,
        timePerFraction: block.timePerFraction,
        isActivated: block.isActivated,
        description: block.description,
        zoneId: block.zone?.id,
        zoneName: block.zone?.name,
        totalSlots: parseInt(stats?.totalSlots ?? '0', 10),
        availableSlots: parseInt(stats?.availableSlots ?? '0', 10),
        occupiedSlots: parseInt(stats?.occupiedSlots ?? '0', 10),
        schedules: schedules.map((s) => ({
          id: s.id,
          isActivated: s.isActivated,
          dayOfWeekInit: s.dayOfWeekInit,
          dayOfWeekEnd: s.dayOfWeekEnd,
          openingTime: s.openingTime,
          closingTime: s.closingTime,
        })),
      },
    };
  }

  /**
   * Returns active operating schedules for a given sector.
   */
  async findSchedulesBySector(sectorId: number): Promise<ScheduleListResponse> {
    const schedules = await this.scheduleRepository
      .createQueryBuilder('s')
      .select([
        's.id',
        's.isActivated',
        's.dayOfWeekInit',
        's.dayOfWeekEnd',
        's.openingTime',
        's.closingTime',
      ])
      .where('s."blockId" = :blockId', { blockId: sectorId })
      .andWhere('s.isActivated = :active', { active: true })
      .orderBy('s.dayOfWeekInit', 'ASC')
      .getMany();

    return {
      schedules: schedules.map((s) => ({
        id: s.id,
        isActivated: s.isActivated,
        dayOfWeekInit: s.dayOfWeekInit,
        dayOfWeekEnd: s.dayOfWeekEnd,
        openingTime: s.openingTime,
        closingTime: s.closingTime,
      })),
    };
  }

  /**
   * Returns real-time slot availability breakdown for a single sector.
   */
  async findSectorAvailability(
    sectorId: number,
  ): Promise<SectorAvailabilityResponse> {
    const block = await this.blockRepository
      .createQueryBuilder('b')
      .select(['b.id', 'b.name'])
      .where('b.id = :id', { id: sectorId })
      .andWhere('b.isActivated = :active', { active: true })
      .getOne();

    const stats = await this.slotRepository.query(
      `SELECT
        COUNT(*)::int AS "totalSlots",
        COUNT(CASE WHEN s.status = $1 THEN 1 END)::int AS "available",
        COUNT(CASE WHEN s.status = $2 THEN 1 END)::int AS "occupied",
        COUNT(CASE WHEN s.status = $3 THEN 1 END)::int AS "exceeded",
        COUNT(CASE WHEN s.status = $4 THEN 1 END)::int AS "graceTime",
        COUNT(CASE WHEN s.status = $5 THEN 1 END)::int AS "outOfService",
        COUNT(CASE WHEN s.status = $6 THEN 1 END)::int AS "pcd"
      FROM slot s
      WHERE s."blockId" = $7`,
      [
        StatusSlot.AVAILABLE,
        StatusSlot.OCCUPIED,
        StatusSlot.EXCEEDED,
        StatusSlot.GRACE_TIME,
        StatusSlot.OUT_OF_SERVICE,
        StatusSlot.PCD,
        sectorId,
      ],
    );

    const row = stats[0] ?? {};

    return {
      sectorId,
      sectorName: block?.name ?? '',
      totalSlots: row.totalSlots ?? 0,
      available: row.available ?? 0,
      occupied: row.occupied ?? 0,
      exceeded: row.exceeded ?? 0,
      graceTime: row.graceTime ?? 0,
      outOfService: row.outOfService ?? 0,
      pcd: row.pcd ?? 0,
    };
  }

  /**
   * Returns real-time availability consolidated for a zone with per-sector breakdown.
   */
  async findZoneAvailability(
    zoneId: number,
  ): Promise<ZoneAvailabilityResponse> {
    const zone = await this.zoneRepository
      .createQueryBuilder('z')
      .select(['z.id', 'z.name'])
      .where('z.id = :id', { id: zoneId })
      .andWhere('z.isActivated = :active', { active: true })
      .getOne();

    const zoneStats = await this.slotRepository.query(
      `SELECT
        COUNT(*)::int AS "totalSlots",
        COUNT(CASE WHEN s.status = $1 THEN 1 END)::int AS "available",
        COUNT(CASE WHEN s.status = $2 THEN 1 END)::int AS "occupied",
        COUNT(CASE WHEN s.status = $3 THEN 1 END)::int AS "exceeded",
        COUNT(CASE WHEN s.status = $4 THEN 1 END)::int AS "graceTime",
        COUNT(CASE WHEN s.status = $5 THEN 1 END)::int AS "outOfService",
        COUNT(CASE WHEN s.status = $6 THEN 1 END)::int AS "pcd"
      FROM slot s
      WHERE s."zoneId" = $7`,
      [
        StatusSlot.AVAILABLE,
        StatusSlot.OCCUPIED,
        StatusSlot.EXCEEDED,
        StatusSlot.GRACE_TIME,
        StatusSlot.OUT_OF_SERVICE,
        StatusSlot.PCD,
        zoneId,
      ],
    );

    const sectorStats = await this.slotRepository.query(
      `SELECT
        b.id AS "sectorId",
        b.name AS "sectorName",
        COUNT(*)::int AS "totalSlots",
        COUNT(CASE WHEN s.status = $1 THEN 1 END)::int AS "available",
        COUNT(CASE WHEN s.status != $1 AND s.status != $2 AND s.status != $3 THEN 1 END)::int AS "occupied"
      FROM slot s
      INNER JOIN block b ON s."blockId" = b.id
      WHERE s."zoneId" = $4
        AND b."isActivated" = true
      GROUP BY b.id, b.name
      ORDER BY b.name ASC`,
      [
        StatusSlot.AVAILABLE,
        StatusSlot.OUT_OF_SERVICE,
        StatusSlot.PCD,
        zoneId,
      ],
    );

    const row = zoneStats[0] ?? {};

    return {
      zoneId,
      zoneName: zone?.name ?? '',
      totalSlots: row.totalSlots ?? 0,
      available: row.available ?? 0,
      occupied: row.occupied ?? 0,
      exceeded: row.exceeded ?? 0,
      graceTime: row.graceTime ?? 0,
      outOfService: row.outOfService ?? 0,
      pcd: row.pcd ?? 0,
      sectors: sectorStats,
    };
  }

  /**
   * Returns a general occupancy summary across all active zones.
   */
  async findOccupancySummary(): Promise<OccupancySummaryResponse> {
    const [globalStats, zoneStats, totalZones, totalSectors] =
      await Promise.all([
        this.slotRepository.query(
          `SELECT
          COUNT(*)::int AS "totalSlots",
          COUNT(CASE WHEN s.status = $1 THEN 1 END)::int AS "available",
          COUNT(CASE WHEN s.status = $2 THEN 1 END)::int AS "occupied",
          COUNT(CASE WHEN s.status = $3 THEN 1 END)::int AS "exceeded",
          COUNT(CASE WHEN s.status = $4 THEN 1 END)::int AS "graceTime",
          COUNT(CASE WHEN s.status = $5 THEN 1 END)::int AS "outOfService",
          COUNT(CASE WHEN s.status = $6 THEN 1 END)::int AS "pcd"
        FROM slot s
        INNER JOIN zone z ON s."zoneId" = z.id
        WHERE z."isActivated" = true`,
          [
            StatusSlot.AVAILABLE,
            StatusSlot.OCCUPIED,
            StatusSlot.EXCEEDED,
            StatusSlot.GRACE_TIME,
            StatusSlot.OUT_OF_SERVICE,
            StatusSlot.PCD,
          ],
        ),

        this.slotRepository.query(
          `SELECT
          z.id AS "zoneId",
          z.name AS "zoneName",
          COUNT(*)::int AS "totalSlots",
          COUNT(CASE WHEN s.status = $1 THEN 1 END)::int AS "available",
          COUNT(CASE WHEN s.status != $1 AND s.status != $2 AND s.status != $3 THEN 1 END)::int AS "occupied"
        FROM slot s
        INNER JOIN zone z ON s."zoneId" = z.id
        WHERE z."isActivated" = true
        GROUP BY z.id, z.name
        ORDER BY z.name ASC`,
          [StatusSlot.AVAILABLE, StatusSlot.OUT_OF_SERVICE, StatusSlot.PCD],
        ),

        this.zoneRepository
          .createQueryBuilder('z')
          .where('z.isActivated = :active', { active: true })
          .getCount(),

        this.blockRepository
          .createQueryBuilder('b')
          .innerJoin('b.zone', 'z')
          .where('b.isActivated = :active', { active: true })
          .andWhere('z.isActivated = :zoneActive', { zoneActive: true })
          .getCount(),
      ]);

    const global = globalStats[0] ?? {};
    const totalSlots = global.totalSlots ?? 0;
    const occupied =
      totalSlots -
      (global.available ?? 0) -
      (global.outOfService ?? 0) -
      (global.pcd ?? 0);
    const occupancyRate =
      totalSlots > 0
        ? Math.round(
            (occupied / (totalSlots - (global.outOfService ?? 0))) * 10000,
          ) / 100
        : 0;

    const zones = (zoneStats ?? []).map((z: any) => {
      const zTotal = z.totalSlots ?? 0;
      const zOccupied = z.occupied ?? 0;
      return {
        zoneId: z.zoneId,
        zoneName: z.zoneName,
        totalSlots: zTotal,
        available: z.available ?? 0,
        occupied: zOccupied,
        occupancyRate:
          zTotal > 0 ? Math.round((zOccupied / zTotal) * 10000) / 100 : 0,
      };
    });

    return {
      totalZones,
      totalSectors,
      totalSlots,
      available: global.available ?? 0,
      occupied: global.occupied ?? 0,
      exceeded: global.exceeded ?? 0,
      graceTime: global.graceTime ?? 0,
      outOfService: global.outOfService ?? 0,
      pcd: global.pcd ?? 0,
      occupancyRate,
      zones,
    };
  }

  /**
   * Returns map-optimized zone and sector data with parsed geofences and availability.
   *
   * Executes a single raw SQL query joining zones, sectors and slot counts,
   * then groups the results in memory for efficient map rendering.
   */
  async findMapData(filter: PublicFilterDto): Promise<MapDataResponse> {
    const params: any[] = [StatusSlot.AVAILABLE];
    const conditions: string[] = ['z."isActivated" = true'];
    let paramIndex = 2;

    if (filter.zoneId) {
      conditions.push(`z.id = $${paramIndex}`);
      params.push(filter.zoneId);
      paramIndex++;
    }

    if (filter.search) {
      conditions.push(`z.name ILIKE $${paramIndex}`);
      params.push(`%${filter.search}%`);
      paramIndex++;
    }

    const whereClause = conditions.join(' AND ');

    const rows = await this.zoneRepository.query(
      `SELECT
        z.id AS "zoneId",
        z.name AS "zoneName",
        z.acronym AS "zoneAcronym",
        z.color AS "zoneColor",
        z.lt AS "zoneLt",
        z.lg AS "zoneLg",
        ST_AsGeoJSON(z.geofence) AS "zoneGeofence",
        b.id AS "sectorId",
        b.name AS "sectorName",
        b.acronym AS "sectorAcronym",
        b.color AS "sectorColor",
        b.lt AS "sectorLt",
        b.lg AS "sectorLg",
        ST_AsGeoJSON(b.geofence) AS "sectorGeofence",
        COUNT(s.id)::int AS "totalSlots",
        COUNT(CASE WHEN s.status = $1 THEN 1 END)::int AS "availableSlots"
      FROM zone z
      LEFT JOIN block b ON b."zoneId" = z.id AND b."isActivated" = true
      LEFT JOIN slot s ON s."blockId" = b.id
      WHERE ${whereClause}
      GROUP BY z.id, z.name, z.acronym, z.color, z.lt, z.lg, z.geofence,
               b.id, b.name, b.acronym, b.color, b.lt, b.lg, b.geofence
      ORDER BY z.name ASC, b.priority ASC, b.name ASC`,
      params,
    );

    const zoneMap = new Map<number, any>();

    for (const row of rows) {
      if (!zoneMap.has(row.zoneId)) {
        const zoneGeo = row.zoneGeofence
          ? parseGeoJsonMultiPolygon(JSON.parse(row.zoneGeofence))
          : null;

        zoneMap.set(row.zoneId, {
          id: row.zoneId,
          name: row.zoneName,
          acronym: row.zoneAcronym,
          color: row.zoneColor,
          lt: row.zoneLt,
          lg: row.zoneLg,
          geofence: zoneGeo,
          sectors: [],
        });
      }

      if (row.sectorId) {
        const sectorGeo = row.sectorGeofence
          ? parseGeoJsonMultiPolygon(JSON.parse(row.sectorGeofence))
          : null;

        zoneMap.get(row.zoneId).sectors.push({
          id: row.sectorId,
          name: row.sectorName,
          acronym: row.sectorAcronym,
          color: row.sectorColor,
          lt: row.sectorLt,
          lg: row.sectorLg,
          geofence: sectorGeo,
          totalSlots: row.totalSlots,
          availableSlots: row.availableSlots,
        });
      }
    }

    return { zones: Array.from(zoneMap.values()) };
  }
}
