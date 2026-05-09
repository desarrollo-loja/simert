import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Block } from 'src/admin/block/entities/block.entity';
import { Slot } from 'src/admin/slot/entities/slot.entity';
import { Zone } from 'src/admin/zone/entities/zone.entity';
import { FilterDto } from 'src/common/dto/filter.dto';
import handleDbExceptions from 'src/common/exceptions/error.db.exception';
import { ErrorCode } from 'src/common/glob/error';
import { parseGeoJsonMultiPolygon } from 'src/common/glob/utilities/funtions';
import { Repository } from 'typeorm';

@Injectable()
export class MappingService {

  private readonly logger = new Logger('MappingService');

  constructor(

    @InjectRepository(Zone)
    private readonly zoneRepository: Repository<Zone>,

    @InjectRepository(Block)
    private readonly blockRepository: Repository<Block>,

    @InjectRepository(Slot)
    private readonly slotRepository: Repository<Slot>,

  ) { }

  async findAllZones(paginationDto: FilterDto) {
    const { search } = paginationDto;
    let zones: Zone[] = [];

    try {
      const query = await this.zoneRepository.createQueryBuilder('z')
        .select(['z.id', 'z.name', 'z.color', 'z.acronym', 'z.lt', 'z.lg', 'z.geofence', 'z.isActivated'])
        .where('z.isActivated = :isActivated', { isActivated: true });

      if (search) {
        query.andWhere('z.name ILIKE :search', { search: `%${search}%` });
      }

      const zone = await query.getMany();

      if (zone.length === 0)
        return { errorCode: ErrorCode.NOT_FOUND, zone: zones };

      zones = zone.map(item => {
        const geofenceData = parseGeoJsonMultiPolygon(item.geofence);
        return { ...item, geofence: geofenceData } as Zone;
      });

      return { errorCode: ErrorCode.NONE, zone: zones };
    } catch (error) {
      handleDbExceptions(error, this.logger);
    }
  }

  async findAllBlock(paginationDto: FilterDto) {
    const { search } = paginationDto;
    let blocks: Block[] = [];

    try {
      const query = await this.blockRepository.createQueryBuilder('bl')
        .select(['bl.id', 'bl.name', 'bl.acronym', 'bl.color', 'bl.lt', 'bl.lg',
          'bl.timeLimit', 'bl.timeGrace', 'bl.timePerFraction',
          'bl.neighborhood', 'bl.mainStreet', 'bl.sideStreet', 'bl.geofence', 'zone.id', 'zone.name', 'zone.isActivated',
          'schedules.id', 'schedules.isActivated', 'schedules.dayOfWeekInit', 'schedules.dayOfWeekEnd',
          'schedules.openingTime', 'schedules.closingTime'])
        .innerJoin("bl.zone", "zone")
        .leftJoin("bl.schedules", "schedules")
        .orderBy('schedules.dayOfWeekInit', 'ASC', 'NULLS LAST');

      if (search) {
        query.where('bl.name ILIKE :search', { search: `%${search}%` });
      }

      const block = await query.getMany();

      if (block.length === 0)
        return { errorCode: ErrorCode.NOT_FOUND, blocks };

      blocks = block.map(item => {
        const geofenceData = parseGeoJsonMultiPolygon(item.geofence);
        return { ...item, geofence: geofenceData } as Block;
      });

      const currentDate = new Date();

      return { errorCode: ErrorCode.NONE, blocks, currentDate };
    } catch (error) {
      handleDbExceptions(error, this.logger);
    }
  }

  async findAllSlot(paginationDto: FilterDto) {
    const { search } = paginationDto;
    let slots: Slot[] = [];
    try {
      const query = await this.slotRepository.createQueryBuilder('sl')
        .select(['sl.id', 'sl.slot', 'sl.isActivated', 'sl.lt', 'sl.lg', 'sl.status', 'sl.typeSlot',
          'zone.id', 'zone.name', 'block.id', 'block.name', 'block.geofence'])
        .innerJoin("sl.zone", "zone")
        .innerJoin("sl.block", "block")
        .where('sl.lt != :zero AND sl.lg != :zero', { zero: 0 });

      if (search) {
        query.andWhere('sl.slot ILIKE :search', { search: `%${search}%` });
      }

      slots = await query.getMany();

      if (slots.length === 0)
        return { errorCode: ErrorCode.NOT_FOUND, slots };

      return { errorCode: ErrorCode.NONE, slots };

    } catch (error) {
      handleDbExceptions(error, this.logger);
    }
  }

  async findSlotNearby(latitude: number, longitude: number, paginationDto: FilterDto) {
    const { search } = paginationDto;
    let slots: Slot[] = [];
    try {

      const query = await this.slotRepository.createQueryBuilder('sl')
        .select(['sl.id', 'sl.slot', 'sl.isActivated', 'sl.lt', 'sl.lg', 'sl.status', 'sl.typeSlot',
          'zone.id', 'zone.name', 'block.id', 'block.name', 'block.geofence', `earth_distance(ll_to_earth(sl.lt, sl.lg), ll_to_earth(:lat, :lng)) AS distance`])
        .innerJoin("sl.zone", "zone")
        .innerJoin("sl.block", "block")
        .where('sl.lt != :zero AND sl.lg != :zero', { zero: 0 })
        .orderBy('distance', 'ASC')
        .setParameters({ lat: latitude, lng: longitude })
        .limit(50);

      if (search) {
        query.andWhere('sl.slot ILIKE :search', { search: `%${search}%` });
      }

      slots = await query.getMany();

      if (slots.length === 0)
        return { errorCode: ErrorCode.NOT_FOUND, slots };

      return { errorCode: ErrorCode.NONE, slots };

    } catch (error) {
      handleDbExceptions(error, this.logger);
    }
  }
}
