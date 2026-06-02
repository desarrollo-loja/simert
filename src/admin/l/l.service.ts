import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Block } from 'src/admin/block/entities/block.entity';
import { BlockOperator } from 'src/admin/block_operator/entities/block_operator.entity';
import { Zone } from 'src/admin/zone/entities/zone.entity';
import { FilterDto } from 'src/common/dto/filter.dto';
import handleDbExceptions from 'src/common/exceptions/error.db.exception';
import { ErrorCode } from 'src/common/glob/error';
import { Repository } from 'typeorm';

import { L } from './entities/l.entity';

/**
 * Service for the `L` entity — the real-time tracking buffer table
 * (`public.l`). Provides user-scoped lookups enriched with Zone/Block names
 * and admin-side bulk queries used by the monitoring dashboard.
 */
@Injectable()
export class LService {
  private readonly logger = new Logger('LService');

  constructor(
    @InjectRepository(L)
    private readonly lRepository: Repository<L>,
  ) { }

  /**
   * Returns the latest location record for a single user, enriched with
   * zone and block names via LEFT JOINs.
   *
   * @param filterDto - Filter containing the userId to look up.
   * @returns Object with errorCode and a location entry (or null if not found).
   */
  async findAllByUser(filterDto: FilterDto) {
    const { userId } = filterDto;
    try {
      const query = this.lRepository.createQueryBuilder('l')
        .select(['l.userId', 'l.longitude', 'l.latitude', 'l.zoneId', 'l.blockId'])
        .addSelect('zone.name', 'zoneName')
        .addSelect('block.name', 'blockName')
        // LEFT JOIN (not INNER): zoneId/blockId are nullable — positions outside
        // any zone/block must still be returned.
        .leftJoin(Zone, 'zone', 'zone.id = l.zoneId')
        .leftJoin(Block, 'block', 'block.id = l.blockId')
        .where('l.userId = :userId', { userId });

      const { entities, raw } = await query.getRawAndEntities();
      const entity = entities[0];
      const location = entity
        ? { ...entity, zoneName: raw[0]?.zoneName ?? null, blockName: raw[0]?.blockName ?? null }
        : null;

      return { errorCode: ErrorCode.NONE, location };
    } catch (error) {
      handleDbExceptions(error, this.logger);
    }
  }

  /**
   * Returns location records for multiple users with optional date, zone, and
   * block filters. Timestamps are formatted using TO_CHAR to avoid UTC-Z serialization.
   *
   * When the client provides both `dateFrom` and `dateTo`, records are filtered
   * to that range. When the date range is omitted, results default to the
   * current day (server date) so the dashboard never returns the full history.
   *
   * @param filterDto - Filter containing userIds (CSV), optional date range, zoneId, blockId.
   * @returns Object with errorCode and a location array enriched with zoneName/blockName.
   */
  async findByUsers(filterDto: FilterDto) {
    const { userIds, dateFrom, dateTo, zoneId, blockId } = filterDto;
    try {
      const userIdsArray = userIds
        .split(',')
        .map(id => Number(id.trim()))
        .filter(id => !isNaN(id));

      const query = this.lRepository.createQueryBuilder('l')
        .select(['l.userId', 'l.longitude', 'l.latitude', 'l.zoneId', 'l.blockId'])
        .addSelect(`TO_CHAR(l."timestamp", 'YYYY-MM-DD"T"HH24:MI:SS.MS')`, 'l_timestamp')
        .addSelect('zone.name', 'zoneName')
        .addSelect('block.name', 'blockName')
        .innerJoin(Zone, 'zone', 'zone.id = l.zoneId')
        .innerJoin(Block, 'block', 'block.id = l.blockId')
        // INNER JOIN on the block's operator assignments (blockOperator.blockId = block.id),
        // restricted to shifts that are currently in progress: started but not yet
        // finished (isInitialized = true AND isFinalized = false).
        .innerJoin(BlockOperator, 'blockOperator', 'blockOperator.blockId = block.id AND blockOperator.isInitialized = true AND blockOperator.isFinalized = false')
        .where('l.userId IN (:...userIds)', { userIds: userIdsArray });

      if (dateFrom && dateTo) {
        query.andWhere('l.timestamp BETWEEN :dateFrom AND :dateTo', { dateFrom, dateTo });
      } else {
        // No date range from the client: default to the current day (server
        // date). Uses a sargable range so an index on l.timestamp can be used.
        query.andWhere(`l.timestamp >= CURRENT_DATE AND l.timestamp < CURRENT_DATE + INTERVAL '1 day'`);
      }

      if (zoneId) {
        query.andWhere('l.zoneId = :zoneId', { zoneId });
      }

      if (blockId) {
        query.andWhere('l.blockId = :blockId', { blockId });
      }

      const { entities, raw } = await query.getRawAndEntities();
      const location = entities.map((entity, i) => ({
        ...entity,
        timestamp: raw[i]?.l_timestamp ?? null,
        zoneName: raw[i]?.zoneName ?? null,
        blockName: raw[i]?.blockName ?? null,
      }));

      return { errorCode: ErrorCode.NONE, location };
    } catch (error) {
      handleDbExceptions(error, this.logger);
    }
  }
}
