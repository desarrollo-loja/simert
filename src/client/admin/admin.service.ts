import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Slot } from 'src/admin/slot/entities/slot.entity';
import handleDbExceptions from 'src/common/exceptions/error.db.exception';
import { ErrorCode } from 'src/common/glob/error';
import { Repository } from 'typeorm';

import { CreateAdminDto } from './dto/create-admin.dto';

/**
 * Internal admin utility service used by the client layer. Currently exposes
 * Slot deletion and creation helpers consumed by admin console flows that
 * operate in the client context.
 */
@Injectable()
export class AdminService {
  private readonly logger = new Logger(AdminService.name);

  /**
   *
   * @param slotRepository
   */
  constructor(
    @InjectRepository(Slot)
    private readonly slotRepository: Repository<Slot>,
  ) {}

  /**
   * Deletes a slot by its primary key.
   *
   * @param slotId Numeric id of the slot to delete.
   * @returns Standard error-code envelope.
   */
  async delete(slotId: number) {
    try {
      await this.slotRepository.delete(slotId);
      return { errorCode: ErrorCode.NONE };
    } catch (error) {
      handleDbExceptions(error, this.logger);
    }
  }

  /**
   * Creates a new slot from the provided DTO.
   *
   * @param createAdminDto Slot creation payload.
   * @returns Error-code envelope containing the persisted slot.
   */
  async create(createAdminDto: CreateAdminDto) {
    try {
      const newSlot = this.slotRepository.create({ ...createAdminDto });
      const slot = await this.slotRepository.save(newSlot);
      return { errorCode: ErrorCode.NONE, slot };
    } catch (error) {
      handleDbExceptions(error, this.logger);
    }
  }

  /**
   * Returns up to 100 slots ordered by distance from the given coordinates.
   *
   * @param latitude Reference latitude (WGS-84).
   * @param longitude Reference longitude (WGS-84).
   * @returns Error-code envelope containing the nearest slots.
   */
  async findAllSlots(latitude: number, longitude: number) {
    try {
      const slots = await this.slotRepository
        .createQueryBuilder('sl')
        .select([
          'sl.id',
          'sl.slot',
          'sl.isActivated',
          'sl.lt',
          'sl.lg',
          'sl.status',
          'sl.typeSlot',
          'zone.id',
          'zone.name',
          'block.id',
          'block.name',
          `earth_distance(ll_to_earth(sl.lt, sl.lg), ll_to_earth(:lat, :lng)) AS distance`,
        ])
        .innerJoin('sl.zone', 'zone')
        .innerJoin('sl.block', 'block')
        .limit(100)
        .orderBy('distance', 'ASC')
        .setParameters({ lat: latitude, lng: longitude })
        .getMany();

      return { errorCode: ErrorCode.NONE, slots };
    } catch (error) {
      handleDbExceptions(error, this.logger);
    }
  }
}
