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

@Injectable()
export class SlotService {

  private readonly logger = new Logger('SlotService');

  constructor(
    @InjectRepository(Slot)
    private readonly slotRepository: Repository<Slot>,

    @Inject(LoggerService)
    private readonly loggerService: LoggerService,

  ) { }

  async initializeDatabase() {
    const slot1 = this.slotRepository.create({ slot: "1", zone: { id: 1 }, block: { id: 1 } });
    await this.slotRepository.save(slot1);

    return { slot1 }
  }

  async create(userId: number, createSlotDto: CreateSlotDto) {
    try {
      const query = this.slotRepository.create({ ...createSlotDto });
      const slot = await this.slotRepository.save(query);
      this.loggerService.saveSlotLogger({ id: slot.id, userId: userId, typeOperation: TypeOperation.CREATE, slot });
      return { slot };
    } catch (error) {
      handleDbExceptions(error, this.logger);
    }
  }

  async findAll(paginationDto: FilterDto) {
    const { offset, limit, search } = paginationDto;
    try {
      const query = await this.slotRepository.createQueryBuilder('sl')
        .select(['sl.id', 'sl.slot', 'sl.isActivated', 'sl.isPaidParking', 'sl.lt', 'sl.lg', 'sl.status', 'sl.typeSlot',
          'zone.id', 'zone.name', 'block.id', 'block.name', 'block.geofence'])
        .innerJoin("sl.zone", "zone")
        .innerJoin("sl.block", "block");
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

  async findAllByfilter(blockId, zoneId) {
    try {
      const slots = await this.slotRepository.createQueryBuilder('s')
        .select('s.id', 'id')
        .addSelect('s.slot', 'name')
        .where('s.blockId = :blockId', { blockId })
        .andWhere('s.zoneId = :zoneId', { zoneId })
        .getRawMany();
      return { slots };
    } catch (error) {
      handleDbExceptions(error, this.logger);
    }
  }

  async update(userId: number, id: number, updateSlotDto: UpdateSlotDto) {
    try {
      const slot = await this.slotRepository.preload({ id: id, ...updateSlotDto });
      if (slot) {
        await this.slotRepository.save(slot);
        this.loggerService.saveSlotLogger({ id: slot.id, userId: userId, typeOperation: TypeOperation.UPDATE, slot });
        return { slot };
      }
    } catch (error) {
      handleDbExceptions(error, this.logger);
    }
  }

  // modulo sectores 
  async getSlotsByBlockByZone(blockId, zoneId) {
    try {
      const slots = await this.slotRepository.createQueryBuilder('s')
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

  async getSlotsByPolygon(filterDto: FilterDto) {
    try {
      let tableSlot = 'simert.slot';

      let tableExists = false;
      tableExists = await this._tableExists(tableSlot);

      if (!tableExists) {
        return { slots: [] };
      }

      const { conditions, parameters } = this._buildConditionsAndParametersModuleBlockSector(filterDto);

      // ST_AsText(b.geofence) as geofence,  -- Convertir a WKT
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

  private _buildConditionsAndParametersModuleBlockSector(filterDto: FilterDto): {
    conditions: string[];
    parameters: any[];
  } {
    const {
      polygon
    } = filterDto;

    const conditions: string[] = [];
    const parameters: any[] = [];

    if (polygon && polygon.startsWith('POLYGON')) {
      conditions.push('ST_Within(s.location, ST_GeomFromText(?)) = 1');
      parameters.push(polygon);
    }
    return { conditions, parameters };
  }

  async findAllSlotBlockParking(blockId?: number, zoneId?: number, filterDto?: FilterDto) {
    try {
      const { search, typeSlot, statusSlot } = filterDto ?? {};
      const query = this.slotRepository.createQueryBuilder('s')
        .select(['s.id', 's.isActivated', 's.isPaidParking', 's.slot', 's.lt', 's.lg', 's.status', 's.typeSlot', 's.blockId', 'zone.id',
          'zone.name', 'block.id', 'block.name', 'fraction.id', 'fraction.statusId', 'fraction.createdAt', 'fraction.image',
          'fraction.plate', 'status.id'
        ])
        .innerJoin("s.zone", "zone")
        .innerJoin("s.block", "block")
        .leftJoin('s.fractions', 'fraction')
        .leftJoin('fraction.status', 'status');

      if (blockId && Number(blockId) > 0) {
        query.andWhere('s.blockId = :blockId', { blockId });
      }

      if (zoneId && Number(zoneId) > 0) {
        query.andWhere('s.zoneId = :zoneId', { zoneId });
      }

      if (search) {
        query.andWhere('s.slot ILIKE :search', { search: `%${search}%` });
      }

      if (typeSlot) {
        query.andWhere('s.typeSlot = :typeSlot', { typeSlot });
      }

      if (statusSlot) {
        query.andWhere('s.status = :statusSlot', { statusSlot });
      }

      query.orderBy('s.id', 'DESC');

      const slot = await query.getMany();

      if (slot.length === 0)
        return { errorCode: ErrorCode.NOT_FOUND, slot: [] }

      return { errorCode: ErrorCode.NONE, slot }
    } catch (error) {
      handleDbExceptions(error, this.logger);
    }
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
      const result = await this.slotRepository.query(query);
      return result.length > 0;
    } catch (error) {
      return false;
    }
  }

  async findStatistics(filterDto: FilterDto) {

    try {

      let tableName = 'public.slot';

      const { parameters, conditions } = this.buildParametersConditions(filterDto);

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
        return { errorCode: ErrorCode.NOT_FOUND, message: 'No se encontraron resultados' };
      return { errorCode: ErrorCode.NONE, message: 'Resultados encontrados', slots };

    } catch (error) {
      handleDbExceptions(error, this.logger);
    }

  }

  buildParametersConditions = (filterDto) => {
    const {
      zoneId,
      blockId,
    } = filterDto;

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
  };

}
