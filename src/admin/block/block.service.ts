import { Inject, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { FilterDto } from 'src/common/dto/filter.dto';
import handleDbExceptions from 'src/common/exceptions/error.db.exception';
import { ErrorCode } from 'src/common/glob/error';
import { TypeOperation } from 'src/common/glob/type/type_operation';
import { parseGeoJsonMultiPolygon, toIntArray } from 'src/common/glob/utilities/funtions';
import { LoggerService } from 'src/common/logger.service.ts';
import { Repository } from 'typeorm';

import { CreateBlockDto } from './dto/create-block.dto';
import { UpdateBlockDto } from './dto/update-block.dto';
import { Block } from './entities/block.entity';

/**
 * Service for managing Blocks — the middle level of the
 * Zone → Block → Slot hierarchy. Provides CRUD, zone-scoped listings,
 * parking-availability queries and block-sector grouping consumed by
 * the admin and the operator mobile apps.
 */
@Injectable()
export class BlockService {

  private readonly logger = new Logger(BlockService.name);

  constructor(
    @InjectRepository(Block)
    private readonly blockRepository: Repository<Block>,

    @Inject(LoggerService)
    private readonly loggerService: LoggerService,

  ) { }

  /**
   * Seeds the database with two sample blocks (internal / development use only).
   *
   * @returns The two created block records.
   */
  async initializeDatabase() {
    const block1 = this.blockRepository.create({ timeGrace: "00:15:00", timeLimit: "01:30:00", timePerFraction: "00:15:00", acronym: "ZA", name: "Zona A", color: "#7986KH", lg: 0, lt: 0, zone: { id: 1 } });
    await this.blockRepository.save(block1);

    const block2 = this.blockRepository.create({ timeGrace: "00:15:00", timeLimit: "02:00:00", timePerFraction: "00:15:00", acronym: "ZB", name: "Zona B", color: "#7986KH", lg: 0, lt: 0, zone: { id: 1 } });
    await this.blockRepository.save(block2);

    return { block1, block2 };
  }

  /**
   * Creates a new block with its WKT geofence polygon and writes an audit log entry.
   *
   * @param userId         ID of the authenticated user performing the operation.
   * @param createBlockDto Creation payload (name, geofence WKT, timing, zone, etc.).
   * @returns `{ block }` — the persisted block entity.
   */
  async create(userId: number, createBlockDto: CreateBlockDto) {
    try {
      const blockEntity = this.blockRepository.create({ ...createBlockDto });
      const wkt = `POLYGON((${createBlockDto.geofence}))`;
      blockEntity.geofence = () => `ST_GeomFromText('${wkt}')`;
      const block = await this.blockRepository.save(blockEntity);

      this.loggerService.saveBlockLogger({ id: block.id, userId, typeOperation: TypeOperation.CREATE, block });
      return { block };
    } catch (error) {
      handleDbExceptions(error, this.logger);
    }
  }

  /**
   * Returns a paginated list of blocks with their zone association.
   *
   * @param paginationDto Pagination (`limit`, `offset`) and optional `search` filter.
   * @returns `{ blocks, total, offset, limit }`.
   */
  async findAll(paginationDto: FilterDto) {
    const { offset, limit, search } = paginationDto;
    try {
      const queryBuilder = this.blockRepository.createQueryBuilder('bl')
        .select(['bl.id', 'bl.name', 'bl.acronym', 'bl.color', 'bl.lt', 'bl.lg',
          'bl.timeLimit', 'bl.timeGrace', 'bl.timePerFraction',
          'bl.neighborhood', 'bl.mainStreet', 'bl.sideStreet', 'bl.geofence', 'zone.id', 'zone.name'])
        .innerJoin("bl.zone", "zone");

      if (search) {
        queryBuilder.andWhere('bl.name ILIKE :search', { search: `%${search}%` });
      }
      const [blocks, total] = await Promise.all([
        queryBuilder.take(limit).skip(offset).getMany(),
        queryBuilder.getCount(),
      ]);

      return { blocks, total, offset, limit };
    } catch (error) {
      handleDbExceptions(error, this.logger);
    }
  }

  /**
   * Returns a reduced block list (id, name, geofence) filtered by zone.
   *
   * @param zoneId Zone identifier.
   * @returns `{ blocks }`.
   */
  async findAllByfilter(zoneId) {
    try {
      const blocks = await this.blockRepository.createQueryBuilder('bl')
        .select(['bl.id', 'bl.name', 'bl.geofence'])
        .where('bl.zoneId = :zoneId', { zoneId })
        .getMany();
      return { blocks };
    } catch (error) {
      handleDbExceptions(error, this.logger);
    }
  }

  /**
   * Returns blocks for the parking module with parsed multi-polygon geofences.
   *
   * @param version   API version (unused internally, kept for route parity).
   * @param filterDto Optional `search` and `zoneId` filters.
   * @returns `{ blocks }` with parsed geofence arrays.
   */
  async findAllByFilterParking(version: number, filterDto: FilterDto) {
    const { search, zoneId } = filterDto;
    try {
      const queryBuilder = this.blockRepository.createQueryBuilder('bl')
        .select(['bl.id', 'bl.name', 'bl.geofence', 'bl.color']);

      if (search) {
        queryBuilder.andWhere('bl.name ILIKE :search', { search: `%${search}%` });
      }

      if (zoneId) {
        queryBuilder.andWhere('bl.zoneId = :zoneId', { zoneId });
      }

      const blocks = await queryBuilder.getMany();

      const parsedBlocks = blocks.map(block => ({
        ...block,
        geofence: parseGeoJsonMultiPolygon(block.geofence),
      }));

      return { blocks: parsedBlocks };
    } catch (error) {
      handleDbExceptions(error, this.logger);
    }
  }

  /** Placeholder — not yet implemented. */
  findOne(id: number) {
    return `This action returns a #${id} block`;
  }

  /**
   * Updates an existing block's fields and geofence, and writes an audit log entry.
   *
   * @param userId         ID of the authenticated user performing the operation.
   * @param id             Target block ID.
   * @param updateBlockDto Fields to update.
   * @returns `{ block }` — the updated block entity, or `undefined` when the id is not found.
   */
  async update(userId: number, id: number, updateBlockDto: UpdateBlockDto) {
    try {
      const block = await this.blockRepository.preload({ id, ...updateBlockDto });
      if (block) {
        const wkt = `POLYGON((${updateBlockDto.geofence}))`;
        block.geofence = () => `ST_GeomFromText('${wkt}')`;
        await this.blockRepository.save(block);
        this.loggerService.saveBlockLogger({ id: block.id, userId, typeOperation: TypeOperation.UPDATE, block });
        return { block };
      }
    } catch (error) {
      handleDbExceptions(error, this.logger);
    }
  }

  /** Placeholder — not yet implemented. */
  remove(id: number) {
    return `This action removes a #${id} block`;
  }

  /**
   * Returns all blocks for the sector module, joined with their zone and with
   * GeoJSON geofences parsed into multi-polygon coordinate arrays.
   *
   * @param filterDto Optional `zoneId` and `search` filters.
   * @returns `{ errorCode, blocks }` — `NOT_FOUND` with empty array when no rows match.
   */
  async getAllBlockSector(filterDto: FilterDto) {
    try {
      const { where, params } = this._buildSectorQueryParameters(filterDto);

      const sql = `
        SELECT
          b.id, b.name, b.acronym, b.color, b.lt, b.lg,
          ST_AsGeoJSON(b.geofence) AS geofence,
          b.neighborhood, b."timeLimit", b."timeGrace", b."timePerFraction",
          b."isActivated",
          TO_CHAR(b."createdAt", 'YYYY-MM-DD"T"HH24:MI:SS.MS') AS "createdAt",
          TO_CHAR(b."updatedAt", 'YYYY-MM-DD"T"HH24:MI:SS.MS') AS "updatedAt",
          b."zoneId", b.priority, b.description,
          z.name AS "nameZone", ST_AsGeoJSON(z.geofence) AS "geofenceZone", z.color AS "colorZone",
          z.lg AS "lgZone", z.lt AS "ltZone"
        FROM block AS b
        INNER JOIN zone AS z ON b."zoneId" = z.id
        ${where}
        ORDER BY b.id DESC;
      `;

      const rawRows = await this.blockRepository.query(sql, params);

      if (rawRows.length === 0) {
        return { errorCode: ErrorCode.NOT_FOUND, blocks: [] };
      }

      const blocks = rawRows.map((row: any) => {
        const geojson = row.geofence ? JSON.parse(row.geofence) : null;
        const geofenceData = geojson ? parseGeoJsonMultiPolygon(geojson) : [];
        const geojsonZone = row.geofenceZone ? JSON.parse(row.geofenceZone) : null;
        const geofenceDataZone = geojsonZone ? parseGeoJsonMultiPolygon(geojsonZone) : [];
        return {
          ...row,
          geofence: geofenceData,
          numberPolygon: geofenceData.length,
          geofenceZone: geofenceDataZone,
          numberPolygonZone: geofenceDataZone.length,
        };
      });

      return { errorCode: ErrorCode.NONE, blocks };
    } catch (error) {
      handleDbExceptions(error, this.logger);
    }
  }

  /**
   * Builds the WHERE clause and positional parameter list for sector block queries.
   * Supports single-zone, multi-zone (ANY), and name search filters.
   *
   * @param filterDto Optional `zoneId` (single or comma-joined) and `search` filters.
   * @returns `{ where, params }` ready for raw SQL execution.
   */
  private _buildSectorQueryParameters(filterDto: FilterDto): {
    where: string; params: any[];
  } {
    const { search, zoneId } = filterDto;

    const parts: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;

    const zoneIds = toIntArray(zoneId);
    if (zoneIds.length === 1) {
      parts.push(`b."zoneId" = $${paramIndex}`);
      params.push(zoneIds[0]);
      paramIndex++;
    } else if (zoneIds.length > 1) {
      parts.push(`b."zoneId" = ANY($${paramIndex}::int[])`);
      params.push(zoneIds);
      paramIndex++;
    }

    if (search && String(search).trim() !== '') {
      parts.push(`b.name ILIKE $${paramIndex}`);
      params.push(`%${search}%`);
    }

    return { where: parts.length ? ` WHERE ${parts.join(' AND ')}` : '', params };
  }

  /**
   * Checks whether a fully-qualified schema.table identifier exists in the database.
   *
   * @param tableName Schema-prefixed table identifier (e.g. `public.block`).
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
      const result = await this.blockRepository.query(query, [tableSchema, tableNameOnly]);
      return result.length > 0;
    } catch {
      return false;
    }
  }

  /**
   * Creates a new block for the sector module with an optional geofence and writes an audit log.
   *
   * @param userId         ID of the authenticated user performing the operation.
   * @param createBlockDto Creation payload.
   * @returns `{ block }` — the persisted block entity.
   */
  async createBlockSector(userId: number, createBlockDto: CreateBlockDto) {
    try {
      const blockEntity = this.blockRepository.create({ ...createBlockDto });

      if (createBlockDto.geofence) {
        const wkt = `POLYGON((${createBlockDto.geofence}))`;
        blockEntity.geofence = () => `ST_GeomFromText('${wkt}')`;
      }

      const block = await this.blockRepository.save(blockEntity);
      this.loggerService.saveBlockLogger({ id: block.id, userId, typeOperation: TypeOperation.CREATE, block });
      return { block };
    } catch (error) {
      handleDbExceptions(error, this.logger);
    }
  }

  /**
   * Updates a block in the sector module with an optional new geofence and writes an audit log.
   *
   * @param userId         ID of the authenticated user performing the operation.
   * @param id             Target block ID.
   * @param updateBlockDto Fields to update.
   * @returns `{ block }` — the updated block entity, or `undefined` when the id is not found.
   */
  async updateBlockSector(userId: number, id: number, updateBlockDto: UpdateBlockDto) {
    try {
      const block = await this.blockRepository.preload({ id, ...updateBlockDto });
      if (block) {
        if (updateBlockDto.geofence) {
          const wkt = `${updateBlockDto.geofence}`;
          block.geofence = () => `ST_GeomFromText('${wkt}')`;
        }
        await this.blockRepository.save(block);
        this.loggerService.saveBlockLogger({ id: block.id, userId, typeOperation: TypeOperation.UPDATE, block });
        return { block };
      }
    } catch (error) {
      handleDbExceptions(error, this.logger);
    }
  }

}
