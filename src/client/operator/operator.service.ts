import {
    BadRequestException,
    Inject,
    Injectable,
    Logger,
} from '@nestjs/common';
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
import {
    IncidentCategory,
    IncidentStatus,
} from 'src/common/glob/type/type_incident';
import { TypeNotification } from 'src/common/glob/type/type_notification';
import { TypeOperation } from 'src/common/glob/type/type_operation';
import { OptionalDataInterface } from 'src/common/intefaces/optional-data.interface';
import { LoggerService } from 'src/common/logger.service.ts';
import { DataSource, Repository } from 'typeorm';

import { CreateIncidentDto } from '../incident/dto/create-incident.dto';
import { GetIncidentDto } from '../incident/dto/get-incident.dto';
import { CreateOperatorDto } from './dto/create-operator.dto';
import { IncrementOperatorDto } from './dto/increment-operator.dto';

/**
 * Service that drives the controller/supervisor (operator) mobile flow:
 * plate lookup with ANT data enrichment, incident (fine) creation and the
 * full operator session lifecycle (check-in, parking record creation,
 * time increments and check-out). Cooperates with {@link GimService} for
 * GIM synchronization and {@link CommonCacheService} for Redis-based locking.
 */
@Injectable()
export class OperatorService {
    private readonly logger = new Logger('OperatorService');

    /** Expected client-supplied `register` datetime format: `YYYY-MM-DD HH:MM:SS`. */
    private static readonly REGISTER_DATETIME_PATTERN =
        /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/;

    private readonly columsFraction: string[] = [
        'f.id',
        'f.typeFraction',
        'f.userId',
        'f.time',
        'f.card',
        'f.plate',
        'f.tint',
        'f.alias',
        'f.image',
        'f.transactionId',
        'f.registerAt',
        'f.departureDate',
        'f.optionalData',
        'status',
        'block.name',
        'block.neighborhood',
        'block.mainStreet',
        'block.sideStreet',
        'block.timePerFraction',
        'slot.slot',
        'slot.status',
    ];

    /**
     * Creates the operator service and injects every repository and collaborator
     * required for the operator flow (parking, increments, incidents and lookups).
     *
     * @param fractionRepository Repository for parking fraction records.
     * @param blockOperatorRepository Repository for block-operator assignments.
     * @param slotRepository Repository for parking slots.
     * @param fractionSatusRepository Repository for fraction status history.
     * @param physicRepository Repository for physical checkbox (Physic) records.
     * @param zoneRepository Repository for parking zones.
     * @param rangeRepository Repository for sale-point card ranges.
     * @param checkboxUserRepository Repository for per-user checkbox balances.
     * @param incidentRepository Repository for incidents (fines/notifications).
     * @param incidentTypeRepository Repository for incident types.
     * @param commonService Shared service for date utilities and notifications.
     * @param commonCacheService Shared cache service for Redis-based values and locks.
     * @param dinardapAntService Service for ANT plate/owner data enrichment.
     * @param dataSource TypeORM data source used to create query runners and transactions.
     * @param gimService Service for GIM synchronization of obligations.
     */
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

        @Inject(LoggerService)
        private readonly loggerService: LoggerService,
    ) {}

    /**
     * Records an incident audit entry for a change made from the supervisor
     * app, so the trail names who performed it.
     *
     * The row is re-read to store the full snapshot, which is the convention
     * the rest of the audit trail follows (the web diffs consecutive
     * snapshots). Failing to audit never breaks the caller's flow.
     *
     * @param id Identifier of the affected incident.
     * @param userId Identifier of the user who performed the change.
     * @param typeOperation Operation being recorded.
     */
    private async _auditIncident(
        id: number,
        userId: number,
        typeOperation: TypeOperation,
    ): Promise<void> {
        try {
            const incident = await this.incidentRepository.findOne({
                where: { id },
            });
            if (!incident) return;

            this.loggerService.saveIncidentLogger({
                id,
                userId,
                typeOperation,
                incident,
            });
        } catch (error) {
            this.logger.error('call _auditIncident: ', error);
        }
    }

    /**
     * Creates an incident (fine or notification), enriching it with ANT owner
     * data when a plate is provided and computing the fine amount from the
     * incident type percentage. When linked to a fraction, marks the fraction
     * and its slot as sanctioned and notifies the owner.
     *
     * @param userId Identifier of the operator creating the incident.
     * @param idDevice Identifier of the device that originated the request.
     * @param createIncidentDto Payload describing the incident to create.
     * @returns Promise resolving to the saved incident and an error code.
     */
    async createIncident(
        userId: number,
        idDevice: string,
        createIncidentDto: CreateIncidentDto,
    ) {
        // Validate and resolve the registration datetime before entering the
        // try/catch so a malformed value surfaces as a clean 400 instead of being
        // mapped to a 500 by handleDbExceptions.
        const register = this._resolveRegister(createIncidentDto.register);
        try {
            const { fractionId, incidentCategory, incidentTypeId } =
                createIncidentDto;

            const plate = (createIncidentDto.plate ?? '').trim();
            let antEmailClient: string = null;
            let antFullNameClient: string = null;
            let antIdentityCard: string = null;

            if (plate) {
                const antResult =
                    await this.dinardapAntService.getUserDataByPlateAnt(plate);
                if (antResult.errorCode === ErrorCode.NONE) {
                    antEmailClient = antResult.data.email || null;
                    antFullNameClient = antResult.data.fullName || null;
                    antIdentityCard = antResult.data.identityCard || null;
                }
            }

            let amount: string = null;
            const optionalData = [...(createIncidentDto.optionalData ?? [])];

            if (incidentCategory === IncidentCategory.NOTIFICATION) {
                const queryTypeIncident =
                    await this.incidentTypeRepository.findOne({
                        where: { id: incidentTypeId },
                    });
                if (!queryTypeIncident) {
                    throw new BadRequestException(
                        'Tipo de incidente no encontrado',
                    );
                }

                const salaryBasic = await this.commonCacheService.getSalary();
                amount = (
                    (Number(queryTypeIncident.percentage) *
                        salaryBasic.salary) /
                    100
                ).toFixed(2);
                optionalData.push({
                    key: SystemConfigKey.BASIC_SALARY,
                    value: salaryBasic.salary,
                });
            }

            const incident = this.incidentRepository.create({
                ...createIncidentDto,
                description: createIncidentDto.description ?? '',
                supervisorObservations:
                    createIncidentDto.supervisorObservations ?? '',
                images: createIncidentDto.images ?? [],
                optionalData,
                ...(fractionId && { fraction: { id: fractionId } }),
                amount: +amount,
                register,
                nroTicket: createIncidentDto.nroTicket?.trim() || null,
                emailClient: createIncidentDto.emailClient || antEmailClient,
                fullNameClient:
                    createIncidentDto.fullNameClient || antFullNameClient,
                identityCard: createIncidentDto.identityCard || antIdentityCard,
                code: createIncidentDto.code ?? '',
            });

            const savedIncident = await this.incidentRepository.save(incident);

            this.loggerService.saveIncidentLogger({
                id: savedIncident.id,
                userId,
                typeOperation: TypeOperation.CREATE,
                incident: savedIncident,
            });

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

                await this._saveSatus(
                    queryFraction,
                    StatusFraction.SANCTIONED,
                    StatusMoment.NOTIFIED,
                );
                await this._notifyChageStatus(
                    queryFraction.userId,
                    StatusFraction.SANCTIONED,
                    fractionId,
                );

                await this.slotRepository.update(queryFraction.slot.id, {
                    status: StatusSlot.SANCTIONED,
                });
            }

            return { incident: savedIncident, errorCode: ErrorCode.NONE };
        } catch (error) {
            handleDbExceptions(error, this.logger);
        }
    }

    /**
     * Resolves the incident registration datetime from the client payload.
     *
     * The supplied value is used only when it is present and matches the expected
     * `YYYY-MM-DD HH:MM:SS` format; when omitted or malformed, the server's local
     * time is used as a fallback.
     *
     * @param register Client-supplied registration datetime, if any.
     * @returns The registration datetime as `YYYY-MM-DD HH:MM:SS`.
     */
    private _resolveRegister(register?: string): string {
        const trimmedRegister = register?.trim();
        if (
            !trimmedRegister ||
            !OperatorService.REGISTER_DATETIME_PATTERN.test(trimmedRegister)
        ) {
            return this.commonService.getDate();
        }
        return trimmedRegister;
    }

    /**
     * Resolves the active card range for the given card number and returns the
     * associated physical (Physic) checkbox records.
     *
     * @param card Card number to validate against active ranges and look up.
     * @returns Promise resolving to an error code, the matching physic records,
     *          the current date and whether a valid range was found.
     */
    async findAllPhysic(card: string) {
        try {
            const queryVerifyTiraje = await this.rangeRepository
                .createQueryBuilder('r')
                .select(['r.id', 'r.from', 'r.to'])
                .where(
                    'CAST(:card AS bigint) BETWEEN CAST(r.from AS bigint) AND CAST(r.to AS bigint)',
                    { card },
                )
                .andWhere('r.isActivated = :isActivated', { isActivated: true })
                .andWhere('r.status NOT IN (:...status)', {
                    status: [StatusRange.CLOSED, StatusRange.DEPLETED],
                })
                .andWhere('r.authorizationDate <= :currentDate', {
                    currentDate: new Date(),
                })
                .orderBy('r.id', 'DESC')
                .getOne();

            if (!queryVerifyTiraje) {
                return { errorCode: ErrorCode.NONE, physic: [], range: false };
            }

            const physicResult = await this.physicRepository
                .createQueryBuilder('p')
                .select(['p.id', 'p.zoneId', 'p.checkboxes', 'p.timeByBlock'])
                .addSelect(
                    `TO_CHAR(p."registerAt", 'YYYY-MM-DD HH24:MI:SS')`,
                    'p_registerAt',
                )
                .where('p.card = :card', { card })
                .getRawAndEntities();

            const physic = physicResult.entities.map((entity, i) => ({
                ...entity,
                registerAt: physicResult.raw[i]?.p_registerAt ?? null,
            }));

            const currentDate = new Date();

            return {
                errorCode: ErrorCode.NONE,
                currentDate,
                physic,
                range: true,
            };
        } catch (error) {
            handleDbExceptions(error, this.logger);
        }
    }

    /**
     * Increments parking time for an existing fraction by creating a new fraction
     * that continues the previous one, updating statuses, notifying the owner and
     * persisting the corresponding physic record within a transaction.
     *
     * @param idDevice Identifier of the device that originated the request.
     * @param incrementOperatorDto Payload with the fraction, user and checkbox data.
     * @returns Promise resolving to an error code and, on success, the current
     *          date and the resulting fraction.
     */
    async incrementTime(
        idDevice: string,
        incrementOperatorDto: IncrementOperatorDto,
    ) {
        const {
            userId,
            transactionId,
            fractionId,
            checkboxes,
            obsolete,
            physicId,
        } = incrementOperatorDto;
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
                'f.typeFraction',
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

            this._saveSatus(
                fractionOld,
                StatusFraction.FINISHED_BY_INCREMENT,
                StatusMoment.NOTIFIED,
            );

            this._saveSatus(
                fraction,
                StatusFraction.INCREMENTED,
                StatusMoment.NOTIFIED,
            );
            this._notifyChageStatus(
                userId,
                StatusFraction.INCREMENTED,
                fraction.id,
            );

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

    /**
     * Registers a new parking session: validates the slot availability and the
     * user's consumed checkboxes, creates the fraction, marks the slot as
     * occupied, notifies the owner and persists the physic record within a
     * transaction.
     *
     * @param createOperatorDto Payload describing the parking session to create.
     * @returns Promise resolving to an error code and, on success, the current
     *          date and the created fraction.
     */
    async parking(createOperatorDto: CreateOperatorDto) {
        const { userId, transactionId, checkboxes, obsolete, physicId } =
            createOperatorDto;
        const register = this.commonService.getDate();

        const slot = await this.slotRepository
            .createQueryBuilder('s')
            .select([
                's.id',
                's.status',
                'block.id',
                'zone.id',
                'block.timePerFraction',
            ])
            .innerJoin('s.block', 'block')
            .innerJoin('s.zone', 'zone')
            .where('s.slot = :slot', { slot: createOperatorDto.slot })
            .getOne();

        this.logger.log(`Slot found: ${slot}`);

        if (!slot) {
            return { errorCode: ErrorCode.NOT_FOUND };
        }

        if (slot.status == StatusSlot.OCCUPIED) {
            return { errorCode: ErrorCode.OCCUPIED };
        }

        const physicTotal = await this.physicRepository
            .createQueryBuilder('p')
            .select('COALESCE(SUM(p.checkboxes), 0)', 'totalCheckbox')
            .where('p.userId = :userId', { userId })
            .andWhere('p.card = :card', { card: createOperatorDto.card })
            .getRawOne();

        const totalCheckbox = Number(physicTotal?.totalCheckbox ?? 0);

        this.logger.log(
            `Total checkboxes consumed by user ${userId} with card ${createOperatorDto.card}: ${totalCheckbox}`,
        );

        if (createOperatorDto.initialRow <= totalCheckbox) {
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

            // Saved using the server's local time (Ecuador). The pg driver
            // serializes the Date using local components (getHours, etc.) and
            // inserts them as-is into the timestamp column (without TZ), so no
            // UTC conversion is applied.
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
                registerAt: fromTime,
            });

            await queryRunner.manager.save(fraction);

            slot.status = StatusSlot.OCCUPIED;
            await queryRunner.manager.save(slot);

            await queryRunner.commitTransaction();

            this._notifyChageStatus(userId, StatusFraction.ACTIVE, fraction.id);
            this._saveSatus(
                fraction,
                StatusFraction.ACTIVE,
                StatusMoment.NOTIFIED,
            );

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

    /**
     * Returns the active, non-finalized blocks currently assigned to the operator
     * within the valid date range.
     *
     * @param userId Identifier of the operator whose blocks are requested.
     * @returns Promise resolving to an error code, the current date and the list
     *          of assigned blocks.
     */
    async findAllBlocks(userId: number) {
        try {
            const currentDate = new Date();

            const blocks = await this.blockOperatorRepository
                .createQueryBuilder('bo')
                .select([
                    'bo.id',
                    'bo.from',
                    'bo.to',
                    'bo.isInitialized',
                    'bo.isFinalized',
                    'block.id',
                    'block.name',
                    'block.neighborhood',
                    'block.mainStreet',
                    'block.sideStreet',
                    'zone.id',
                    'zone.name',
                ])
                .innerJoin('bo.block', 'block')
                .innerJoin('block.zone', 'zone')
                .where('bo.userId = :userId', { userId })
                .andWhere('bo.isActivated = :isActivated', { isActivated: 1 })
                .andWhere('bo.from <= :currentDate', { currentDate })
                .andWhere('bo.to >= :currentDate', { currentDate })
                .andWhere('bo.isFinalized = :isFinalized', { isFinalized: 0 }) // Finalized blocks are not returned
                .getMany();

            return { errorCode: ErrorCode.NONE, currentDate, blocks };
        } catch (error) {
            handleDbExceptions(error, this.logger);
        }
    }

    /**
     * Returns the active slots of a block paired with their latest fraction,
     * combining a paginated slot query and the most recent fraction per slot.
     *
     * @param blockId Identifier of the block whose slots are requested.
     * @param userId Identifier of the operator requesting the data.
     * @param paginationDto Pagination options (offset and limit).
     * @returns Promise resolving to an error code, the current date and the slots
     *          with their associated fraction.
     */
    async findAllFractions(
        blockId: number,
        userId: number,
        paginationDto: PaginationDto,
    ) {
        const { offset, limit } = paginationDto;
        try {
            // Independent queries by blockId, executed in parallel
            const slotQuery = this.slotRepository
                .createQueryBuilder('slot')
                .select([
                    'slot.id',
                    'slot.slot',
                    'slot.status',
                    'block.id',
                    'block.name',
                    'block.neighborhood',
                    'block.mainStreet',
                    'block.sideStreet',
                    'block.timePerFraction',
                ])
                .innerJoin('slot.block', 'block')
                .innerJoin('block.zone', 'zone')
                .where('slot.blockId = :blockId', { blockId })
                .andWhere('slot.isActivated = :isActivated', {
                    isActivated: true,
                })
                .andWhere('block.isActivated = :isActivated', {
                    isActivated: true,
                })
                .andWhere('zone.isActivated = :isActivated', {
                    isActivated: true,
                })
                .andWhere('slot.lt != :zero AND slot.lg != :zero', { zero: 0 })
                .andWhere('block.lt != :zero AND block.lg != :zero', {
                    zero: 0,
                })
                .andWhere('zone.lt != :zero AND zone.lg != :zero', { zero: 0 });

            const fractionQuery = this.fractionRepository
                .createQueryBuilder('f')
                .select([
                    'f.id',
                    'f.typeFraction',
                    'f.userId',
                    'f.time',
                    'f.card',
                    'f.plate',
                    'f.tint',
                    'f.alias',
                    'f.image',
                    'f.transactionId',
                    'f.optionalData',
                    'status',
                    'fSlot.id',
                ])
                .addSelect(
                    `TO_CHAR(f."registerAt", 'YYYY-MM-DD"T"HH24:MI:SS.MS')`,
                    'f_registerAt',
                )
                .addSelect(
                    `TO_CHAR(f."departureDate", 'YYYY-MM-DD"T"HH24:MI:SS.MS')`,
                    'f_departureDate',
                )
                .innerJoin('f.status', 'status')
                .innerJoin('f.slot', 'fSlot')
                .where('f.blockId = :blockId', { blockId })
                .andWhere('fSlot.lt != :zero AND fSlot.lg != :zero', {
                    zero: 0,
                })
                .innerJoin(
                    (qb) =>
                        qb
                            .subQuery()
                            .select('MAX(sub.id)', 'maxid')
                            .from(Fraction, 'sub')
                            .where('sub.blockId = :blockId', { blockId })
                            .groupBy('sub.slot'),
                    'latest',
                    'latest.maxid = f.id',
                );

            // Parallel execution — neither awaits the other
            const [slots, fractionResult] = await Promise.all([
                slotQuery.take(limit).skip(offset).getMany(),
                fractionQuery.getRawAndEntities(),
            ]);

            const fractions = fractionResult.entities.map((entity, i) => ({
                ...entity,
                registerAt: fractionResult.raw[i]?.f_registerAt ?? null,
                departureDate: fractionResult.raw[i]?.f_departureDate ?? null,
            }));

            // Merge with Map O(n)
            const fractionBySlotId = new Map(
                fractions.map((f) => [f.slot.id, f]),
            );

            const slotsWithFractions = slots.map((slot) => ({
                ...slot,
                fraction: fractionBySlotId.get(slot.id) ?? null,
            }));

            const currentDate = new Date();
            return {
                errorCode: ErrorCode.NONE,
                currentDate,
                fractions: slotsWithFractions,
            };
        } catch (error) {
            handleDbExceptions(error, this.logger);
        }
    }

    /**
     * Searches fractions by plate or card, excluding those finished by increment.
     *
     * @param criteria Plate or card value used to match fractions.
     * @returns Promise resolving to an error code, the current date and the
     *          matching fractions.
     */
    async findAllFractionsBycriteria(criteria: string) {
        try {
            const fractions = await this.fractionRepository
                .createQueryBuilder('f')
                .select(this.columsFraction)
                .innerJoin('f.status', 'status')
                .innerJoin('f.block', 'block')
                .innerJoin('f.slot', 'slot')
                .where('(f.plate = :plate OR f.card = :card)', {
                    plate: criteria,
                    card: criteria,
                })
                .andWhere('f.status != :statusByOperator', {
                    statusByOperator: StatusFraction.FINISHED_BY_INCREMENT,
                })
                .getMany();

            const currentDate = new Date();

            return { errorCode: ErrorCode.NONE, currentDate, fractions };
        } catch (error) {
            handleDbExceptions(error, this.logger);
        }
    }

    /**
     * Returns a single fraction by its identifier together with the current date.
     *
     * @param fractionId Identifier of the fraction to retrieve.
     * @returns Promise resolving to an error code, the current date and the
     *          fraction.
     */
    async findFractionById(fractionId: number) {
        const currentDate = new Date();
        const f = await this._findFractionById(fractionId);
        return { errorCode: ErrorCode.NONE, currentDate, fraction: f };
    }

    /**
     * Returns the fixed default duration used for virtual parking fractions.
     *
     * @returns Object with an error code, the current date and the virtual time
     *          (`00:05:00`).
     */
    timeVirtual() {
        const currentDate = new Date();
        return { errorCode: ErrorCode.NONE, currentDate, time: '00:05:00' };
    }

    /**
     * Generates the next virtual card number, continuing the sequence from the
     * most recent virtual fraction or starting a new one when none exists.
     *
     * @returns Promise resolving to the next virtual card number string in the
     *          format `YYMMDD-NNNN`.
     */
    private async _findNextIdVirtual() {
        const currentDate = new Date();

        const fraction = await this.fractionRepository
            .createQueryBuilder('f')
            .select(['f.id', 'f.card'])
            .where('f.typeFraction = :typeFraction', {
                typeFraction: TypeFraction.VIRTUAL.toString(),
            }) // Convert to string
            .orderBy('f.id', 'DESC')
            .limit(1)
            .getOne();
        if (!fraction) {
            const uniqueNumber = this._generateFirstUniqueNumber();
            return uniqueNumber;
        }
        try {
            const virtual = fraction.card;
            const parts = virtual.split('-');
            const lastCounter = parts[parts.length - 1];
            const nextCounter = String(Number(lastCounter) + 1).padStart(
                4,
                '0',
            );
            const formattedDate = currentDate
                .toISOString()
                .slice(2, 10)
                .replace(/-/g, '');
            const uniqueNumber = `${formattedDate}-${nextCounter}`;
            return uniqueNumber;
        } catch (error) {
            return error;
        }
    }

    /**
     * Builds the first virtual card number when no prior virtual fraction exists.
     *
     * @returns Promise resolving to the initial virtual card number string in the
     *          format `YYMMDD-0001`.
     */
    private async _generateFirstUniqueNumber() {
        // Get the current date and format it as "YEAR-MONTH-DAY"
        const currentDate = new Date()
            .toISOString()
            .slice(2, 10)
            .replace(/-/g, '');
        // Get the counter with three digits and add leading zeros if necessary
        const formattedCounter = String(1).padStart(4, '0');
        // Return the unique number in the format "YEAR-MONTH-DAY-COUNTER"
        return `${currentDate}-${formattedCounter}`;
    }

    /**
     * Loads a fraction by its identifier with its status, block and slot joined.
     *
     * @param fractionId Identifier of the fraction to retrieve.
     * @returns Promise resolving to the fraction entity, or `null` when not found.
     */
    private async _findFractionById(fractionId: number) {
        const fraction = await this.fractionRepository
            .createQueryBuilder('f')
            .select(this.columsFraction)
            .where('f.id = :fractionId', { fractionId })
            .innerJoin('f.status', 'status')
            .innerJoin('f.block', 'block')
            .innerJoin('f.slot', 'slot')
            .getOne();
        return fraction;
    }

    /**
     * Finishes an active fraction by the operator: frees its slot, records the
     * finished status and notifies the fraction owner.
     *
     * @param userId Identifier of the operator finishing the fraction.
     * @param fractionId Identifier of the fraction to finish.
     * @returns Promise resolving to an error code (`NOT_FOUND` when the fraction
     *          does not exist or is already finished, otherwise `NONE`).
     */
    async finished(userId: number, fractionId: number) {
        const fraction = await this.fractionRepository
            .createQueryBuilder('f')
            .select(['f.id', 'f.userId', 'status.id', 's.id'])
            .innerJoin('f.status', 'status')
            .innerJoin('f.slot', 's')
            .where('f.id = :fractionId', { fractionId })
            .andWhere('f.status < :status', { status: StatusFraction.FINISHED })
            .getOne();

        if (!fraction) {
            return { errorCode: ErrorCode.NOT_FOUND };
        }

        await this.slotRepository.save({
            id: fraction.slot.id,
            status: StatusSlot.AVAILABLE,
        });

        await this._saveSatus(
            fraction,
            StatusFraction.FINISHED_BY_OPERATOR,
            StatusMoment.NOTIFIED,
        );
        // Notify the fraction owner (could be the controller or the client)
        await this._notifyChageStatus(
            fraction.userId,
            StatusFraction.FINISHED_BY_OPERATOR,
            fraction.id,
        );

        return { errorCode: ErrorCode.NONE };
    }

    /**
     * Creates a new `Physic` entity from a fraction, sharing the common field
     * mapping between the obsolete-checkbox record and the regular record so the
     * `create({ ... })` literal is not duplicated.
     *
     * @param fraction Source fraction providing user, card, zone, time and block.
     * @param checkboxes Number of checkboxes to record for this physic.
     * @param registerAt Timestamp the physic should be registered with.
     * @returns A transient (unsaved) `Physic` entity.
     */
    private _buildPhysicEntity(
        fraction: Fraction,
        checkboxes: number,
        registerAt: Date,
    ): Physic {
        return this.physicRepository.create({
            userId: fraction.userId,
            card: fraction.card,
            zoneId: fraction.zone.id,
            time: fraction.time,
            checkboxes,
            timeByBlock: fraction.timeByBlock,
            registerAt,
            optionalData: this._buildPhysicOptionalData(fraction),
        });
    }

    /**
     * Builds the optionalData entries persisted on a Physic record.
     *
     * @param fraction Fraction holding the vehicle plate for this session.
     * @returns Key-value pairs with the vehicle `plate` and the server-side
     *          registration date (`register`) formatted as `YYYY-MM-DD`.
     */
    private _buildPhysicOptionalData(
        fraction: Fraction,
    ): OptionalDataInterface[] {
        const now = new Date();
        const register = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

        return [
            new OptionalDataInterface({
                key: 'plate',
                value: fraction.plate ?? '',
            }),
            new OptionalDataInterface({ key: 'register', value: register }),
        ];
    }

    /**
     * Persists the physic (checkbox) records for a fraction: optionally a
     * back-dated record for obsolete checkboxes, and either an update of an
     * existing physic or the creation of a new one.
     *
     * @param fraction Fraction providing the user, card, zone and time data.
     * @param obsolete Number of obsolete checkboxes to record on the prior day.
     * @param physicId Identifier of an existing physic to update, or `0` to create.
     */
    private async _savePhysic(
        fraction: Fraction,
        obsolete: number,
        physicId: number,
    ) {
        if (obsolete > 0) {
            const registerAtMinusOneDay = new Date(fraction.registerAt);
            registerAtMinusOneDay.setDate(registerAtMinusOneDay.getDate() - 1);

            const physic = this._buildPhysicEntity(
                fraction,
                obsolete,
                registerAtMinusOneDay,
            );
            await this.physicRepository.save(physic);
        }

        if (physicId > 0) {
            await this.physicRepository.update(
                { id: physicId },
                {
                    checkboxes: fraction.checkboxes,
                    timeByBlock: fraction.timeByBlock,
                    zoneId: fraction.zone.id,
                    optionalData: this._buildPhysicOptionalData(fraction),
                },
            );
        } else {
            const physic = this._buildPhysicEntity(
                fraction,
                fraction.checkboxes,
                fraction.registerAt,
            );
            await this.physicRepository.save(physic);
        }
    }

    /**
     * Records (or updates) a fraction status-history entry and updates the
     * fraction's current status, resolving the final status when finishing by
     * operator depending on the prior status.
     *
     * @param fraction Fraction whose status is being recorded.
     * @param statusId Target status identifier to apply.
     * @param moment Moment value associated with the status entry.
     */
    private async _saveSatus(
        fraction: Fraction,
        statusId: number,
        moment: number,
    ) {
        // Check if a record already exists for the given status and fractionId
        const existingFractionStatus =
            await this.fractionSatusRepository.findOne({
                where: {
                    fraction: { id: fraction.id },
                    status: { id: statusId },
                },
            });

        if (existingFractionStatus) {
            existingFractionStatus.moment = moment;
            await this.fractionSatusRepository.save(existingFractionStatus);
        } else {
            // Always save the fraction status
            const fractionSatus = this.fractionSatusRepository.create({
                fraction,
                moment,
                status: { id: statusId },
            });
            await this.fractionSatusRepository.save(fractionSatus);
        }
        if (statusId === StatusFraction.FINISHED_BY_OPERATOR) {
            if (
                fraction.status.id === StatusFraction.EXCEEDED_TIME ||
                fraction.status.id === StatusFraction.SANCTIONED
            ) {
                await this.fractionRepository.save({
                    ...fraction,
                    status: { id: StatusFraction.FINISHED_BY_CONTROLLER },
                });
            } else {
                await this.fractionRepository.save({
                    ...fraction,
                    status: { id: StatusFraction.FINISHED_BY_OPERATOR },
                });
            }
        } else {
            await this.fractionRepository.save({
                ...fraction,
                status: { id: statusId },
            });
        }
    }

    /**
     * Sends a status-change notification for a fraction to its owner.
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
     * Returns the slot pricing context for an operator: the slot with its block,
     * zone and schedule data plus the operator's available checkbox balance, and
     * whether the slot is available or occupied.
     *
     * @param userId Identifier of the operator requesting the slot price.
     * @param searchSlot Slot code to look up.
     * @returns Promise resolving to an error code (`NOT_FOUND`, `NONE` when
     *          available or `OCCUPIED`), the slot and the available checkboxes.
     */
    async getPriceSlot(userId: number, searchSlot: string) {
        try {
            const [slot, checkboxes] = await Promise.all([
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
                        'blockOperator.id',
                        'blockOperator.from',
                        'blockOperator.to',
                    ])
                    .innerJoin('s.block', 'block')
                    .innerJoin('s.zone', 'zone')
                    .innerJoin('block.blocksOperator', 'blockOperator')
                    .leftJoin('block.schedules', 'schedules')
                    .where('s.slot = :slot', { slot: searchSlot })
                    .andWhere('blockOperator.userId = :userId', { userId })
                    .andWhere('blockOperator.isActivated = :isActivated', {
                        isActivated: true,
                    })
                    .andWhere(
                        ':date BETWEEN blockOperator.from AND blockOperator.to',
                        {
                            date: new Date(),
                        },
                    )
                    .orderBy('schedules.dayOfWeekInit', 'ASC') // 👈 orden principal
                    .getOne(),

                this.checkboxUserRepository
                    .createQueryBuilder('cb')
                    .select(['cb.checkboxes'])
                    .where('cb.userId = :userId', { userId })
                    .getOne(),
            ]);

            if (!slot) return { errorCode: ErrorCode.NOT_FOUND };

            if (slot.status === StatusSlot.AVAILABLE) {
                return {
                    errorCode: ErrorCode.NONE,
                    slot,
                    checkboxes: checkboxes ? checkboxes.checkboxes : 0,
                };
            }
            return {
                errorCode: ErrorCode.OCCUPIED,
                slot,
                checkboxes: checkboxes ? checkboxes.checkboxes : 0,
            };
        } catch (error) {
            handleDbExceptions(error, this.logger);
        }
    }

    /**
     * Returns the pending fines for an identity card, synchronizing each incident
     * with GIM obligations (updating bond, obligation number, status and amount)
     * and re-querying so only incidents still pending are returned.
     *
     * @param userId Identifier of the operator performing the lookup.
     * @param idDevice Identifier of the device that originated the request.
     * @param identityCard Identity card number whose fines are requested.
     * @param _getIncidentDto Additional incident query options (reserved).
     * @returns Promise resolving to an error code, the current date and the
     *          remaining pending incidents.
     */
    async findSanctionByIdentityCard(
        userId: number,
        idDevice: string,
        identityCard: string,
        _getIncidentDto: GetIncidentDto,
    ) {
        try {
            const tableName = 'public.incident';
            const currentDate = new Date();

            const params: any[] = [];
            let paramIndex = 1;

            const buildWhere = () => {
                // Only notifications that are fines
                let where = `WHERE i."incidentCategory" = $${paramIndex++}`;
                params.push(IncidentCategory.NOTIFICATION);

                // Not paid at the municipality
                where += ` AND i."statusIncident" IN ($${paramIndex++}, $${paramIndex++}, $${paramIndex++})`;
                params.push(
                    IncidentStatus.ENTERED,
                    IncidentStatus.APPROVED,
                    IncidentStatus.SUPPLIED,
                );

                // Not paid internally
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
        it.name AS reason, it."accountingAccountCode" AS "accountingAccountCode",
        i.amount AS amount, i."bondId" AS "bondId",
        i."createdAt" AS "createdAt", i."statusIncident" AS "status", i."register" AS "register",
        i."nroTicket" AS "nroTicket", i."incidentTypeId" AS "incidentTypeId",
        i."vehicleType" AS "vehicleType",
        i."address" AS "address", i."optionalData" AS "optionalData",
        i."controllerId" AS "controllerId", i."onResponseExternal" AS "onResponseExternal",
        i."identityCard" AS "identityCard", i."commission" AS "commission", i."reference" AS "reference"
      FROM ${table} i
      INNER JOIN public."incidentType" it ON i."incidentTypeId" = it.id
    `;

            const query = `${baseSelect(tableName)} ${buildWhere()}`;

            const incidents: Incident[] = await this.incidentRepository.query(
                query,
                params,
            );

            if (incidents.length === 0)
                return {
                    errorCode: ErrorCode.NOT_FOUND,
                    currentDate,
                    incidents,
                };

            for (const incident of incidents) {
                // Check if the debt was already emitted in GIM and update the status
                const findObligation =
                    await this.gimService.findObligationsByCitation(
                        incident.nroTicket,
                        incident.identityCard,
                    );
                if (findObligation.errorCode === ErrorCode.NONE) {
                    const validateStatus =
                        await this.gimService._validateStatusSistemWithGim(
                            findObligation.data.obligations,
                        );
                    if (validateStatus.errorCode === ErrorCode.NONE) {
                        const onResponseExternal =
                            this._formatOnExternalResponse(
                                incident.onResponseExternal,
                                findObligation.data,
                            );
                        await this.incidentRepository.update(incident.id, {
                            bondId: +findObligation.data.obligations[0]
                                .obligationId,
                            nroObligation:
                                findObligation.data.obligations[0].obligationNumber.toString(),
                            statusIncident: validateStatus.statusIncident,
                            amount: findObligation.data.obligations[0].total,
                            onResponseExternal,
                        });

                        await this._auditIncident(
                            incident.id,
                            userId,
                            TypeOperation.UPDATE,
                        );
                    }
                    continue;
                }
            }

            // Re-query to return only those still in pending states
            const updatedIncidents = await this.incidentRepository.query(
                query,
                params,
            );

            if (updatedIncidents.length === 0)
                return {
                    errorCode: ErrorCode.NOT_FOUND,
                    currentDate,
                    incidents: updatedIncidents,
                };

            return {
                errorCode: ErrorCode.NONE,
                currentDate,
                incidents: updatedIncidents,
            };
        } catch (error) {
            this.logger.error(`GIM emit incident ${error?.message}`);
            handleDbExceptions(error, this.logger);
        }
    }

    /**
     * Appends a new external response payload to the existing external response
     * history, returning a new array without mutating the original.
     *
     * @param onResponseExternal Existing external response entries (may be null).
     * @param onResponseExternalData New external response payload to append.
     * @returns Array containing the previous entries plus the new payload when set.
     */
    private _formatOnExternalResponse(
        onResponseExternal: any[],
        onResponseExternalData: object,
    ): any[] {
        const result = [...(onResponseExternal ?? [])];
        if (onResponseExternalData) result.push(onResponseExternalData);
        return result;
    }
}
