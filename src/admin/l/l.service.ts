import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { FilterDto } from 'src/common/dto/filter.dto';
import handleDbExceptions from 'src/common/exceptions/error.db.exception';
import { ErrorCode } from 'src/common/glob/error';
import { Repository } from 'typeorm';

import { L } from './entities/l.entity';

@Injectable()
export class LService {
  private readonly logger = new Logger('LService');

  constructor(

    @InjectRepository(L)
    private readonly lRepository: Repository<L>,

  ) { }

  async findAllByUser(filterDto: FilterDto) {
    const { userId } = filterDto;
    try {
      const query = this.lRepository.createQueryBuilder('l')
        .select([
          'l.userId', 'l.longitude', 'l.latitude', 'l.zoneId', 'l.blockId'
        ]);

      query.where('l.userId = :userId', { userId });

      const location = await query.getOne();
      return { errorCode: ErrorCode.NONE, location };
    } catch (error) {
      handleDbExceptions(error, this.logger);
    }
  }

  async findByUsers(filterDto: FilterDto) {
    const { userIds, dateFrom, dateTo } = filterDto;
    try {
      const userIdsArray = userIds
        .split(',')
        .map(id => Number(id.trim()))
        .filter(id => !isNaN(id));

      const query = this.lRepository.createQueryBuilder('l')
        .select([
          'l.userId', 'l.longitude', 'l.latitude', 'l.zoneId', 'l.blockId'
        ])
        .addSelect(`TO_CHAR(l."timestamp", 'YYYY-MM-DD"T"HH24:MI:SS.MS')`, 'l_timestamp');

      query.where('l.userId IN (:...userIds)', { userIds: userIdsArray });

      if (dateFrom && dateTo) {
        query.andWhere('l.timestamp BETWEEN :dateFrom AND :dateTo', {
          dateFrom,
          dateTo,
        });
      }

      const { entities, raw } = await query.getRawAndEntities();
      const location = entities.map((entity, i) => ({
        ...entity,
        timestamp: raw[i]?.l_timestamp ?? null,
      }));
      return { errorCode: ErrorCode.NONE, location };
    } catch (error) {
      handleDbExceptions(error, this.logger);
    }
  }
}
