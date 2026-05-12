import { BadRequestException, Inject, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { BlockOperator } from 'src/admin/block_operator/entities/block_operator.entity';
import { CheckboxUser } from 'src/admin/checkbox-user/entities/checkbox-user.entity';
import { Fraction } from 'src/admin/fraction/entities/fraction.entity';
import { FractionStatus } from 'src/admin/fraction_status/entities/fraction_status.entity';
import { Incident } from 'src/admin/incident/entities/incident.entity';
import { IncidentType } from 'src/admin/incident-type/entities/incident-type.entity';
import { Physic } from 'src/admin/physics/entities/physic.entity';
import { Range } from 'src/admin/range/entities/range.entity';
import { Slot } from 'src/admin/slot/entities/slot.entity';
import { Zone } from 'src/admin/zone/entities/zone.entity';
import { DinardapAntService } from 'src/api/dinardap-ant/dinardap-ant.service';
import { GimService } from 'src/api/gim/gim.service';
import { CommonCacheService } from 'src/common/common.cache.service';
import { CommonService } from 'src/common/common.service';
import { CreateNotificationDto } from 'src/common/dto/create-notification.dto';
import { PaginationDto } from 'src/common/dto/pagination.dto';
import handleDbExceptions from 'src/common/exceptions/error.db.exception';
import { ErrorCode } from 'src/common/glob/error';
import { StatusFraction } from 'src/common/glob/status/status_fraction';
import { StatusMoment } from 'src/common/glob/status/status_moment';
import { StatusPayment } from 'src/common/glob/status/status_payment';
import { StatusRange } from 'src/common/glob/status/status_range';
import { StatusSlot } from 'src/common/glob/status/status_slot';
import { SystemConfigKey } from 'src/common/glob/system-config-key';
import { TypeFraction } from 'src/common/glob/type/type_fraction';
import { IncidentCategory, IncidentStatus } from 'src/common/glob/type/type_incident';
import { TypeNotification } from 'src/common/glob/type/type_notification';
import { DataSource, Repository } from 'typeorm';

import { CreateIncidentDto } from '../incident/dto/create-incident.dto';
import { GetIncidentDto } from '../incident/dto/get-incident.dto';
import { CreateOperatorDto } from './dto/create-operator.dto';
import { IncrementOperatorDto } from './dto/increment-operator.dto';

@Injectable()
export class OperatorService {

  private readonly logger = new Logger('OperatorService');

  private readonly columsFraction: string[] = [
    'f.id', 'f.typeFraction', 'f.userId', 'f.time', 'f.card', 'f.plate', 'f.tint', 'f.alias', 'f.image', 'f.transactionId', 'f.registerAt', 'f.departureDate', 'f.optionalData',
    'status',
    'block.name', 'block.neighborhood', 'block.mainStreet', 'block.sideStreet', 'block.timePerFraction',
    'slot.slot', 'slot.status'
  ];

  constructor(
    @InjectRepository(Fraction)
    private readonly fractionRepository: Repository<Fraction>,

    @InjectRepository(BlockOperator)
    private readonly blockOperatorRepository: Repository<BlockOperator>,

    @InjectRepository(Slot)
    private readonly slotRepository: Repository<Slot>,

    @InjectRepository(FractionStatus)
    private readonly fractionSatusRepository: Repository<FractionStatus>,

    @InjectRepository(Physic)
    private readonly physicRepository: Repository<Physic>,

    @InjectRepository(Zone)
    private readonly zoneRepository: Repository<Zone>,

    @InjectRepository(Range)
    private readonly rangeRepository: Repository<Range>,

    @InjectRepository(CheckboxUser)
    private readonly checkboxUserRepository: Repository<CheckboxUser>,

    @InjectRepository(Incident)
    private readonly incidentRepository: Repository<Incident>,

    @InjectRepository(IncidentType)
    private readonly incidentTypeRepository: Repository<IncidentType>,

    @Inject(CommonService)
    private readonly commonService: CommonService,

    private readonly commonCacheService: CommonCacheService,

    private readonly dinardapAntService: DinardapAntService,

    private readonly dataSource: DataSource,

    private readonly gimService: GimService,

  ) { }

  async createIncident(userId: number, idDevice: string, createIncidentDto: CreateIncidentDto) {
    try {

      console.log('createIncident');
      console.log(createIncidentDto);

      const { fractionId, incidentCategory, incidentTypeId } = createIncidentDto;

      const plate = (createIncidentDto.plate ?? '').trim();
      let antEmailClient: string = null;
      let antFullNameClient: string = null;
      let antIdentityCard: string = null;

      if (plate) {
        const antResult = await this.dinardapAntService.getUserDataByPlateAnt(plate);
        console.log('antResult');
        console.log(antResult);
        if (antResult.errorCode === ErrorCode.NONE) {
          antEmailClient = antResult.data.email || null;
          antFullNameClient = antResult.data.fullName || null;
          antIdentityCard = antResult.data.identityCard || null;
        }
      }

      let amount: string = null;
      const optionalData = [...(createIncidentDto.optionalData ?? [])];

      if (incidentCategory === IncidentCategory.NOTIFICATION) {
        const queryTypeIncident = await this.incidentTypeRepository.findOne({
          where: { id: incidentTypeId },
        });
        if (!queryTypeIncident) {
          throw new BadRequestException('Tipo de incidente no encontrado');
        }

        const salaryBasic = await this.commonCacheService.getSalary();
        amount = ((Number(queryTypeIncident.percentage) * salaryBasic.salary) / 100).toFixed(2);
        optionalData.push({ key: SystemConfigKey.BASIC_SALARY, value: salaryBasic.salary });
      }

      const register = this.commonService.getDate();
      const incident = this.incidentRepository.create({
        ...createIncidentDto,
        description: createIncidentDto.description ?? '',
        supervisorObservations: createIncidentDto.supervisorObservations ?? '',
        images: createIncidentDto.images ?? [],
        optionalData,
        ...(fractionId && { fraction: { id: fractionId } }),
        amount: +amount,
        register,
        nroTicket: createIncidentDto.nroTicket?.trim() || null,
        emailClient: createIncidentDto.emailClient || antEmailClient,
        fullNameClient: createIncidentDto.fullNameClient || antFullNameClient,
        identityCard: createIncidentDto.identityCard || antIdentityCard,
      });

      const savedIncident = await this.incidentRepository.save(incident);

      if (fractionId) {
        const queryFraction = await this.fractionRepository
          .createQueryBuilder('fraction')
          .innerJoinAndSelect('fraction.slot', 'slot')
          .where('fraction.id = :id', { id: fractionId })
          .getOne();

        if (!queryFraction) {
          throw new BadRequestException('Fracción no encontrada');
        }

        await this.fractionRepository.update(fractionId, {
          status: { id: StatusFraction.SANCTIONED },
        });

        await this._saveSatus(queryFraction, StatusFraction.SANCTIONED, StatusMoment.NOTIFIED);
        await this._notifyChageStatus(queryFraction.userId, StatusFraction.SANCTIONED, fractionId);

        await this.slotRepository.update(queryFraction.slot.id, {
          status: StatusSlot.SANCTIONED,
        });
      }

      return { incident: savedIncident, errorCode: ErrorCode.NONE };
    } catch (error) {
      handleDbExceptions(error, this.logger);
    }
  }

  async findAllPhysic(card: string) {
    try {

      const queryVerifyTiraje = await this.rangeRepository.createQueryBuilder('r')
        .select(['r.id', 'r.from', 'r.to'])
        .where('CAST(:card AS bigint) BETWEEN CAST(r.from AS bigint) AND CAST(r.to AS bigint)', { card })
        .andWhere('r.isActivated = :isActivated', { isActivated: true })
        .andWhere('r.status NOT IN (:...status)', { status: [StatusRange.CLOSED, StatusRange.DEPLETED] })
        .orderBy('r.id', 'DESC')
        .getOne();

      if (!queryVerifyTiraje) {
        return { errorCode: ErrorCode.NOT_FOUND, physic: [], range: false };
      }

      const physicResult = await this.physicRepository.createQueryBuilder('p')
        .select(['p.id', 'p.zoneId', 'p.checkboxes', 'p.timeByBlock'])
        .addSelect(`TO_CHAR(p."registerAt", 'YYYY-MM-DD HH24:MI:SS')`, 'p_registerAt')
        .where('p.card = :card', { card })
        .getRawAndEntities();

      const physic = physicResult.entities.map((entity, i) => ({
        ...entity,
        registerAt: physicResult.raw[i]?.p_registerAt ?? null,
      }));

      const currentDate = new Date();

      return { errorCode: ErrorCode.NONE, currentDate, physic, range: true };
    } catch (error) {
      handleDbExceptions(error, this.logger);
    }
  }

  async incrementTime(idDevice: string, incrementOperatorDto: IncrementOperatorDto) {
    const { userId, transactionId, fractionId, checkboxes, obsolete, physicId } = incrementOperatorDto;
    const register = this.commonService.getDate();

    const fractionCheck = await this.fractionRepository.findOne({ where: { userId, transactionId } });

    if (fractionCheck) {
      return { errorCode: ErrorCode.TRANSACTION_REPIT };
    }

    const fractionOld = await this.fractionRepository.createQueryBuilder('f')
      .select(['f.id', 'f.time', 'f.typeFraction', 'f.registerAt', 'slot.id', 'slot.slot', 'block.id', 'zone.id', 'block.timePerFraction'])
      .innerJoin("f.block", "block")
      .innerJoin("f.zone", "zone")
      .innerJoin("f.slot", "slot")
      .where('f.id = :fractionId', { fractionId })
      .getOne();

    if (!fractionOld) {
      return { errorCode: ErrorCode.NOT_FOUND };
    }

    const queryRunner = this.dataSource.createQueryRunner();

    try {

      await queryRunner.connect();
      await queryRunner.startTransaction();

      const fraction = this.fractionRepository.create({
        register,
        ...incrementOperatorDto,
        beforeTime: fractionOld.time,
        timeByBlock: fractionOld.block.timePerFraction,
        checkboxes: checkboxes,
        slot: fractionOld.slot,
        block: fractionOld.block,
        zone: fractionOld.zone,
        status: { id: StatusFraction.REQUESTED },
        typeFraction: fractionOld.typeFraction,
        registerAt: fractionOld.registerAt,
      });

      await queryRunner.manager.save(fraction);
      await queryRunner.commitTransaction();

      this._saveSatus(fractionOld, StatusFraction.FINISHED_BY_INCREMENT, StatusMoment.NOTIFIED);

      this._saveSatus(fraction, StatusFraction.INCREMENTED, StatusMoment.NOTIFIED);
      this._notifyChageStatus(userId, StatusFraction.INCREMENTED, fraction.id);

      const f = await this._findFractionById(fraction.id);

      await this._savePhysic(fraction, obsolete, physicId);

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

  async parking(createOperatorDto: CreateOperatorDto) {
    console.log('dentro de parking', createOperatorDto)
    const { userId, transactionId, checkboxes, obsolete, physicId } = createOperatorDto;
    const register = this.commonService.getDate();

    const slot = await this.slotRepository.createQueryBuilder('s')
      .select(['s.id', 's.status', 'block.id', 'zone.id', 'block.timePerFraction'])
      .innerJoin("s.block", "block")
      .innerJoin("s.zone", "zone")
      .where('s.slot = :slot', { slot: createOperatorDto.slot })
      .getOne();

    if (!slot) {
      return { errorCode: ErrorCode.NOT_FOUND }
    }

    if (slot.status == StatusSlot.OCCUPIED) {
      return { errorCode: ErrorCode.OCCUPIED }
    }

    let fractionCheck = await this.fractionRepository.findOne({ where: { userId, transactionId } });

    if (fractionCheck) {
      return { errorCode: ErrorCode.TRANSACTION_REPIT }
    }

    const queryRunner = this.dataSource.createQueryRunner();

    try {
      await queryRunner.connect();
      await queryRunner.startTransaction();

      // Se guarda con la hora local del servidor (Ecuador). El driver pg
      // serializa el Date usando los componentes locales (getHours, etc.) y
      // los inserta tal cual en la columna timestamp (sin TZ), por lo que no
      // se aplica ninguna conversión a UTC.
      const fromTime = new Date(createOperatorDto.fromTime);

      if (createOperatorDto.typeFraction === TypeFraction.VIRTUAL) {
        const numberVirtual = await this._findNextIdVirtual();
        createOperatorDto.card = numberVirtual;
      }
      const fraction = this.fractionRepository.create({
        ...createOperatorDto,
        register,
        timeByBlock: slot.block.timePerFraction,
        checkboxes: checkboxes,
        slot: slot,
        block: slot.block,
        zone: slot.zone,
        status: { id: StatusFraction.REQUESTED },
        typeFraction: createOperatorDto.typeFraction,
        registerAt: fromTime
      });

      await queryRunner.manager.save(fraction);

      slot.status = StatusSlot.OCCUPIED;
      await queryRunner.manager.save(slot);

      await queryRunner.commitTransaction();

      this._notifyChageStatus(userId, StatusFraction.ACTIVE, fraction.id);
      this._saveSatus(fraction, StatusFraction.ACTIVE, StatusMoment.NOTIFIED);

      const currentDate = new Date();
      const f = await this._findFractionById(fraction.id);

      await this._savePhysic(fraction, obsolete, physicId);

      return { errorCode: ErrorCode.NONE, currentDate, fraction: f };

    } catch (error) {
      if (queryRunner.isTransactionActive) {
        await queryRunner.rollbackTransaction();
      }
      this.logger.error(`call operator error.message ${error.message}`);
    } finally {
      await queryRunner.release();
    }

    return { errorCode: ErrorCode.UNAUTHORIZED };
  }

  async findAllBlocks(userId: number) {
    try {

      const currentDate = new Date();

      const blocks = await this.blockOperatorRepository.createQueryBuilder('bo')
        .select([
          'bo.id', 'bo.from', 'bo.to', 'bo.isInitialized', 'bo.isFinalized',
          'block.id', 'block.name', 'block.neighborhood', 'block.mainStreet', 'block.sideStreet',
          'zone.id', 'zone.name'
        ])
        .innerJoin('bo.block', 'block')
        .innerJoin('block.zone', 'zone')
        .where('bo.userId = :userId', { userId })
        .andWhere('bo.isActivated = :isActivated', { isActivated: 1 })
        .andWhere('bo.from <= :currentDate', { currentDate })
        .andWhere('bo.to >= :currentDate', { currentDate })
        .andWhere('bo.isFinalized = :isFinalized', { isFinalized: 0 }) //No se devuelve los bloques finalizados
        .getMany();

      return { errorCode: ErrorCode.NONE, currentDate, blocks };
    } catch (error) {
      handleDbExceptions(error, this.logger);
    }
  }

  // async findAllFractions(blockId: number, userId: number, paginationDto: PaginationDto) {
  //   const { offset, limit } = paginationDto;
  //   try {

  //     // Queries independientes por blockId, se ejecutan en paralelo
  //     const slotQuery = this.slotRepository.createQueryBuilder('slot')
  //       .select([
  //         'slot.id', 'slot.slot', 'slot.status',
  //         'block.id', 'block.name', 'block.neighborhood', 'block.mainStreet', 'block.sideStreet', 'block.timePerFraction',
  //       ])
  //       .innerJoin('slot.block', 'block')
  //       .where('slot.blockId = :blockId', { blockId });

  //     const fractionQuery = this.fractionRepository.createQueryBuilder('f')
  //       .select([
  //         'f.id', 'f.typeFraction', 'f.userId', 'f.time', 'f.card', 'f.plate', 'f.tint', 'f.alias', 'f.image', 'f.transactionId', 'f.optionalData',
  //         'status',
  //         'fSlot.id',
  //       ])
  //       .addSelect(`TO_CHAR(f."registerAt" AT TIME ZONE 'UTC' AT TIME ZONE 'America/Guayaquil', 'YYYY-MM-DD HH24:MI:SS')`, 'f_registerAt')
  //       .addSelect(`TO_CHAR(f."departureDate" AT TIME ZONE 'UTC' AT TIME ZONE 'America/Guayaquil', 'YYYY-MM-DD HH24:MI:SS')`, 'f_departureDate')
  //       .innerJoin('f.status', 'status')
  //       .innerJoin('f.slot', 'fSlot')
  //       .where('f.blockId = :blockId', { blockId })
  //       .innerJoin(
  //         qb => qb.subQuery()
  //           .select('MAX(sub.id)', 'maxid')
  //           .from(Fraction, 'sub')
  //           .where('sub.blockId = :blockId', { blockId })
  //           .groupBy('sub.slot'),
  //         'latest', 'latest.maxid = f.id',
  //       );

  //     // Ejecución en paralelo — ninguna espera a la otra
  //     const [slots, fractionResult] = await Promise.all([
  //       slotQuery.take(limit).skip(offset).getMany(),
  //       fractionQuery.getRawAndEntities(),
  //     ]);

  //     const fractions = fractionResult.entities.map((entity, i) => ({
  //       ...entity,
  //       registerAt: fractionResult.raw[i]?.f_registerAt ?? null,
  //       departureDate: fractionResult.raw[i]?.f_departureDate ?? null,
  //     }));

  //     // Merge con Map O(n)
  //     const fractionBySlotId = new Map(fractions.map(f => [f.slot.id, f]));

  //     const slotsWithFractions = slots.map(slot => ({
  //       ...slot,
  //       fraction: fractionBySlotId.get(slot.id) ?? null,
  //     }));

  //     const currentDate = new Date();
  //     return { errorCode: ErrorCode.NONE, currentDate, fractions: slotsWithFractions };
  //   } catch (error) {
  //     handleDbExceptions(error, this.logger);
  //   }
  // }

  async findAllFractions(blockId: number, userId: number, paginationDto: PaginationDto) {
    const { offset, limit } = paginationDto;
    try {

      // Queries independientes por blockId, se ejecutan en paralelo
      const slotQuery = this.slotRepository.createQueryBuilder('slot')
        .select([
          'slot.id', 'slot.slot', 'slot.status',
          'block.id', 'block.name', 'block.neighborhood', 'block.mainStreet', 'block.sideStreet', 'block.timePerFraction',
        ])
        .innerJoin('slot.block', 'block')
        .where('slot.blockId = :blockId', { blockId });

      const fractionQuery = this.fractionRepository.createQueryBuilder('f')
        .select([
          'f.id', 'f.typeFraction', 'f.userId', 'f.time', 'f.card', 'f.plate', 'f.tint', 'f.alias', 'f.image', 'f.transactionId', 'f.optionalData',
          'status',
          'fSlot.id',
        ])
        .addSelect(`TO_CHAR(f."registerAt", 'YYYY-MM-DD"T"HH24:MI:SS.MS')`, 'f_registerAt')
        .addSelect(`TO_CHAR(f."departureDate", 'YYYY-MM-DD"T"HH24:MI:SS.MS')`, 'f_departureDate')
        .innerJoin('f.status', 'status')
        .innerJoin('f.slot', 'fSlot')
        .where('f.blockId = :blockId', { blockId })
        .innerJoin(
          qb => qb.subQuery()
            .select('MAX(sub.id)', 'maxid')
            .from(Fraction, 'sub')
            .where('sub.blockId = :blockId', { blockId })
            .groupBy('sub.slot'),
          'latest', 'latest.maxid = f.id',
        );

      // Ejecución en paralelo — ninguna espera a la otra
      const [slots, fractionResult] = await Promise.all([
        slotQuery.take(limit).skip(offset).getMany(),
        fractionQuery.getRawAndEntities(),
      ]);

      const fractions = fractionResult.entities.map((entity, i) => ({
        ...entity,
        registerAt: fractionResult.raw[i]?.f_registerAt ?? null,
        departureDate: fractionResult.raw[i]?.f_departureDate ?? null,
      }));

      // Merge con Map O(n)
      const fractionBySlotId = new Map(fractions.map(f => [f.slot.id, f]));

      const slotsWithFractions = slots.map(slot => ({
        ...slot,
        fraction: fractionBySlotId.get(slot.id) ?? null,
      }));

      const currentDate = new Date();
      return { errorCode: ErrorCode.NONE, currentDate, fractions: slotsWithFractions };
    } catch (error) {
      handleDbExceptions(error, this.logger);
    }
  }

  async findAllFractionsBycriteria(criteria: string) {
    try {
      const fractions = await this.fractionRepository.createQueryBuilder('f')
        .select(this.columsFraction)
        .innerJoin('f.status', 'status')
        .innerJoin('f.block', 'block')
        .innerJoin('f.slot', 'slot')
        .where('(f.plate = :plate OR f.card = :card)', { plate: criteria, card: criteria })
        .andWhere('f.status != :statusByOperator', { statusByOperator: StatusFraction.FINISHED_BY_INCREMENT })
        .getMany();

      const currentDate = new Date();

      return { errorCode: ErrorCode.NONE, currentDate, fractions };
    } catch (error) {
      handleDbExceptions(error, this.logger);
    }
  }

  async findFractionById(fractionId: number) {
    const currentDate = new Date();
    const f = await this._findFractionById(fractionId);
    return { errorCode: ErrorCode.NONE, currentDate, fraction: f };
  }

  timeVirtual() {
    const currentDate = new Date();
    return { errorCode: ErrorCode.NONE, currentDate, time: '00:05:00' };
  }

  private async _findNextIdVirtual() {
    const currentDate = new Date();

    const fraction = await this.fractionRepository.createQueryBuilder('f')
      .select(['f.id', 'f.card'])
      .where('f.typeFraction = :typeFraction', { typeFraction: TypeFraction.VIRTUAL.toString() }) // Convert to string
      .orderBy('f.id', 'DESC')
      .limit(1)
      .getOne();
    if (!fraction) {
      const uniqueNumber = this._generateFirstUniqueNumber();
      return uniqueNumber;
    }
    try {
      const virtual = fraction.card;
      const parts = virtual.split("-");
      const lastCounter = parts[parts.length - 1];
      const nextCounter = String(Number(lastCounter) + 1).padStart(4, '0');
      const formattedDate = currentDate.toISOString().slice(2, 10).replace(/-/g, '');
      const uniqueNumber = `${formattedDate}-${nextCounter}`;
      return uniqueNumber;
    } catch (error) {
      return error;
    }
  }

  private async _generateFirstUniqueNumber() {
    // Get the current date and format it as "YEAR-MONTH-DAY"
    const currentDate = new Date().toISOString().slice(2, 10).replace(/-/g, '');
    // Get the counter with three digits and add leading zeros if necessary
    const formattedCounter = String(1).padStart(4, '0');
    // Return the unique number in the format "YEAR-MONTH-DAY-COUNTER"
    return `${currentDate}-${formattedCounter}`;
  }

  private async _findFractionById(fractionId: number) {
    const fraction = await this.fractionRepository.createQueryBuilder('f')
      .select(this.columsFraction)
      .where('f.id = :fractionId', { fractionId })
      .innerJoin('f.status', 'status')
      .innerJoin("f.block", "block")
      .innerJoin('f.slot', 'slot')
      .getOne();
    return fraction;
  }

  async finished(userId: number, fractionId: number) {

    const fraction = await this.fractionRepository.createQueryBuilder('f')
      .select(['f.id', 'f.userId', 'status.id', 's.id'])
      .innerJoin('f.status', 'status')
      .innerJoin('f.slot', 's')
      .where('f.id = :fractionId', { fractionId })
      .andWhere('f.status < :status', { status: StatusFraction.FINISHED })
      .getOne();

    if (!fraction) {
      return { errorCode: ErrorCode.NOT_FOUND };
    }

    await this.slotRepository.save({ id: fraction.slot.id, status: StatusSlot.AVAILABLE });

    await this._saveSatus(fraction, StatusFraction.FINISHED_BY_OPERATOR, StatusMoment.NOTIFIED);
    //Notificamos al usuario propietario de la fracion que puede ser el controlador o el cliente
    await this._notifyChageStatus(fraction.userId, StatusFraction.FINISHED_BY_OPERATOR, fraction.id);

    return { errorCode: ErrorCode.NONE };
  }

  private async _savePhysic(fraction: Fraction, obsolete: number, physicId: number) {
    if (obsolete > 0) {
      const registerAtMinusOneDay = new Date(fraction.registerAt);
      registerAtMinusOneDay.setDate(registerAtMinusOneDay.getDate() - 1);

      const physic = this.physicRepository.create({
        userId: fraction.userId,
        card: fraction.card,
        zoneId: fraction.zone.id,
        time: fraction.time,
        checkboxes: obsolete,
        timeByBlock: fraction.timeByBlock,
        registerAt: registerAtMinusOneDay,
      });

      await this.physicRepository.save(physic);
    }

    if (physicId > 0) {
      await this.physicRepository.update(
        { id: physicId },
        {
          checkboxes: fraction.checkboxes,
          timeByBlock: fraction.timeByBlock,
          zoneId: fraction.zone.id,
        },
      );
    } else {
      const physic = this.physicRepository.create({
        userId: fraction.userId,
        card: fraction.card,
        zoneId: fraction.zone.id,
        time: fraction.time,
        checkboxes: fraction.checkboxes,
        timeByBlock: fraction.timeByBlock,
        registerAt: fraction.registerAt,
      });

      await this.physicRepository.save(physic);
    }
  }

  private async _saveSatus(fraction: Fraction, statusId: number, moment: number) {
    // Verifica si ya existe un registro para el status y fractionid dado
    const existingFractionStatus = await this.fractionSatusRepository.findOne({
      where: { fraction: { id: fraction.id }, status: { id: statusId }, },
    });

    if (existingFractionStatus) {
      existingFractionStatus.moment = moment;
      await this.fractionSatusRepository.save(existingFractionStatus);
    }
    else {
      // Siempre guardamos el estado del fraction
      const fractionSatus = this.fractionSatusRepository.create({ fraction, moment, status: { id: statusId } });
      await this.fractionSatusRepository.save(fractionSatus);
    }
    if (statusId === StatusFraction.FINISHED_BY_OPERATOR) {
      if (fraction.status.id === StatusFraction.EXCEEDED_TIME || fraction.status.id === StatusFraction.SANCTIONED) {
        await this.fractionRepository.save({ ...fraction, status: { id: StatusFraction.FINISHED_BY_CONTROLLER }, });
      } else {
        await this.fractionRepository.save({ ...fraction, status: { id: StatusFraction.FINISHED_BY_OPERATOR }, });
      }
    } else {
      await this.fractionRepository.save({ ...fraction, status: { id: statusId }, });
    }
  }

  private async _notifyChageStatus(userId: number, status: number, fractionId: number) {
    const notification = new CreateNotificationDto({
      userId,
      notification: {
        type: TypeNotification.CHANGE_STATUS_SIMERT,
        data: {
          fractionId,
          status,
        },
      }
    });
    this.commonService.notify(notification);
  }

  async getPriceSlot(userId: number, searchSlot: string) {

    try {

      const [slot, checkboxes] = await Promise.all(
        [
          this.slotRepository.createQueryBuilder('s')
            .select(['s.id', 's.typeSlot', 's.isPaidParking', 's.status', 'block.id', 'block.name', 'zone.id', 'zone.name', 'block.timeLimit', 'block.timeGrace', 'block.timePerFraction', 'schedules.id', 'schedules.isActivated', 'schedules.dayOfWeekInit', 'schedules.dayOfWeekEnd', 'schedules.openingTime', 'schedules.closingTime', 'blockOperator.id', 'blockOperator.from', 'blockOperator.to'])
            .innerJoin("s.block", "block")
            .innerJoin("s.zone", "zone")
            .innerJoin("block.blocksOperator", "blockOperator")
            .leftJoin('block.schedules', 'schedules')
            .where('s.slot = :slot', { slot: searchSlot })
            .andWhere('blockOperator.userId = :userId', { userId })
            .andWhere('blockOperator.isActivated = :isActivated', { isActivated: true })
            .andWhere(':date BETWEEN blockOperator.from AND blockOperator.to', {
              date: new Date(),
            })
            .orderBy('schedules.dayOfWeekInit', 'ASC')  // 👈 orden principal
            .getOne(),

          this.checkboxUserRepository.createQueryBuilder('cb')
            .select(['cb.checkboxes'])
            .where('cb.userId = :userId', { userId })
            .getOne()
        ]);

      if (!slot)
        return { errorCode: ErrorCode.NOT_FOUND }

      if (slot.status === StatusSlot.AVAILABLE) {
        return { errorCode: ErrorCode.NONE, slot, checkboxes: checkboxes ? checkboxes.checkboxes : 0 };

      }
      return { errorCode: ErrorCode.OCCUPIED, slot, checkboxes: checkboxes ? checkboxes.checkboxes : 0 };
    } catch (error) {
      handleDbExceptions(error, this.logger);
    }
  }

  async findSanctionByIdentityCard(userId: number, idDevice: string, identityCard: string, getIncidentDto: GetIncidentDto) {

    try {

      this.logger.log(`findSanctionByIdentityCard operator: ${identityCard}`);

      let tableName = 'public.incident';
      const currentDate = new Date();

      let params: any[] = [];
      let paramIndex = 1;

      const buildWhere = () => {

        //Solo notificaciones que son multas
        let where = `WHERE i."incidentCategory" = $${paramIndex++}`;
        params.push(IncidentCategory.NOTIFICATION);

        // que no esten pagadas en el municipio
        where += ` AND i."statusIncident" IN ($${paramIndex++}, $${paramIndex++}, $${paramIndex++})`;
        params.push(IncidentStatus.ENTERED, IncidentStatus.APPROVED, IncidentStatus.SUPPLIED);

        // que no esten pagadas internamente
        where += ` AND (i."statusPayment" != $${paramIndex++} OR i."statusPayment" IS NULL)`;
        params.push(StatusPayment.PAID);

        where += ` AND i."identityCard" = $${paramIndex++}`;
        params.push(identityCard);

        where += ` ORDER BY i.id ASC`;

        return where;
      };

      const baseSelect = (table: string) => `
      SELECT
        i.id AS id, i.description AS description, i.images AS images, i.plate AS plate,
        it.name AS reason, i.amount AS amount, i."bondId" AS "bondId",
        i."createdAt" AS "createdAt", i."statusIncident" AS "status", i."register" AS "register",
        i."nroTicket" AS "nroTicket", i."incidentTypeId" AS "incidentTypeId",
        i."vehicleType" AS "vehicleType",
        i."address" AS "address", i."optionalData" AS "optionalData",
        i."controllerId" AS "controllerId", i."onResponseExternal" AS "onResponseExternal",
        i."identityCard" AS "identityCard", i."commission" AS "commission", i."reference" AS "reference"
      FROM ${table} i
      INNER JOIN public.incident_type it ON i."incidentTypeId" = it.id
    `;

      const query = `${baseSelect(tableName)} ${buildWhere()}`;

      console.log('query', query);
      console.log('params', params);

      const incidents: Incident[] = await this.incidentRepository.query(query, params);

      if (incidents.length === 0)
        return { errorCode: ErrorCode.NOT_FOUND, currentDate, incidents };

      for (const incident of incidents) {

        // VERIFICAMOS SI LA DEUDA YA FUE EMITIDA en el gim y actualizamos el estado
        const findObligation = await this.gimService.findObligationsByCitation(incident.nroTicket, incident.identityCard);
        console.log(findObligation)
        if (findObligation.errorCode === ErrorCode.NONE) {
          this.logger.log(`Deuda encontrada en el GIM: ${JSON.stringify(findObligation.data)}`);
          const validateStatus = await this.gimService._validateStatusSistemWithGim(findObligation.data.obligations);
          if (validateStatus.errorCode === ErrorCode.NONE) {
            const onResponseExternal = this._formatOnExternalResponse(incident.onResponseExternal, findObligation.data);
            await this.incidentRepository.update(incident.id, {
              bondId: +findObligation.data.obligations[0].obligationId,
              nroObligation: findObligation.data.obligations[0].obligationNumber.toString(),
              statusIncident: validateStatus.statusIncident,
              amount: findObligation.data.obligations[0].total,
              onResponseExternal
            });
          }
          continue;
        }
      }

      // Re-query para devolver solo los que siguen en estados pendientes
      const updatedIncidents = await this.incidentRepository.query(query, params);

      if (updatedIncidents.length === 0)
        return { errorCode: ErrorCode.NOT_FOUND, currentDate, incidents: updatedIncidents };

      return { errorCode: ErrorCode.NONE, currentDate, incidents: updatedIncidents };

    } catch (error) {
      this.logger.error(`GIM emit incident ${error?.message}`);
      handleDbExceptions(error, this.logger);
    }
  }

  private _formatOnExternalResponse(onResponseExternal: any[], onResponseExternalData: object): any[] {
    const result = [...(onResponseExternal ?? [])];
    if (onResponseExternalData) result.push(onResponseExternalData);
    return result;
  }
}
