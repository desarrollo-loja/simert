import { Inject, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { SalePoint } from 'src/admin/sale-point/entities/sale-point.entity';
import { FilterDto } from 'src/common/dto/filter.dto';
import handleDbExceptions from 'src/common/exceptions/error.db.exception';
import { ErrorCode } from 'src/common/glob/error';
import { TypeModeSalePoint } from 'src/common/glob/type/type_mode_sale_point';
import { LoggerService } from 'src/common/logger.service.ts';
import { Repository } from 'typeorm';

/**
 * Client-facing service for SalePoint. Provides geo-aware lookups of active
 * sale points (fixed and mobile) used by the client app to locate where
 * parking checkboxes can be purchased.
 */
@Injectable()
export class SalePointService {
  private readonly logger = new Logger('SalePointService');

  /**
   *
   * @param salePointRepository
   * @param loggerService
   */
  constructor(
    @InjectRepository(SalePoint)
    private readonly salePointRepository: Repository<SalePoint>,

    @Inject(LoggerService)
    private readonly loggerService: LoggerService,
  ) {}

  /**
   *
   * @param filterDto
   */
  async findAllActiveModeFixed(filterDto: FilterDto) {
    try {
      const query = this.salePointRepository
        .createQueryBuilder('sp')
        .select([
          'sp.id',
          'sp.mode',
          'sp.lt',
          'sp.lg',
          'sp.title',
          'sp.subTitle',
          'sp.userId',
        ])
        .where('sp.mode = :mode', { mode: TypeModeSalePoint.FIXED });

      const { conditions, parameters } =
        this._buildConditionsAndParameters(filterDto);
      if (conditions.length) {
        query.andWhere(conditions.join(' AND '), parameters);
      }

      const salePoints = await query.getMany();

      return { errorCode: ErrorCode.NONE, salePoints };
    } catch (error) {
      handleDbExceptions(error, this.logger);
    }
  }

  /**
   *
   * @param _filterDto
   */
  async findAllActiveModeMobile(_filterDto: FilterDto) {
    try {
      let query = `SELECT "sp"."id", "sp"."mode", "loc"."latitude" AS "lt", "loc"."longitude" AS "lg", "sp"."title", "sp"."subTitle", "sp"."userId"
        FROM "salePoint" "sp"
        INNER JOIN "l" "loc" ON "loc"."userId" = "sp"."userId"
        WHERE "sp"."mode" = $1 `;

      const params = [TypeModeSalePoint.MOBILE];

      const salePoints = await this.salePointRepository.query(query, params);

      return { errorCode: ErrorCode.NONE, salePoints };
    } catch (error) {
      handleDbExceptions(error, this.logger);
    }
  }

  /**
   *
   * @param filterDto
   */
  private _buildConditionsAndParameters(filterDto: FilterDto) {
    const {} = filterDto;
    const conditions: string[] = [];
    const parameters: Record<string, any> = {};

    return { conditions, parameters };
  }
}
