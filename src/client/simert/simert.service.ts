import { Inject, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { BlockOperator } from 'src/admin/block_operator/entities/block_operator.entity';
import { CheckboxUser } from 'src/admin/checkbox-user/entities/checkbox-user.entity';
import { Fraction } from 'src/admin/fraction/entities/fraction.entity';
import { FractionStatus } from 'src/admin/fraction_status/entities/fraction_status.entity';
import { Slot } from 'src/admin/slot/entities/slot.entity';
import { CommonCacheService } from 'src/common/common.cache.service';
import { CommonService } from 'src/common/common.service';
import { CreateNotificationDto } from 'src/common/dto/create-notification.dto';
import handleDbExceptions from 'src/common/exceptions/error.db.exception';
import { ErrorCode } from 'src/common/glob/error';
import { StatusFraction } from 'src/common/glob/status/status_fraction';
import { StatusMoment } from 'src/common/glob/status/status_moment';
import { StatusSlot } from 'src/common/glob/status/status_slot';
import { TypeFraction } from 'src/common/glob/type/type_fraction';
import { TypeNotification } from 'src/common/glob/type/type_notification';
import { TypeTimeZone } from 'src/common/glob/type/type_time_zone';
import { DataSource, QueryRunner, Repository } from 'typeorm';

import { CreateSimertDto } from './dto/create-simert.dto';
import { IncrementSimertDto } from './dto/increment-simert.dto';
import { SearchFractionDto } from './dto/search-simert.dto';

/**
 * Core parking session service for the Simert mobile client. Manages the
 * full lifecycle of a parking Fraction: slot search, session start (`parking`),
 * time increment (`incrementTime`) and session termination. Enforces
 * pessimistic-write locks on {@link CheckboxUser} balance to prevent races
 * and dispatches push notifications at each state transition.
 */
@Injectable()
export class SimertService {
  private readonly logger = new Logger('SimertService');

  private readonly columsFractionBlockZone: string[] = [
    'f.id',
    'f.typeFraction',
    'f.userId',
    'f.time',
    'f.plate',
    'f.tint',
    'f.alias',
    'f.image',
    'f.transactionId',
    'f.registerAt',
    'f.departureDate',
    'status.id',
    'slot.slot',
    'block.name',
    'block.timeGrace',
    'block.id',
    'block.timePerFraction',
    'zone.id',
    'zone.name',
  ];

  private readonly columsFraction: string[] = [
    'f.id',
    'f.typeFraction',
    'f.userId',
    'f.time',
    'f.plate',
    'f.tint',
    'f.alias',
    'f.image',
    'f.transactionId',
    'f.registerAt',
    'f.departureDate',
    'status.id',
    'slot.slot',
  ];

  private readonly timeCacheBlockOperator =
    60 * (Number(process.env.TIME_CACHE_BLOCK_OPERATOR) || 5);

  /**
   * Injects the repositories and shared services required to manage the
   * parking Fraction lifecycle.
   *
   * @param fractionRepository Repository for {@link Fraction} entities.
   * @param fractionSatusRepository Repository for {@link FractionStatus} entities.
   * @param slotRepository Repository for {@link Slot} entities.
   * @param checkboxUserRepository Repository for {@link CheckboxUser} balances.
   * @param blockOperatorRepository Repository for {@link BlockOperator} entities.
   * @param commonService Shared service providing dates and notifications.
   * @param commonCacheService Shared cache service used to memoize block operators.
   * @param dataSource TypeORM data source used to create transactional query runners.
   */
  constructor(
    @InjectRepository(Fraction)
    private readonly fractionRepository: Repository<Fraction>,

    @InjectRepository(FractionStatus)
    private readonly fractionSatusRepository: Repository<FractionStatus>,

    @InjectRepository(Slot)
    private readonly slotRepository: Repository<Slot>,

    @InjectRepository(CheckboxUser)
    private readonly checkboxUserRepository: Repository<CheckboxUser>,

    @InjectRepository(BlockOperator)
    private readonly blockOperatorRepository: Repository<BlockOperator>,

    @Inject(CommonService)
    private readonly commonService: CommonService,

    @Inject(CommonCacheService)
    private readonly commonCacheService: CommonCacheService,

    private readonly dataSource: DataSource,
  ) { }

  /**
   * Returns all active (not yet finished) fractions owned by the given user,
   * including their slot, block and zone details.
   *
   * @param userId Identifier of the user whose fractions are requested.
   * @returns Object with the error code, the current date and the matching fractions.
   */
  async findAllFractions(userId: number) {
    try {
      const fractions = await this.fractionRepository
        .createQueryBuilder('f')
        .select(this.columsFractionBlockZone)
        .innerJoin('f.status', 'status')
        .innerJoin('f.slot', 'slot')
        .innerJoin('f.block', 'block')
        .innerJoin('f.zone', 'zone')
        .where('f.userId = :userId', { userId })
        .andWhere('f.status < :status', { status: StatusFraction.FINISHED })
        .getMany();

      const currentDate = new Date();

      return { errorCode: ErrorCode.NONE, currentDate, fractions };
    } catch (error) {
      handleDbExceptions(error, this.logger);
    }
  }

  /**
   * Retrieves a single fraction by its identifier together with its slot,
   * block and zone details.
   *
   * @param fractionId Identifier of the fraction to retrieve.
   * @returns Object with the error code, the current date and the fraction.
   */
  async findFractionById(fractionId: number) {
    const currentDate = new Date();
    const f = await this._findFractionById(fractionId);
    return { errorCode: ErrorCode.NONE, currentDate, fraction: f };
  }

  /**
   * Loads a fraction by its identifier joined with its status, slot, zone and
   * block relations.
   *
   * @param fractionId Identifier of the fraction to load.
   * @returns The matching fraction entity, or null when not found.
   */
  private async _findFractionById(fractionId: number) {
    const fraction = await this.fractionRepository
      .createQueryBuilder('f')
      .select(this.columsFractionBlockZone)
      .where('f.id = :fractionId', { fractionId })
      .innerJoin('f.status', 'status')
      .innerJoin('f.slot', 'slot')
      .innerJoin('f.zone', 'zone')
      .innerJoin('f.block', 'block')
      .getOne();
    return fraction;
  }

  /**
   * Increments the parking time of an existing fraction: validates the
   * transaction is not duplicated, locks and debits the user's checkbox
   * balance, finishes the previous fraction and creates an incremented one,
   * then notifies the user and the block operators.
   *
   * @param idDevice Identifier of the device originating the request.
   * @param incrementSimertDto Payload with user, transaction, fraction and checkbox data.
   * @returns Object with the error code and, on success, the current date and updated fraction.
   */
  async incrementTime(
    idDevice: string,
    incrementSimertDto: IncrementSimertDto,
  ) {
    const { userId, transactionId, fractionId, checkboxes } =
      incrementSimertDto;

    const register = this.commonService.getDate();

    const fractionCheck = await this.fractionRepository.findOne({
      where: { userId, transactionId },
    });

    if (fractionCheck) {
      return { errorCode: ErrorCode.TRANSACTION_REPIT };
    }

    const fractionOld = await this.fractionRepository
      .createQueryBuilder('f')
      .select([
        'f.id',
        'f.time',
        'f.registerAt',
        'slot.id',
        'slot.slot',
        'block.id',
        'zone.id',
        'block.timePerFraction',
      ])
      .innerJoin('f.block', 'block')
      .innerJoin('f.zone', 'zone')
      .innerJoin('f.slot', 'slot')
      .where('f.id = :fractionId', { fractionId })
      .andWhere('f.status < :status1', { status1: StatusFraction.SANCTIONED })
      .andWhere('f.status != :status2', {
        status2: StatusFraction.FINISHED_BY_OPERATOR,
      })
      .getOne();

    if (!fractionOld) {
      return { errorCode: ErrorCode.NOT_FOUND };
    }

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const checkboxUser = await this._lockCheckboxUserOrThrow(
        queryRunner,
        userId,
        checkboxes,
      );

      const fraction = this.fractionRepository.create({
        register,
        ...incrementSimertDto,
        beforeTime: fractionOld.time,
        timeByBlock: fractionOld.block.timePerFraction,
        checkboxes: checkboxes,
        slot: fractionOld.slot,
        block: fractionOld.block,
        zone: fractionOld.zone,
        status: { id: StatusFraction.REQUESTED },
        typeFraction: TypeFraction.DIGITAL,
        registerAt: fractionOld.registerAt,
      });

      await queryRunner.manager.save(fraction);

      // Update the user's checkboxes in CheckboxUser
      checkboxUser.checkboxes -= checkboxes;
      await queryRunner.manager.save(checkboxUser);
      await queryRunner.commitTransaction();

      // Finish the previous fraction and create a new one for the time increment
      this._saveStatus(
        fractionOld,
        StatusFraction.FINISHED_BY_INCREMENT,
        StatusMoment.NOTIFIED,
      );

      this._saveStatus(
        fraction,
        StatusFraction.INCREMENTED,
        StatusMoment.NOTIFIED,
      );
      this._notifyChageStatus(userId, StatusFraction.INCREMENTED, fraction.id);
      this._notifyBlockOperators(
        fraction.block.id,
        StatusFraction.INCREMENTED,
        fraction.id,
      );

      const f = await this._findFractionById(fraction.id);

      const currentDate = new Date();

      return { errorCode: ErrorCode.NONE, currentDate, fraction: f };
    } catch (error) {
      if (queryRunner.isTransactionActive) {
        await queryRunner.rollbackTransaction();
      }
      this.logger.error(`Error calling incrementTime: ${error.message}`);
    } finally {
      await queryRunner.release();
    }

    return { errorCode: ErrorCode.UNAUTHORIZED };
  }

  /**
   * Finishes an active fraction owned by the user: releases its slot, marks the
   * fraction as finished and notifies the user and the block operators.
   *
   * @param userId Identifier of the user that owns the fraction.
   * @param fractionId Identifier of the fraction to finish.
   * @returns Object with the resulting error code.
   */
  async finished(userId: number, fractionId: number) {
    const fraction = await this.fractionRepository
      .createQueryBuilder('f')
      .select(['f.id', 'status.id', 's.id', 'b.id'])
      .innerJoin('f.slot', 's')
      .innerJoin('f.status', 'status')
      .innerJoin('f.block', 'b')
      .where('f.id = :fractionId', { fractionId })
      .andWhere('f.userId = :userId', { userId })
      .andWhere('f.status < :status', { status: StatusFraction.FINISHED })
      .getOne();

    if (!fraction) {
      return { errorCode: ErrorCode.NOT_FOUND };
    }

    // Always release the slot
    await this.slotRepository.save({
      id: fraction.slot.id,
      status: StatusSlot.AVAILABLE,
    });

    this._saveStatus(fraction, StatusFraction.FINISHED, StatusMoment.NOTIFIED);
    this._notifyChageStatus(userId, StatusFraction.FINISHED, fraction.id);

    this._notifyBlockOperators(
      fraction.block.id,
      StatusFraction.FINISHED,
      fractionId,
    );

    return { errorCode: ErrorCode.NONE };
  }

  /**
   * Starts a new parking session: validates slot availability and transaction
   * uniqueness, locks the user's checkbox balance, creates the fraction, marks
   * the slot as occupied, debits the balance when the parking is paid and
   * notifies the user and the block operators.
   *
   * @param idDevice Identifier of the device originating the request.
   * @param createSimertDto Payload with slot, user, transaction, checkbox and paid-parking data.
   * @returns Object with the error code and, on success, the current date and created fraction.
   */
  async parking(idDevice: string, createSimertDto: CreateSimertDto) {
    const { userId, transactionId, checkboxes, isPaidParking } =
      createSimertDto;
    const register = this.commonService.getDate();

    const fractionByPlate = await this.fractionRepository.findOne({
      where: [
        { plate: createSimertDto.plate, status: { id: StatusFraction.ACTIVE } },
        {
          plate: createSimertDto.plate,
          status: { id: StatusFraction.NEXT_TO_EXCEEDED_TIME },
        },
        {
          plate: createSimertDto.plate,
          status: { id: StatusFraction.EXCEEDED_TIME },
        },
        {
          plate: createSimertDto.plate,
          status: { id: StatusFraction.SANCTIONED },
        },
      ],
      relations: { status: true },
      order: { id: 'DESC' },
    });

    if (fractionByPlate) {
      switch (fractionByPlate.status.id) {
        case StatusFraction.ACTIVE:
          return {
            errorCode: ErrorCode.OCCUPIED,
            message: 'La placa ya tiene una fracción activa',
          };
        case StatusFraction.NEXT_TO_EXCEEDED_TIME:
          return {
            errorCode: ErrorCode.NEXT_TO_EXCEEDED_TIME,
            message:
              'La placa tiene una fracción próxima a exceder el tiempo permitido',
          };
        case StatusFraction.EXCEEDED_TIME:
          return {
            errorCode: ErrorCode.EXCEEDED,
            message: 'La placa tiene una fracción con tiempo excedido',
          };
        case StatusFraction.SANCTIONED:
          return {
            errorCode: ErrorCode.SANCTIONED,
            message: 'La placa tiene una sanción activa',
          };
        default:
          return { errorCode: ErrorCode.OCCUPIED };
      }
    }

    const slot = await this.slotRepository
      .createQueryBuilder('s')
      .select([
        's.id',
        's.status',
        'zone.id',
        'block.id',
        'block.timePerFraction',
      ])
      .innerJoin('s.block', 'block')
      .innerJoin('s.zone', 'zone')
      .where('s.slot = :slot', { slot: createSimertDto.slot })
      .getOne();

    if (!slot) {
      return { errorCode: ErrorCode.NOT_FOUND };
    }

    if (slot.status == StatusSlot.OCCUPIED) {
      return { errorCode: ErrorCode.OCCUPIED };
    }

    const fractionCheck = await this.fractionRepository.findOne({
      where: { userId, transactionId },
    });

    if (fractionCheck) {
      return { errorCode: ErrorCode.TRANSACTION_REPIT };
    }

    const queryRunner = this.dataSource.createQueryRunner();

    try {
      await queryRunner.connect();
      await queryRunner.startTransaction();

      const checkboxUser = await this._lockCheckboxUserOrThrow(
        queryRunner,
        userId,
        checkboxes,
      );

      const currentDate = new Date();

      const fraction = this.fractionRepository.create({
        register,
        ...createSimertDto,
        timeByBlock: slot.block.timePerFraction,
        checkboxes: checkboxes,
        slot: slot,
        block: slot.block,
        zone: slot.zone,
        status: { id: StatusFraction.REQUESTED },
        typeFraction: TypeFraction.DIGITAL,
        registerAt: currentDate,
      });

      await queryRunner.manager.save(fraction);

      slot.status = StatusSlot.OCCUPIED;
      await queryRunner.manager.save(slot);

      // Update the user's checkboxes in CheckboxUser if this fraction is paid
      if (isPaidParking) {
        checkboxUser.checkboxes -= checkboxes;
        await queryRunner.manager.save(checkboxUser);
      }

      await queryRunner.commitTransaction();

      this._notifyChageStatus(userId, StatusFraction.ACTIVE, fraction.id);
      this._saveStatus(fraction, StatusFraction.ACTIVE, StatusMoment.NOTIFIED);
      this._notifyBlockOperators(
        slot.block.id,
        StatusFraction.ACTIVE,
        fraction.id,
      );

      const f = await this._findFractionById(fraction.id);

      return { errorCode: ErrorCode.NONE, currentDate, fraction: f };
    } catch (error) {
      if (queryRunner.isTransactionActive) {
        await queryRunner.rollbackTransaction();
      }
      this.logger.error(`call parking error.message ${error.message}`);
    } finally {
      await queryRunner.release();
    }

    return { errorCode: ErrorCode.UNAUTHORIZED };
  }

  /**
   * Resolves pricing and availability information for a slot, returning the
   * slot with its block, zone and schedule data alongside the user's current
   * checkbox balance and the server's current date.
   *
   * @param userId Identifier of the user requesting the price.
   * @param searchSlot Slot code to look up.
   * @returns Object with the error code, slot, checkbox balance and current date.
   */
  async getPriceSlot(userId: number, searchSlot: string) {
    try {
      const [slot, checkboxes, dateRow] = await Promise.all([
        this.slotRepository
          .createQueryBuilder('s')
          .select([
            's.id',
            's.typeSlot',
            's.isPaidParking',
            's.status',
            'block.id',
            'block.name',
            'zone.id',
            'zone.name',
            'block.timeLimit',
            'block.timeGrace',
            'block.timePerFraction',
            'schedules.id',
            'schedules.isActivated',
            'schedules.dayOfWeekInit',
            'schedules.dayOfWeekEnd',
            'schedules.openingTime',
            'schedules.closingTime',
          ])
          .innerJoin('s.block', 'block')
          .innerJoin('s.zone', 'zone')
          .leftJoin('block.schedules', 'schedules')
          .where('s.slot = :slot', { slot: searchSlot })
          .andWhere('s.isActivated = :isActivated', { isActivated: true })
          .andWhere('zone.isActivated = :isActivated', { isActivated: true })
          .andWhere('block.isActivated = :isActivated', { isActivated: true })
          .andWhere('s.lt != :zero AND s.lg != :zero', { zero: 0 })
          .andWhere('zone.lt != :zero AND zone.lg != :zero', { zero: 0 })
          .andWhere('block.lt != :zero AND block.lg != :zero', { zero: 0 })
          .orderBy('schedules.dayOfWeekInit', 'ASC')
          .getOne(),

        this.checkboxUserRepository
          .createQueryBuilder('cb')
          .select(['cb.checkboxes'])
          .where('cb.userId = :userId', { userId })
          .getOne(),

        this.slotRepository
          .createQueryBuilder('s')
          .select('NOW()', 'currentDate')
          .getRawOne<{ currentDate: Date }>(),
      ]);

      if (!slot) return { errorCode: ErrorCode.NOT_FOUND };

      const currentDate = dateRow?.currentDate;

      if (slot.status === StatusSlot.AVAILABLE) {
        return {
          errorCode: ErrorCode.NONE,
          slot,
          checkboxes: checkboxes?.checkboxes ?? 0,
          currentDate,
        };
      }
      return {
        errorCode: ErrorCode.OCCUPIED,
        slot,
        checkboxes: checkboxes?.checkboxes ?? 0,
        currentDate,
      };
    } catch (error) {
      handleDbExceptions(error, this.logger);
    }
  }

  /**
   * Locks the caller's CheckboxUser row with a pessimistic write lock inside
   * the supplied transaction and verifies it has enough available checkboxes.
   * Centralizes the guard shared by `parking` and `incrementTime`, preventing
   * concurrent duplicate sales.
   *
   * @param queryRunner Active query runner owning the open transaction.
   * @param userId Owner of the CheckboxUser balance.
   * @param requiredCheckboxes Amount of checkboxes the operation needs.
   * @returns The locked CheckboxUser entity.
   * @throws Error when the CheckboxUser is missing or the balance is insufficient.
   */
  private async _lockCheckboxUserOrThrow(
    queryRunner: QueryRunner,
    userId: number,
    requiredCheckboxes: number,
  ): Promise<CheckboxUser> {
    // Lock the "checkbox" column in CheckboxUser to prevent concurrent duplicate sales
    const checkboxUser = await queryRunner.manager
      .createQueryBuilder()
      .select('checkboxUser')
      .from(CheckboxUser, 'checkboxUser')
      .where('checkboxUser.userId = :userId', { userId })
      .setLock('pessimistic_write') // Write lock
      .getOne();

    if (!checkboxUser) {
      this.logger.error('CheckboxUser not found');
      throw new Error('CheckboxUser not found');
    }

    const availableCheckboxes = checkboxUser.checkboxes;
    if (requiredCheckboxes > availableCheckboxes) {
      this.logger.error('Not enough checkboxes available');
      throw new Error('Not enough checkboxes available');
    }

    return checkboxUser;
  }

  /**
   * Persists a fraction status transition: upserts the corresponding
   * {@link FractionStatus} record with the given moment and updates the
   * fraction's current status.
   *
   * @param fraction Fraction whose status is being recorded.
   * @param statusId Identifier of the target status to apply.
   * @param moment Status moment marker (e.g. notified) to store.
   */
  private async _saveStatus(
    fraction: Fraction,
    statusId: number,
    moment: number,
  ) {
    // Check whether a record already exists for the given status and fractionId
    const existingFractionStatus = await this.fractionSatusRepository.findOne({
      where: { fraction: { id: fraction.id }, status: { id: statusId } },
    });

    if (existingFractionStatus) {
      existingFractionStatus.moment = moment;
      await this.fractionSatusRepository.save(existingFractionStatus);
    } else {
      // Always persist the fraction status
      const fractionSatus = this.fractionSatusRepository.create({
        fraction,
        moment,
        status: { id: statusId },
      });
      await this.fractionSatusRepository.save(fractionSatus);
    }

    await this.fractionRepository.save({
      ...fraction,
      status: { id: statusId },
    });
  }

  /**
   * Notifies every active operator of a block about a fraction status change,
   * loading the block's operators from cache or the database on a cache miss.
   *
   * @param blockId Identifier of the block whose operators are notified.
   * @param statusFraction New fraction status to broadcast.
   * @param fractionId Identifier of the affected fraction.
   */
  private async _notifyBlockOperators(
    blockId: number,
    statusFraction: StatusFraction,
    fractionId: number,
  ) {
    const cacheKey = `BLOCK_OPERATORS:${blockId}`;
    const secondsCache = this.timeCacheBlockOperator;

    let blockOperators: BlockOperator[] = (await this.commonCacheService.get(
      cacheKey,
    )) as BlockOperator[];

    // On a cache miss, load the block's active operators and cache the result.
    if (!blockOperators) {
      const qb = this.blockOperatorRepository
        .createQueryBuilder('bo')
        .select(['bo.id', 'bo.userId', 'bo.from', 'bo.to'])
        .where('bo.blockId = :blockId', { blockId })
        .andWhere(
          `bo.from <= (NOW() AT TIME ZONE 'America/Guayaquil') AND bo.to >= (NOW() AT TIME ZONE 'America/Guayaquil')`,
        );

      blockOperators = await qb.getMany();

      await this.commonCacheService.set(cacheKey, blockOperators, secondsCache);
    }

    for (const operator of blockOperators) {
      this._notifyChageStatus(operator.userId, statusFraction, fractionId);
    }
  }

  /**
   * Dispatches a fraction status-change push notification to a single user.
   *
   * @param userId Identifier of the user to notify.
   * @param status New fraction status to report.
   * @param fractionId Identifier of the affected fraction.
   */
  private async _notifyChageStatus(
    userId: number,
    status: number,
    fractionId: number,
  ) {
    const notification = new CreateNotificationDto({
      userId,
      notification: {
        type: TypeNotification.CHANGE_STATUS_SIMERT,
        data: {
          fractionId,
          status,
        },
      },
    });
    this.commonService.notify(notification);
  }

  /**
   * Returns the paginated parking history for a user, combining the relevant
   * monthly historical archive table (when it exists) with `public.fraction`
   * for the current month, and applying optional date-range and status filters.
   *
   * @param userId Identifier of the user whose history is queried.
   * @param searchFractionDto Filters for pagination, year/month, status and date range.
   * @returns Object with the error code and the list of historical fractions.
   */
  async findFractionHistory(
    userId: number,
    searchFractionDto: SearchFractionDto,
  ) {
    const {
      offset = 0,
      limit = 10,
      year,
      month,
      currentMonth,
      statusId,
      dateFrom,
      dateTo,
      timeZone = false,
    } = searchFractionDto;

    // Date-range filter logic
    const timeFrom = '00:00:00';
    const timeTo = '23:59:59';
    let dateFromSend = '';
    let dateToSend = '';
    if (dateFrom && dateTo) {
      dateFromSend = dateFrom + ' ' + timeFrom;
      dateToSend = dateTo + ' ' + timeTo;
      if (timeZone) {
        const { start, end } = this._convertRangeToTimeZone(
          dateFromSend,
          dateToSend,
          TypeTimeZone.ECUADOR,
        );
        dateFromSend = start;
        dateToSend = end;
      }
    }
    // ***************************************

    try {
      const publicTable = 'public.fraction';
      let historicalTable = '';
      let tableExistsFraction = false;
      const schema = 'history';

      const params: any[] = [];
      const queryParts: string[] = [];

      // Guard against SQL injection: only allow safe integer year/month before
      // interpolating into the historical table identifier.
      if (year && month && this._isValidYearMonth(year, month)) {
        const monthString = month.toString().padStart(2, '0');

        let tableNameFractionAux = `"${year}_${monthString}_fraction"`;
        tableNameFractionAux = `${schema}.${tableNameFractionAux}`;
        tableExistsFraction = await this._tableExists(tableNameFractionAux);

        if (tableExistsFraction) {
          historicalTable = tableNameFractionAux;
        }
      }

      const addParam = (v: any) => {
        params.push(v);
        return `$${params.length}`;
      };

      const buildSelect = (
        fromTable: string,
        includeYearMonthFilter: boolean,
      ) => {
        let q = `
        SELECT
          f.time, f.plate, f."registerAt", f."departureDate", f.image, f."statusId", f."checkboxes",
          z.name AS zone, b.name AS block, s.slot, s.lt AS "ltSlot", s.lg AS "lgSlot"
        FROM ${fromTable} f
        INNER JOIN zone z ON z.id = f."zoneId"
        INNER JOIN block b ON b.id = f."blockId"
        INNER JOIN slot s ON s.id = f."slotId"
        WHERE f."userId" = ${addParam(userId)}
      `;

        if (includeYearMonthFilter) {
          if (dateFromSend && dateToSend) {
            q += `
              AND f."registerAt" BETWEEN ${addParam(dateFromSend)} AND ${addParam(dateToSend)}
            `;
          } else {
            q += `
              AND EXTRACT(YEAR FROM f."registerAt") = ${addParam(year)}
              AND EXTRACT(MONTH FROM f."registerAt") = ${addParam(month)}
            `;
          }
        } else {
          if (dateFromSend && dateToSend) {
            q += `
              AND f."registerAt" BETWEEN ${addParam(dateFromSend)} AND ${addParam(dateToSend)}
            `;
          }
        }

        if (statusId) {
          q += ` AND f."statusId" = ${addParam(statusId)} `;
        }

        return q;
      };

      // historical (if it exists)
      if (tableExistsFraction) {
        queryParts.push(buildSelect(historicalTable, false));
      }

      // currentMonth or day 1 -> public.fraction filtered by year/month.
      // Always hit public.fraction here: when the historical archive for the
      // current month already exists (the daily cron creates it T-2), recent
      // rows still live in public.fraction and would otherwise be missed.
      const currentDate = new Date();
      const currentDay = currentDate.getDate();

      if (currentMonth || currentDay === 1) {
        queryParts.push(buildSelect(publicTable, true));
      }

      // If nothing was added, avoid an empty query
      if (queryParts.length === 0) {
        return { errorCode: ErrorCode.NONE, fraction: [] };
      }

      let query = queryParts.join(' UNION ALL ');
      query += `
      ORDER BY "registerAt" DESC
      LIMIT ${addParam(limit)} OFFSET ${addParam(offset)};
    `;

      const fraction = await this.fractionRepository.query(query, params);
      return { errorCode: ErrorCode.NONE, fraction };
    } catch (error) {
      handleDbExceptions(error, this.logger);
    }
  }

  /**
   * Validates that `year` and `month` are safe integers within sensible bounds
   * before being interpolated into a SQL identifier (historical table name).
   *
   * @param year Candidate year value to validate.
   * @param month Candidate month value to validate.
   * @returns true when both year and month are valid integers in range, false otherwise.
   */
  private _isValidYearMonth(year: any, month: any): boolean {
    const y = Number(year);
    const m = Number(month);
    return (
      Number.isInteger(y) &&
      y >= 2000 &&
      y <= 2100 &&
      Number.isInteger(m) &&
      m >= 1 &&
      m <= 12
    );
  }

  /**
   * Checks whether a schema-qualified table exists in the database.
   *
   * @param qualifiedTableName Table name in "schema.table" form.
   * @returns true when the table exists in the given schema, false otherwise.
   */
  private async _tableExists(qualifiedTableName: string): Promise<boolean> {
    const names = qualifiedTableName.split('.');
    if (names.length <= 1) {
      this.logger.error(
        `No schema was specified for table ${qualifiedTableName}`,
      );
      return false;
    }
    const tableSchema = names[0].replace(/"/g, '').trim();
    const tableName = names[1].replace(/"/g, '').trim();

    const query = `
      SELECT EXISTS(
        SELECT 1
        FROM information_schema.tables
        WHERE table_schema = $1
          AND table_name = $2
      ) AS "exists";
    `;

    try {
      const result = await this.fractionRepository.query(query, [
        tableSchema,
        tableName,
      ]);
      return !!result[0]?.exists;
    } catch {
      return false;
    }
  }

  private _convertRangeToTimeZone = (
    startUTC: string,
    endUTC: string,
    timeZone: string,
  ): { start: string; end: string } => {
    try {
      // Extract hours and minutes from the timezone string (e.g. "-05:00")
      const [sign, hours, minutes] =
        timeZone.match(/([+-])(\d{2}):(\d{2})/)?.slice(1) || [];
      const timeZoneOffset =
        (parseInt(hours) * 60 + parseInt(minutes)) * (sign === '-' ? 1 : -1);

      // Convert both dates from UTC to Date
      const startDateUTC = new Date(startUTC + 'Z'); // "Z" ensures UTC interpretation
      const endDateUTC = new Date(endUTC + 'Z');

      // Apply the timezone offset
      const startDateInTimeZone = new Date(
        startDateUTC.getTime() + timeZoneOffset * 60 * 1000,
      );
      const endDateInTimeZone = new Date(
        endDateUTC.getTime() + timeZoneOffset * 60 * 1000,
      );

      // Format dates as "YYYY-MM-DD HH:mm:ss"
      const formatDate = (date: Date) =>
        date.getUTCFullYear() +
        '-' +
        String(date.getUTCMonth() + 1).padStart(2, '0') +
        '-' +
        String(date.getUTCDate()).padStart(2, '0') +
        ' ' +
        String(date.getUTCHours()).padStart(2, '0') +
        ':' +
        String(date.getUTCMinutes()).padStart(2, '0') +
        ':' +
        String(date.getUTCSeconds()).padStart(2, '0');

      return {
        start: formatDate(startDateInTimeZone),
        end: formatDate(endDateInTimeZone),
      };
    } catch {
      return { start: '', end: '' };
    }
  };
}
