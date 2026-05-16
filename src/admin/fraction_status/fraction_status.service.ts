import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { FilterDto } from 'src/common/dto/filter.dto';
import handleDbExceptions from 'src/common/exceptions/error.db.exception';
import { Repository } from 'typeorm';

import { FractionStatus } from './entities/fraction_status.entity';
@Injectable()
export class FractionStatusService {
  private readonly logger = new Logger('FractionStatusService');
  constructor(
    @InjectRepository(FractionStatus)
    private readonly fractionStatusRepository: Repository<FractionStatus>,

  ) { }

  async findAllFractionState(fractionId, filterDto: FilterDto) {
    const { year, month } = filterDto;
    try {
      let tableName = `fraction_status`;
      // Defense-in-depth: validate year/month as integers in expected ranges
      // before interpolating into the table identifier.
      if (year && month) {
        const y = Number(year);
        const m = Number(month);
        if (
          Number.isInteger(y) && y >= 2000 && y <= 2100 &&
          Number.isInteger(m) && m >= 1 && m <= 12
        ) {
          tableName = `${y}_${m}_fraction_status`;
        }
      }
      // Parameterized fractionId to prevent SQL injection via URL param.
      const safeFractionId = Math.trunc(Number(fractionId));
      if (!Number.isFinite(safeFractionId)) {
        return { fractionStatus: [] };
      }
      const query = `
            SELECT fs.id,
            fs.moment,
            TO_CHAR(fs."createdAt", 'YYYY-MM-DD"T"HH24:MI:SS.MS') AS "createdAt",
            s.name as statusLabel
            FROM ${tableName} AS fs
            INNER JOIN status s ON s.id=fs."statusId"
            WHERE fs."fractionId" =  $1
          `;
      const fractionStatus = await this.fractionStatusRepository.query(query, [safeFractionId]);
      return { fractionStatus };
    } catch (error) {
      handleDbExceptions(error, this.logger);
    }
  }
}
