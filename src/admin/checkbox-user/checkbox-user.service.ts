import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Checkbox } from 'src/admin/checkbox/entities/checkbox.entity';
import { Fraction } from 'src/admin/fraction/entities/fraction.entity';
import { FilterDto } from 'src/common/dto/filter.dto';
import handleDbExceptions from 'src/common/exceptions/error.db.exception';
import { ErrorCode } from 'src/common/glob/error';
import { StatusPayment } from 'src/common/glob/status/status_payment';
import { Repository } from 'typeorm';

import { CreateCheckboxUserDto } from './dto/create-checkbox-user.dto';
import { UpdateCheckboxUserDto } from './dto/update-checkbox-user.dto';
import { CheckboxUser } from './entities/checkbox-user.entity';

/**
 * Admin service for the CheckboxUser resource.
 *
 * Exposes the "Consumo Digital" report: per-user current digital balance
 * (CheckboxUser.checkboxes), total fractions topped up via paid Checkbox
 * purchases and total fractions consumed in digital parking sessions
 * (Fraction) within an optional date range.
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

    @InjectRepository(Checkbox)
    private readonly checkboxRepository: Repository<Checkbox>,

    @InjectRepository(Fraction)
    private readonly fractionRepository: Repository<Fraction>,
  ) { }

  /**
   * Paginated rows of the digital-consumption report.
   *
   * @param filterDto Filters: `userId` restricts the report to a single
   *   user; `dateFrom`/`dateTo` constrain the aggregated sums;
   *   `limit`/`offset` paginate the result set.
   * @returns Object with `errorCode` and `rows`, each row containing
   *   `{ userId, saldo, totalRecargas, totalConsumos, createdAt }`.
   */
  async findReport(filterDto: FilterDto) {
    try {
      const { limit = 10, offset = 0, dateFrom, dateTo, userId } = filterDto;

      // Page of users by their balance row.
      const baseQb = this.checkboxUserRepository
        .createQueryBuilder('cu')
        .select(['cu.userId AS "userId"', 'cu.checkboxes AS "saldo"', 'cu.createdAt AS "createdAt"'])
        .orderBy('cu.id', 'DESC')
        .limit(limit)
        .offset(offset);
      if (userId) {
        baseQb.where('cu.userId = :userId', { userId });
      }
      const baseRows = await baseQb.getRawMany<{ userId: number; saldo: number; createdAt: Date }>();

      if (baseRows.length === 0) {
        return { errorCode: ErrorCode.NONE, rows: [] };
      }

      const userIds = baseRows.map(r => Number(r.userId));

      // Top-ups (recargas): only PAID purchases, optional date range over `register`.
      const rechargesQb = this.checkboxRepository
        .createQueryBuilder('c')
        .select('c.userId', 'userId')
        .addSelect('SUM(c.checkboxes)', 'totalRecargas')
        .where('c.userId IN (:...userIds)', { userIds })
        .andWhere('c.statusPayment = :paid', { paid: StatusPayment.PAID })
        .groupBy('c.userId');
      if (dateFrom && dateTo) {
        rechargesQb.andWhere('DATE(c.register) BETWEEN :dateFrom AND :dateTo', { dateFrom, dateTo });
      }
      const rechargeRows = await rechargesQb.getRawMany<{ userId: number; totalRecargas: string }>();
      const rechargesByUser = new Map<number, number>();
      for (const r of rechargeRows) {
        rechargesByUser.set(Number(r.userId), Number(r.totalRecargas) || 0);
      }

      // Consumption (consumos): every digital parking session, optional date range over `register`.
      const consumosQb = this.fractionRepository
        .createQueryBuilder('f')
        .select('f.userId', 'userId')
        .addSelect('SUM(f.checkboxes)', 'totalConsumos')
        .where('f.userId IN (:...userIds)', { userIds })
        .groupBy('f.userId');
      if (dateFrom && dateTo) {
        consumosQb.andWhere('DATE(f.register) BETWEEN :dateFrom AND :dateTo', { dateFrom, dateTo });
      }
      const consumoRows = await consumosQb.getRawMany<{ userId: number; totalConsumos: string }>();
      const consumosByUser = new Map<number, number>();
      for (const r of consumoRows) {
        consumosByUser.set(Number(r.userId), Number(r.totalConsumos) || 0);
      }

      const rows = baseRows.map(r => {
        const userId = Number(r.userId);
        return {
          userId,
          saldo: Number(r.saldo) || 0,
          totalRecargas: rechargesByUser.get(userId) || 0,
          totalConsumos: consumosByUser.get(userId) || 0,
          createdAt: r.createdAt,
        };
      });

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
