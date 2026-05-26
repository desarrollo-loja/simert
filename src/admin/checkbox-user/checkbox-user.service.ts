import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { FilterDto } from 'src/common/dto/filter.dto';
import handleDbExceptions from 'src/common/exceptions/error.db.exception';
import { ErrorCode } from 'src/common/glob/error';
import { Repository } from 'typeorm';

import { CreateCheckboxUserDto } from './dto/create-checkbox-user.dto';
import { UpdateCheckboxUserDto } from './dto/update-checkbox-user.dto';
import { CheckboxUser } from './entities/checkbox-user.entity';

/**
 * Admin service for the CheckboxUser resource.
 *
 * Exposes the "Consumo Digital" report: the current digital balance
 * (`CheckboxUser.checkboxes`) per user. Aggregated top-up/consumption
 * sums are intentionally NOT included here because the source tables
 * (`checkbox`, `fraction`) are archived monthly into history.* and this
 * report does not query the historical tables.
 *
 * CRUD methods remain as placeholders; the real lifecycle of the row is
 * owned by `client/simert/simert.service.ts` and
 * `client/checkbox/checkbox.service.ts`.
 */
@Injectable()
export class CheckboxUserService {
  private readonly logger = new Logger('CheckboxUserService');

  constructor(
    @InjectRepository(CheckboxUser)
    private readonly checkboxUserRepository: Repository<CheckboxUser>,
  ) { }

  /**
   * Paginated rows of the digital-consumption report.
   *
   * @param filterDto `userId` restricts the report to a single user;
   *   `limit`/`offset` paginate the result set.
   * @returns Object with `errorCode` and `rows`, each row containing
   *   `{ userId, saldo, createdAt }`.
   */
  async findReport(filterDto: FilterDto) {
    try {
      const { limit = 10, offset = 0, userId } = filterDto;

      const qb = this.checkboxUserRepository
        .createQueryBuilder('cu')
        .select(['cu.userId', 'cu.checkboxes'])
        .addSelect(`TO_CHAR(cu."createdAt", 'YYYY-MM-DD"T"HH24:MI:SS.MS')`, 'cu_createdAt')
        .orderBy('cu.id', 'DESC')
        .limit(limit)
        .offset(offset);
      if (userId) {
        qb.where('cu.userId = :userId', { userId });
      }
      const result = await qb.getRawAndEntities();
      const rows = result.entities.map((entity, i) => ({
        userId: entity.userId,
        saldo: entity.checkboxes,
        createdAt: result.raw[i]?.cu_createdAt ?? null,
      }));

      return { errorCode: ErrorCode.NONE, rows };
    } catch (error) {
      handleDbExceptions(error, this.logger);
    }
  }

  /**
   * Total CheckboxUser rows available for pagination of the report,
   * honoring the same `userId` filter used by {@link findReport}.
   *
   * @param filterDto Optional `userId` filter.
   * @returns Object with `errorCode` and the numeric `total`.
   */
  async findReportTotal(filterDto: FilterDto) {
    try {
      const { userId } = filterDto;
      const where = userId ? { userId } : {};
      const total = await this.checkboxUserRepository.count({ where });
      return { errorCode: ErrorCode.NONE, total };
    } catch (error) {
      handleDbExceptions(error, this.logger);
    }
  }

  // ─── CRUD placeholders ────────────────────────────────────────────────
  // Kept as stubs: real CheckboxUser lifecycle is owned by the client
  // services (parking session + paid checkbox purchase).

  create(_createCheckboxUserDto: CreateCheckboxUserDto) {
    return 'This action adds a new checkboxUser';
  }

  findAll() {
    return `This action returns all checkboxUser`;
  }

  findOne(id: number) {
    return `This action returns a #${id} checkboxUser`;
  }

  update(id: number, _updateCheckboxUserDto: UpdateCheckboxUserDto) {
    return `This action updates a #${id} checkboxUser`;
  }

  remove(id: number) {
    return `This action removes a #${id} checkboxUser`;
  }
}
