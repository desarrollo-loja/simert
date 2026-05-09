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
@Injectable()
export class BlockService {

  private readonly logger = new Logger('BlockService');

  constructor(
    @InjectRepository(Block)
    private readonly blockRepository: Repository<Block>,

    @Inject(LoggerService)
    private readonly loggerService: LoggerService,

  ) { }

  async initializeDatabase() {
    const block1 = this.blockRepository.create({ timeGrace: "00:15:00", timeLimit: "01:30:00", timePerFraction: "00:15:00", acronym: "ZA", name: "Zona A", color: "#7986KH", lg: 0, lt: 0, zone: { id: 1 } });
    await this.blockRepository.save(block1);

    const block2 = this.blockRepository.create({ timeGrace: "00:15:00", timeLimit: "02:00:00", timePerFraction: "00:15:00", acronym: "ZB", name: "Zona B", color: "#7986KH", lg: 0, lt: 0, zone: { id: 1 } });
    await this.blockRepository.save(block2);

    return { block1, block2 }
  }

  async create(userId: number, createBlockDto: CreateBlockDto) {
    try {
      const query = this.blockRepository.create({ ...createBlockDto });
      const wkt = `POLYGON((${createBlockDto.geofence}))`
      query.geofence = () => `ST_GeomFromText('${wkt}')`;
      const block = await this.blockRepository.save(query);

      this.loggerService.saveBlockLogger({ id: block.id, userId: userId, typeOperation: TypeOperation.CREATE, block });
      return { block };
    } catch (error) {
      handleDbExceptions(error, this.logger);
    }
  }

  async findAll(paginationDto: FilterDto) {
    const { offset, limit, search } = paginationDto;
    try {
      const query = await this.blockRepository.createQueryBuilder('bl')
        .select(['bl.id', 'bl.name', 'bl.acronym', 'bl.color', 'bl.lt', 'bl.lg',
          'bl.timeLimit', 'bl.timeGrace', 'bl.timePerFraction',
          'bl.neighborhood', 'bl.mainStreet', 'bl.sideStreet', 'bl.geofence', 'zone.id', 'zone.name'])
        .innerJoin("bl.zone", "zone");

      if (search) {
        query.andWhere('bl.name ILIKE :search', { search: `%${search}%` });
      }
      const [blocks, total] = await Promise.all([
        query.take(limit).skip(offset).getMany(),
        query.getCount(),
      ]);

      return { blocks, total, offset, limit };
    } catch (error) {
      handleDbExceptions(error, this.logger);
    }
  }

  async findAllByfilter(zoneId) {
    try {
      const blocks = await this.blockRepository.createQueryBuilder('s')
        .select(['s.id', 's.name', 's.geofence'])
        .where('s.zoneId = :zoneId', { zoneId })
        .getMany();
      return { blocks };
    } catch (error) {
      handleDbExceptions(error, this.logger);
    }
  }

  async findAllByFilterParking(version: number, filterDto: FilterDto) {
    const { search, zoneId } = filterDto;
    try {
      const query = await this.blockRepository.createQueryBuilder('s')
        .select(['s.id', 's.name', 's.geofence', 's.color']);

      if (search) {
        query.andWhere('s.name ILIKE :search', { search: `%${search}%` });
      }

      if(zoneId){
        query.andWhere('s.zoneId = :zoneId', { zoneId });
      }

      const blocks = await query.getMany();

      let dataSend = [];
      if (blocks.length > 0) {
        dataSend = blocks.map(item => {
          const geofenceData = parseGeoJsonMultiPolygon(item.geofence);
          return {
            ...item,
            geofence: geofenceData
          }
        })
      }

      return { blocks: dataSend };
    } catch (error) {
      handleDbExceptions(error, this.logger);
    }
  }

  findOne(id: number) {
    return `This action returns a #${id} block`;
  }

  async update(userId: number, id: number, updateBlockDto: UpdateBlockDto) {
    try {

      const block = await this.blockRepository.preload({ id: id, ...updateBlockDto });
      if (block) {
        const wkt = `POLYGON((${updateBlockDto.geofence}))`
        block.geofence = () => `ST_GeomFromText('${wkt}')`;
        await this.blockRepository.save(block);
        this.loggerService.saveBlockLogger({ id: block.id, userId: userId, typeOperation: TypeOperation.UPDATE, block });
        return { block };
      }
    } catch (error) {
      handleDbExceptions(error, this.logger);
    }
  }

  remove(id: number) {
    return `This action removes a #${id} block`;
  }

  // SIMERT MODULO SECTOR 
  async getAllBlockSector(filterDto: FilterDto) {
    try {
      let tableBlockSector = 'block';
      let tableZone = 'zone';

      const { where, params } =
        this._buildConditionsAndParametersModuleBlockSector(filterDto);

      const query = `
        SELECT 
          b.id, b.name, b.acronym, b.color, b.lt, b.lg,
          ST_AsGeoJSON(b.geofence) AS geofence,
          b.neighborhood, b."timeLimit", b."timeGrace", b."timePerFraction",
          b."isActivated",
          TO_CHAR(b."createdAt", 'YYYY-MM-DD"T"HH24:MI:SS.MS') AS "createdAt",
          TO_CHAR(b."updatedAt", 'YYYY-MM-DD"T"HH24:MI:SS.MS') AS "updatedAt",
          b."zoneId", b.priority, b.description,
          z.name AS "nameZone", ST_AsGeoJSON(z.geofence) AS "geofenceZone", z.color AS "colorZone"
        FROM ${tableBlockSector} AS b
        INNER JOIN ${tableZone} AS z ON b."zoneId" = z.id
        ${where}
        ORDER BY b.id DESC;
      `;

      const raw = await this.blockRepository.query(query, params);

      if (raw.length === 0) {
        return { errorCode: ErrorCode.NOT_FOUND, blocks: [] };
      }

      const dataSend = raw.map((item: any) => {
        const geojson = item.geofence ? JSON.parse(item.geofence) : null;
        const geofenceData = geojson ? parseGeoJsonMultiPolygon(geojson) : [];
        const geojsonZone = item.geofenceZone ? JSON.parse(item.geofenceZone) : null;
        const geofenceDataZone = geojsonZone ? parseGeoJsonMultiPolygon(geojsonZone) : [];
        return {
          ...item,
          geofence: geofenceData,
          numberPolygon: geofenceData.length,
          geofenceZone: geofenceDataZone,
          numberPolygonZone: geofenceDataZone.length
        };
      });

      return { errorCode: ErrorCode.NONE, blocks: dataSend };
    } catch (error) {
      handleDbExceptions(error, this.logger);
    }
  }

  private _buildConditionsAndParametersModuleBlockSector(filterDto: FilterDto): {
    where: string; params: any[];
  } {
    const { search, zoneId } = filterDto;

    const parts: string[] = [];
    const params: any[] = [];
    let i = 1;

    const zoneIds = toIntArray(zoneId);
    if (zoneIds.length === 1) {
      parts.push(`b."zoneId" = $${i}`); params.push(zoneIds[0]); i++;
    } else if (zoneIds.length > 1) {
      parts.push(`b."zoneId" = ANY($${i}::int[])`); params.push(zoneIds); i++;
    }

    if (search && String(search).trim() !== '') {
      parts.push(`b.name ILIKE $${i}`); params.push(`%${search}%`); i++;
    }

    return { where: parts.length ? ` WHERE ${parts.join(' AND ')}` : '', params };
  }

  public async _tableExists(tableName: string): Promise<boolean> {
    const names = tableName.split('.');
    if (names.length <= 1) {
      this.logger.error(`No se especifico el esquema en la tabla ${tableName}`);
      return false;
    }
    const table_schema: string = names[0],
      table_name: string = names[1];
    const query = `SELECT table_name 
    FROM information_schema.tables 
    WHERE table_schema = '${table_schema}' AND table_name = '${table_name}';`;

    try {
      const result = await this.blockRepository.query(query);
      return result.length > 0;
    } catch (error) {
      return false;
    }
  }

  async createBlockSector(userId: number, createBlockDto: CreateBlockDto) {
    try {

      const query = this.blockRepository.create({ ...createBlockDto });

      if (createBlockDto.geofence) {
        const wkt = `POLYGON((${createBlockDto.geofence}))`
        query.geofence = () => `ST_GeomFromText('${wkt}')`;
      }

      const block = await this.blockRepository.save(query);
      this.loggerService.saveBlockLogger({ id: block.id, userId: userId, typeOperation: TypeOperation.CREATE, block });
      return { block };
    } catch (error) {
      handleDbExceptions(error, this.logger);
    }
  }

  async updateBlockSector(userId: number, id: number, updateBlockDto: UpdateBlockDto) {
    try {
      const block = await this.blockRepository.preload({ id: id, ...updateBlockDto });
      if (block) {

        if (updateBlockDto.geofence) {
          const wkt = `${updateBlockDto.geofence}`
          block.geofence = () => `ST_GeomFromText('${wkt}')`;
        }
        await this.blockRepository.save(block);
        this.loggerService.saveBlockLogger({ id: block.id, userId: userId, typeOperation: TypeOperation.UPDATE, block });
        return { block };
      }
    } catch (error) {
      handleDbExceptions(error, this.logger);
    }
  }

}
