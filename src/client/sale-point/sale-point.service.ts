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
   * Creates the sale point service with its repository and logger.
   *
   * @param salePointRepository Repository used to query sale points.
   * @param loggerService Shared logging service.
   */
  constructor(
    @InjectRepository(SalePoint)
    private readonly salePointRepository: Repository<SalePoint>,

    @Inject(LoggerService)
    private readonly loggerService: LoggerService,
  ) {}

  /**
   * Retrieves active fixed-mode sale points, applying the given filters.
   *
   * @param filterDto Filter criteria used to narrow the sale point query.
   * @returns Promise resolving to an object with the error code and the matching sale points.
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
   * Retrieves active mobile-mode sale points with their current geo location.
   *
   * @param _filterDto Filter criteria (reserved for future use).
   * @returns Promise resolving to an object with the error code and the matching sale points.
   */
  async findAllActiveModeMobile(_filterDto: FilterDto) {
    try {
      const query = `SELECT "sp"."id", "sp"."mode", "loc"."latitude" AS "lt", "loc"."longitude" AS "lg", "sp"."title", "sp"."subTitle", "sp"."userId"
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
   * Builds the additional SQL conditions and parameters from the given filters.
   *
   * @param _filterDto Filter criteria (reserved for future use).
   * @returns Object with the SQL condition fragments and their bound parameters.
   */
  private _buildConditionsAndParameters(_filterDto: FilterDto) {
    const conditions: string[] = [];
    const parameters: Record<string, any> = {};

    return { conditions, parameters };
  }
}
