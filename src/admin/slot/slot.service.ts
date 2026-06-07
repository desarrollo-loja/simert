import { Inject, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { FilterDto } from 'src/common/dto/filter.dto';
import handleDbExceptions from 'src/common/exceptions/error.db.exception';
import { ErrorCode } from 'src/common/glob/error';
import { StatusSlot } from 'src/common/glob/status/status_slot';
import { TypeOperation } from 'src/common/glob/type/type_operation';
import { LoggerService } from 'src/common/logger.service.ts';
import { Repository } from 'typeorm';

import { CreateSlotDto } from './dto/create-slot.dto';
import { UpdateSlotDto } from './dto/update-slot.dto';
import { Slot } from './entities/slot.entity';

/**
 * Service for managing parking Slots — the leaf node in the
 * Zone → Block → Slot hierarchy. Provides CRUD, polygon-based queries,
 * block/zone-scoped lookups and occupancy statistics used by both the
 * admin console and the operator/controller mobile apps.
 */
@Injectable()
export class SlotService {
  private readonly logger = new Logger(SlotService.name);

  /**
   * Creates a new service instance.
   *
   * @param slotRepository TypeORM repository for {@link Slot} entities.
   * @param loggerService Service used to write audit log entries.
   */
  constructor(
    @InjectRepository(Slot)
    private readonly slotRepository: Repository<Slot>,

    @Inject(LoggerService)
    private readonly loggerService: LoggerService,
  ) {}

  /**
   * Seeds the database with a single sample slot (internal / development use only).
   *
   * @returns The created slot record.
   */
  async initializeDatabase() {
    const slot1 = this.slotRepository.create({
      slot: '1',
      zone: { id: 1 },
      block: { id: 1 },
    });
    await this.slotRepository.save(slot1);

    return { slot1 };
  }

  /**
   * Creates a new parking slot and writes an audit log entry.
   *
   * Pre-checks the `(zone, slot)` uniqueness rule so the conflict is reported
   * as a regular response with `errorCode: NAMEUNIQUE` instead of bubbling up
   * a 400 from the Postgres `23505` violation.
   *
   * @param userId ID of the authenticated user performing the operation.
   * @param createSlotDto Creation payload.
   * @returns `{ errorCode, slot }` — `NAMEUNIQUE` with `slot: null` on conflict.
   */
  async create(userId: number, createSlotDto: CreateSlotDto) {
    const conflict = await this._findSlotNameConflict(
      createSlotDto.zone?.id,
      createSlotDto.slot,
    );
    if (conflict) return { ...conflict, slot: {} };
    try {
      const query = this.slotRepository.create({ ...createSlotDto });
      const slot = await this.slotRepository.save(query);
      this.loggerService.saveSlotLogger({
        id: slot.id,
        userId: userId,
        typeOperation: TypeOperation.CREATE,
        slot,
      });
      return { errorCode: ErrorCode.NONE, slot };
    } catch (error) {
      handleDbExceptions(error, this.logger);
    }
  }

  /**
   * Returns a paginated list of slots with their zone and block associations.
   *
   * @param paginationDto Pagination (`limit`, `offset`) and optional `search` filter.
   * @returns `{ slots, total, offset, limit }`.
   */
  async findAll(paginationDto: FilterDto) {
    const { offset, limit, search } = paginationDto;
    try {
      const query = await this.slotRepository
        .createQueryBuilder('sl')
        .select([
          'sl.id',
          'sl.slot',
          'sl.isActivated',
          'sl.isPaidParking',
          'sl.lt',
          'sl.lg',
          'sl.status',
          'sl.typeSlot',
          'zone.id',
          'zone.name',
          'block.id',
          'block.name',
          'block.geofence',
        ])
        .innerJoin('sl.zone', 'zone')
        .innerJoin('sl.block', 'block');
      if (search) {
        query.where('sl.slot ILIKE :search', { search: `%${search}%` });
      }
      const [slots, total] = await Promise.all([
        query.take(limit).skip(offset).getMany(),
        query.getCount(),
      ]);
      return { slots, total, offset, limit };
    } catch (error) {
      handleDbExceptions(error, this.logger);
    }
  }

  /**
   * Returns a reduced slot list (id and name) for a given block and zone.
   *
   * @param blockId Block identifier.
   * @param zoneId  Zone identifier.
   * @returns `{ slots }` with raw `id` and `name` fields.
   */
  async findAllByfilter(blockId, zoneId) {
    try {
      const slots = await this.slotRepository
        .createQueryBuilder('s')
        .select('s.id', 'id')
        .addSelect('s.slot', 'name')
        .addSelect('s.status', 'status')
        .where('s.blockId = :blockId', { blockId })
        .andWhere('s.zoneId = :zoneId', { zoneId })
        .getRawMany();
      return { slots };
    } catch (error) {
      handleDbExceptions(error, this.logger);
    }
  }

  /**
   * Updates an existing slot and writes an audit log entry.
   *
   * Pre-checks the `(zone, slot)` uniqueness rule so the conflict is reported
   * as a regular response with `errorCode: NAMEUNIQUE` instead of bubbling up
   * a 400 from the Postgres `23505` violation.
   *
   * @param userId ID of the authenticated user performing the operation.
   * @param id     Target slot ID.
   * @param updateSlotDto Fields to update.
   * @returns `{ errorCode, slot }` — `NAMEUNIQUE` with `slot: null` on conflict,
   *          or `undefined` when the id is not found.
   */
  async update(userId: number, id: number, updateSlotDto: UpdateSlotDto) {
    const zoneId = updateSlotDto.zone?.id ?? (await this._resolveZoneId(id));
    const conflict = await this._findSlotNameConflict(
      zoneId,
      updateSlotDto.slot,
      id,
    );
    if (conflict) return { ...conflict, slot: {} };
    try {
      const slot = await this.slotRepository.preload({
        id: id,
        ...updateSlotDto,
      });
      if (slot) {
        await this.slotRepository.save(slot);
        this.loggerService.saveSlotLogger({
          id: slot.id,
          userId: userId,
          typeOperation: TypeOperation.UPDATE,
          slot,
        });
        return { errorCode: ErrorCode.NONE, slot };
      }
    } catch (error) {
      handleDbExceptions(error, this.logger);
    }
  }

  /**
   * Returns slots for the sector module, including coordinates.
   *
   * @param blockId Block identifier.
   * @param zoneId  Zone identifier.
   * @returns `{ slots }` with raw coordinate and reference fields.
   */
  async getSlotsByBlockByZone(blockId, zoneId) {
    try {
      const slots = await this.slotRepository
        .createQueryBuilder('s')
        .select('s.id', 'id')
        .addSelect('s.slot', 'nameSlot')
        .addSelect('s.lt', 'ltSlot')
        .addSelect('s.lg', 'lgSlot')
        //.addSelect('s.location', 'locationSlot')
        .addSelect('s.blockId', 'blockId')
        .addSelect('s.zoneId', 'zoneId')
        .where('s.blockId = :blockId', { blockId })
        .andWhere('s.zoneId = :zoneId', { zoneId })
        .getRawMany();
      return { slots };
    } catch (error) {
      handleDbExceptions(error, this.logger);
    }
  }

  /**
   * Returns slots whose location falls within the supplied WKT polygon.
   * Checks for `simert.slot` table existence before querying.
   *
   * @param filterDto Filter with optional `polygon` (WKT string starting with `POLYGON`).
   * @returns `{ slots }` — empty array when the table does not exist.
   */
  async getSlotsByPolygon(filterDto: FilterDto) {
    try {
      const tableSlot = 'simert.slot';

      const tableExists = await this._tableExists(tableSlot);

      if (!tableExists) {
        return { slots: [] };
      }

      const { conditions, parameters } =
        this._buildPolygonQueryParameters(filterDto);

      // ST_AsText(b.geofence) as geofence,  -- Convert to WKT
      let query = `
          SELECT s.id, s.slot as nameSlot, s.lt as ltSlot, s.lg as lgSlot, s.blockId, s.zoneId          
          FROM ${tableSlot} AS s
        `;

      if (conditions.length > 0) {
        query += ' WHERE ' + conditions.join(' AND ');
      }

      query += ' ORDER BY s.id DESC ;';

      const slotsResponse = await this.slotRepository.query(query, parameters);

      return { slots: slotsResponse };
    } catch (error) {
      handleDbExceptions(error, this.logger);
    }
  }

  /**
   * Builds the WHERE conditions for the polygon-based slot query.
   *
   * @param filterDto Filter with optional `polygon` WKT string.
   * @returns `{ conditions, parameters }` for the raw SQL query.
   */
  private _buildPolygonQueryParameters(filterDto: FilterDto): {
    conditions: string[];
    parameters: any[];
  } {
    const { polygon } = filterDto;

    const conditions: string[] = [];
    const parameters: any[] = [];

    if (polygon && polygon.startsWith('POLYGON')) {
      conditions.push('ST_Within(s.location, ST_GeomFromText(?)) = 1');
      parameters.push(polygon);
    }
    return { conditions, parameters };
  }

  /**
   * Returns slots for the parking view, including fractions and status.
   *
   * @param blockId   Optional block filter.
   * @param zoneId    Optional zone filter.
   * @param filterDto Additional filters: `search`, `typeSlot`, `statusSlot`.
   * @returns `{ errorCode, slot }` — `NOT_FOUND` with empty array when no rows match.
   */
  async findAllSlotBlockParking(
    blockId?: number,
    zoneId?: number,
    filterDto?: FilterDto,
  ) {
    try {
      const { search, typeSlot, statusSlot } = filterDto ?? {};
      const query = this.slotRepository
        .createQueryBuilder('s')
        .select([
          's.id',
          's.isActivated',
          's.isPaidParking',
          's.slot',
          's.lt',
          's.lg',
          's.status',
          's.typeSlot',
          's.blockId',
          'zone.id',
          'zone.name',
          'zone.isActivated',
          'block.id',
          'block.name',
          'block.geofence',
          'block.isActivated',
          'fraction.id',
          'fraction.statusId',
          'fraction.image',
          'fraction.plate',
          'status.id',
        ])
        .addSelect(
          `TO_CHAR(fraction."createdAt", 'YYYY-MM-DD"T"HH24:MI:SS.MS')`,
          'fraction_createdAt',
        )
        .innerJoin('s.zone', 'zone')
        .innerJoin('s.block', 'block')
        .leftJoin('s.fractions', 'fraction')
        .leftJoin('fraction.status', 'status');

      if (blockId && Number(blockId) > 0) {
        query.andWhere('s.blockId = :blockId', { blockId });
      }

      if (zoneId && Number(zoneId) > 0) {
        query.andWhere('s.zoneId = :zoneId', { zoneId });
      }

      if (search) {
        query.andWhere('s.slot ILIKE :search', { search: `${search}%` });
      }

      if (typeSlot) {
        query.andWhere('s.typeSlot = :typeSlot', { typeSlot });
      }

      if (statusSlot) {
        query.andWhere('s.status = :statusSlot', { statusSlot });
      }

      query.orderBy('s.id', 'DESC');

      const result = await query.getRawAndEntities();

      if (result.entities.length === 0)
        return { errorCode: ErrorCode.NOT_FOUND, slot: [] };

      // raw has one row per (slot, fraction) pair, so map the formatted date by
      // fraction id and apply it to each nested fraction (a slot may have many).
      const fractionCreatedAtById = new Map<number, string>();
      for (const row of result.raw) {
        if (row.fraction_id != null) {
          fractionCreatedAtById.set(
            row.fraction_id,
            row.fraction_createdAt ?? null,
          );
        }
      }

      const slot = result.entities.map((entity) => ({
        ...entity,
        fractions: entity.fractions?.map((fraction) => ({
          ...fraction,
          createdAt: fractionCreatedAtById.get(fraction.id) ?? null,
        })),
      }));

      return { errorCode: ErrorCode.NONE, slot };
    } catch (error) {
      handleDbExceptions(error, this.logger);
    }
  }

  /**
   * Checks whether a fully-qualified schema.table identifier exists in the database.
   *
   * @param tableName Schema-prefixed table identifier (e.g. `simert.slot`).
   * @returns `true` when the table exists, `false` otherwise.
   */
  public async _tableExists(tableName: string): Promise<boolean> {
    const names = tableName.split('.');
    if (names.length <= 1) {
      this.logger.error(`Schema not specified for table: ${tableName}`);
      return false;
    }
    const tableSchema: string = names[0];
    const tableNameOnly: string = names[1];
    // Parameterized query — prevents SQL injection via schema/table identifiers.
    const query = `
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = $1 AND table_name = $2;
    `;

    try {
      const result = await this.slotRepository.query(query, [
        tableSchema,
        tableNameOnly,
      ]);
      return result.length > 0;
    } catch {
      return false;
    }
  }

  /**
   * Returns occupancy statistics for slots grouped by status.
   *
   * @param filterDto Optional `zoneId` and `blockId` filters.
   * @returns Counts per status category (available, occupied, exceeded, etc.).
   */
  async findStatistics(filterDto: FilterDto) {
    try {
      const tableName = 'public.slot';

      const { parameters, conditions } =
        this._buildStatisticsQueryParameters(filterDto);

      let query = `
              SELECT
                COUNT(CASE WHEN s.status = ${StatusSlot.AVAILABLE} THEN 1 END) AS available,
                COUNT(CASE WHEN s.status = ${StatusSlot.OCCUPIED} THEN 1 END) AS occupied,
                COUNT(CASE WHEN s.status = ${StatusSlot.EXCEEDED} THEN 1 END) AS exceeded,
                COUNT(CASE WHEN s.status = ${StatusSlot.SANCTIONED} THEN 1 END) AS sanctioned,
                COUNT(CASE WHEN s.status = ${StatusSlot.GRACE_TIME} THEN 1 END) AS grace_time,
                COUNT(CASE WHEN s.status = ${StatusSlot.PCD} THEN 1 END) AS pcd,
                COUNT(CASE WHEN s.status = ${StatusSlot.OUT_OF_SERVICE} THEN 1 END) AS out_of_service
              FROM ${tableName} s
      `;

      if (conditions.length > 0) {
        query += ' WHERE ' + conditions.join(' AND ');
      }

      const slots = await this.slotRepository.query(query, parameters);

      if (slots.length === 0)
        return {
          errorCode: ErrorCode.NOT_FOUND,
          message: 'No se encontraron resultados',
        };
      return {
        errorCode: ErrorCode.NONE,
        message: 'Resultados encontrados',
        slots,
      };
    } catch (error) {
      handleDbExceptions(error, this.logger);
    }
  }

  /**
   * Builds the parameterized WHERE conditions for slot statistics queries.
   *
   * @param filterDto Filter with optional `zoneId` and `blockId`.
   * @returns `{ parameters, conditions }` ready for raw SQL execution.
   */
  private _buildStatisticsQueryParameters(filterDto: FilterDto): {
    parameters: any[];
    conditions: string[];
  } {
    const { zoneId, blockId } = filterDto;

    const conditions: string[] = [];
    const parameters: any[] = [];

    const addParam = (value: any) => {
      parameters.push(value);
      return `$${parameters.length}`;
    };

    if (zoneId) {
      conditions.push(`s."zoneId" = ${addParam(zoneId)}`);
    }

    if (blockId) {
      conditions.push(`s."blockId" = ${addParam(blockId)}`);
    }

    return { parameters, conditions };
  }

  /**
   * Resolves the zone id of an existing slot. Used on update when the payload
   * omits the zone, so the uniqueness check can still be scoped to the right zone.
   *
   * @param id Target slot ID.
   * @returns The zone id, or `undefined` when the slot does not exist.
   */
  private async _resolveZoneId(id: number): Promise<number | undefined> {
    const raw = await this.slotRepository
      .createQueryBuilder('s')
      .select('s."zoneId"', 'zoneId')
      .where('s.id = :id', { id })
      .getRawOne<{ zoneId: number }>();
    return raw ? Number(raw.zoneId) : undefined;
  }

  /**
   * Verifies that the slot name is unique within its zone, mirroring the
   * `@Unique(['zone', 'slot'])` constraint on the entity. Instead of throwing,
   * returns a `{ errorCode, message }` pair so callers can propagate the
   * conflict to the client as a regular response and the frontend does not
   * see a 400 in the network tab.
   *
   * @param zoneId    Zone the slot belongs to. When falsy the check is skipped.
   * @param slot      Slot name to validate (skipped when absent).
   * @param excludeId Slot id to ignore — the record being updated.
   * @returns The conflict descriptor, or `null` when the name is free.
   */
  private async _findSlotNameConflict(
    zoneId: number | undefined,
    slot?: string,
    excludeId?: number,
  ): Promise<{ errorCode: ErrorCode; message: string } | null> {
    if (!zoneId || !slot) return null;

    const qb = this.slotRepository
      .createQueryBuilder('s')
      .where('s.zoneId = :zoneId', { zoneId })
      .andWhere('s.slot = :slot', { slot });
    if (excludeId) qb.andWhere('s.id != :excludeId', { excludeId });

    if ((await qb.getCount()) > 0) {
      return {
        errorCode: ErrorCode.NAMEUNIQUE,
        message: 'El nombre del slot ya está en uso en esta zona.',
      };
    }

    return null;
  }
}
