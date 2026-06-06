import { Inject, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { BlockOperator } from 'src/admin/block_operator/entities/block_operator.entity';
import { Catalog } from 'src/admin/catalog/entities/catalog.entity';
import { Checkbox } from 'src/admin/checkbox/entities/checkbox.entity';
import { Fraction } from 'src/admin/fraction/entities/fraction.entity';
import { GimService } from 'src/api/gim/gim.service';
import { CommonAuthService } from 'src/common/common.auth.service';
import { CommonCacheService } from 'src/common/common.cache.service';
import { CommonService } from 'src/common/common.service';
import { CreateClientGimDto } from 'src/common/dto/create-client-gim.dto';
import { CreateNotificationDto } from 'src/common/dto/create-notification.dto';
import { EmissionCreditCardDto } from 'src/common/dto/emission-credit-card.dto';
import { RegisterDepositGimDto } from 'src/common/dto/register-deposit-gim.dto';
import { ErrorCode } from 'src/common/glob/error';
import { StatusFraction } from 'src/common/glob/status/status_fraction';
import { StatusPayment } from 'src/common/glob/status/status_payment';
import { CatalogType } from 'src/common/glob/type/type_catalog';
import { IncidentStatus } from 'src/common/glob/type/type_incident';
import { TypeNotification } from 'src/common/glob/type/type_notification';
import { DataSource, IsNull, Repository } from 'typeorm';

/**
 * Background-job service that periodically reconciles state across the
 * parking domain: scans soon-to-expire fractions to notify users,
 * validates pending checkboxes against payment providers and emits
 * remediating actions (refund, finalize, escalate).
 *
 * Triggered by the schedule registered in CheckModule.
 */
@Injectable()
export class CheckService {
  /**
   *
   * @param fractionRepository
   * @param checkboxRepository
   * @param blockOperatorRepository
   * @param catalogRepository
   * @param dataSource
   * @param commonService
   * @param commonAuthService
   * @param gimService
   * @param commonCacheService
   */
  constructor(
    @InjectRepository(Fraction)
    private readonly fractionRepository: Repository<Fraction>,

    @InjectRepository(Checkbox)
    private readonly checkboxRepository: Repository<Checkbox>,

    @InjectRepository(BlockOperator)
    private readonly blockOperatorRepository: Repository<BlockOperator>,

    @InjectRepository(Catalog)
    private readonly catalogRepository: Repository<Catalog>,

    private readonly dataSource: DataSource,

    @Inject(CommonService)
    private readonly commonService: CommonService,

    @Inject(CommonAuthService)
    private readonly commonAuthService: CommonAuthService,

    @Inject(GimService)
    private readonly gimService: GimService,

    @Inject(CommonCacheService)
    private readonly commonCacheService: CommonCacheService,
  ) {}

  private readonly logger = new Logger('CheckService');
  private readonly intervalTransferCheck: number =
    parseInt(process.env.INTERVAL_TRANSFER_CHECK_MS || '') || 1000 * 60 * 1; //por defecto un minuto

  private readonly intervalValidateCheckbox: number =
    parseInt(process.env.INTERVAL_VALIDATE_CHECKBOX_MS || '') || 1000 * 60 * 2; //por defecto 3 minutos

  private readonly timeCacheBlockOperator =
    60 * (Number(process.env.TIME_CACHE_BLOCK_OPERATOR) || 5);

  private readonly catalogs: Map<string, any> = new Map();

  /**
   *
   */
  async onModuleInit() {
    this.logger.verbose('start call onModuleInit');

    try {
      const all = await this.catalogRepository.find();
      for (const catalog of all) {
        this.catalogs.set(catalog.name, catalog.data);
      }
      this.logger.log(`Catalogs loaded in memory: ${this.catalogs.size}`);
    } catch (error) {
      this.logger.error(
        `onModuleInit: error loading catalogs - ${error.message}`,
      );
    }

    // Watch fractions that are about to expire and notify the user
    setInterval(() => this._transferCheck(), this.intervalTransferCheck);

    // Watch checkboxes that are about to expire — paid internally but not yet at the municipality
    setInterval(
      () => this._validateCheckboxToEmitAndPay(),
      this.intervalValidateCheckbox,
    );
  }

  /**
   *
   */
  private _buildRubroOptionalData(): {
    entryCode: string;
    description: string;
    optionalData: { key: string; value: string | object }[];
  } {
    const rubroCatalog = this.catalogs.get(CatalogType.TypeRubroCard);
    let entryCode: string;
    let description: string;
    if (Array.isArray(rubroCatalog) && rubroCatalog.length > 0) {
      const first = rubroCatalog[0];
      entryCode = String(first.key);
      description = first.valor;
    } else {
      entryCode = process.env.CODE_ENTRY_EMISION_CARD || '573';
      description =
        process.env.CODE_ENTRY_EMISION_CARD_DESCRIPTION ||
        'Compra de tarjeta simert | Loja';
    }
    return {
      entryCode,
      description,
      optionalData: [
        // GIM revenue code (entryCode) used when issuing the credit title
        { key: 'rubro', value: entryCode },
        // Human-readable description associated with the revenue code
        { key: 'description', value: description },
      ],
    };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Watch parked fractions and advance them through the expiration lifecycle
  // ─────────────────────────────────────────────────────────────────────────
  /**
   * Periodic job that moves active fractions through their expiration states
   * driven by the paid time and the block's configured grace period:
   *
   * - When the paid time is over (`now > departureDate`) an ACTIVE/INCREMENTED
   *   fraction enters the grace window and becomes `NEXT_TO_EXCEEDED_TIME` (300).
   * - When the grace window is over (`now > departureDate + block.timeGrace`) a
   *   fraction already in `NEXT_TO_EXCEEDED_TIME` becomes `EXCEEDED_TIME` (301).
   *
   * The grace value is read live from `block.timeGrace` through an indexed PK
   * join, so each fraction always reflects its block's current grace setting.
   * Every transition notifies the owning user and the block operators.
   */
  private async _transferCheck(): Promise<void> {
    try {
      // The grace span is the block's "time" value turned into an interval
      // (time - time = interval), added to departureDate to get the grace deadline.
      const fractions = await this.dataSource.query(`
            SELECT f.id, f."userId", f."statusId", f."blockId"
            FROM fraction f
            JOIN block b ON b.id = f."blockId"
            WHERE f."statusId" != ${StatusFraction.FINISHED_BY_OPERATOR}
              AND (
                (
                  f."statusId" < ${StatusFraction.NEXT_TO_EXCEEDED_TIME}
                  AND (NOW() AT TIME ZONE 'America/Guayaquil') > f."departureDate"
                )
                OR (
                  f."statusId" = ${StatusFraction.NEXT_TO_EXCEEDED_TIME}
                  AND (NOW() AT TIME ZONE 'America/Guayaquil') > f."departureDate" + (b."timeGrace" - TIME '00:00:00')
                )
              )
          `);

      for (const fraction of fractions) {
        const { id, userId, statusId, blockId } = fraction;
        if (statusId < StatusFraction.NEXT_TO_EXCEEDED_TIME) {
          // Paid time is over: enter the grace window → NEXT_TO_EXCEEDED_TIME (300)
          await this.fractionRepository
            .createQueryBuilder()
            .update()
            .set({ status: { id: StatusFraction.NEXT_TO_EXCEEDED_TIME } })
            .whereInIds(id)
            .execute();
          this._notifyChangeStatus(
            userId,
            StatusFraction.NEXT_TO_EXCEEDED_TIME,
            id,
          );
          this._notifyBlockOperators(
            blockId,
            StatusFraction.NEXT_TO_EXCEEDED_TIME,
            id,
          );
        } else {
          // Grace window elapsed (departureDate + block.timeGrace) → EXCEEDED_TIME (301)
          await this.fractionRepository
            .createQueryBuilder()
            .update()
            .set({ status: { id: StatusFraction.EXCEEDED_TIME } })
            .whereInIds(id)
            .execute();
          this._notifyChangeStatus(userId, StatusFraction.EXCEEDED_TIME, id);
          this._notifyBlockOperators(blockId, StatusFraction.EXCEEDED_TIME, id);
        }
      }
    } catch (err) {
      this.logger.error(`Call _transferCheck err: ${err}`);
    }
  }

  /**
   *
   * @param blockId
   * @param statusFraction
   * @param fractionId
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
      blockOperators = await this.blockOperatorRepository
        .createQueryBuilder('bo')
        .select(['bo.id', 'bo.userId'])
        .where('bo.blockId = :blockId', { blockId })
        .andWhere(
          `DATE(bo.from) <= DATE(NOW() AT TIME ZONE 'America/Guayaquil') AND DATE(bo.to) >= DATE(NOW() AT TIME ZONE 'America/Guayaquil')`,
        )
        .getMany();

      await this.commonCacheService.set(cacheKey, blockOperators, secondsCache);
    }

    for (const operator of blockOperators) {
      this._notifyChangeStatus(
        operator.userId,
        statusFraction,
        fractionId.toString(),
      );
    }
  }

  /**
   *
   * @param userId
   * @param status
   * @param ids
   */
  private async _notifyChangeStatus(
    userId: number,
    status: number,
    ids: string,
  ) {
    const notification = new CreateNotificationDto({
      userId,
      notification: {
        type: TypeNotification.CHANGE_STATUS_SIMERT,
        data: { fractionId: ids, status },
      },
    });
    this.commonService.notify(notification);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Job every 10 min: completes the GIM cycle for checkboxes with PAID payment.
  //
  // statusIncident null | ENTERED → emit credit title + register deposit
  // statusIncident SUPPLIED       → only register deposit
  // any other state               → mark statusPayment = ERROR
  //
  // `onResponseExternal` is always persisted at the end of each checkbox.
  // ─────────────────────────────────────────────────────────────────────────
  /**
   *
   */
  private async _validateCheckboxToEmitAndPay() {
    // Validate that the cashier window is open in GIM
    const openTill = await this.gimService.validateOpenTill();
    if (openTill.errorCode !== ErrorCode.NONE) return openTill;

    try {
      // Load every paid checkbox whose incident status is still pending
      const checkboxes: Checkbox[] = await this.checkboxRepository.find({
        where: [
          { statusPayment: StatusPayment.PAID, statusIncident: IsNull() },
          {
            statusPayment: StatusPayment.PAID,
            statusIncident: IncidentStatus.ENTERED,
          },
          {
            statusPayment: StatusPayment.PAID,
            statusIncident: IncidentStatus.APPROVED,
          },
          {
            statusPayment: StatusPayment.PAID,
            statusIncident: IncidentStatus.SUPPLIED,
          },
        ],
        order: { register: 'ASC' },
      });

      if (!checkboxes.length) return;

      for (const checkbox of checkboxes) {
        try {
          checkbox.onResponseExternal = checkbox.onResponseExternal ?? [];
          const { statusIncident } = checkbox;

          switch (statusIncident) {
            // Title not yet issued and deposit not yet registered
            case null:
            case IncidentStatus.ENTERED:
            case IncidentStatus.APPROVED: {
              // Issue the credit title
              const emision = await this._emitCreditCard(checkbox);

              // Persist the issuance response
              this.addResponse(
                checkbox.onResponseExternal,
                emision.dataEmision,
              );

              if (emision.errorCode !== ErrorCode.NONE) {
                this.logger.warn(
                  `[Emisión fallida] checkbox ${checkbox.id}: ${emision.message}`,
                );
                await this.checkboxRepository.save(checkbox);
                continue;
              }

              checkbox.statusIncident = IncidentStatus.SUPPLIED;

              // Register the deposit
              const deposit = await this._registerDeposit(checkbox);
              this._applyDepositOutcome(checkbox, deposit);
              break;
            }

            case IncidentStatus.SUPPLIED: {
              // Title already issued → only register the deposit
              const depositSupplied = await this._registerDeposit(checkbox);
              this._applyDepositOutcome(checkbox, depositSupplied);
              break;
            }

            default:
              // Unexpected state → flag as error
              this.logger.warn(
                `[Estado inválido] checkbox ${checkbox.id} statusIncident=${statusIncident}`,
              );
              // checkbox.statusPayment = StatusPayment.ERROR;
              break;
          }

          await this.checkboxRepository.save(checkbox);
        } catch (err) {
          this.logger.error(
            `[Job GIM] Error checkbox ${checkbox.id}: ${err.message}`,
          );
        }
      }
    } catch (error) {
      this.logger.error(
        `Call _validateCheckboxToEmitAndPay err: ${error.message}`,
      );
    }
  }

  /**
   * Applies the outcome of a GIM deposit to a checkbox: stores the provider
   * response in `onResponseExternal` and, on success, advances the incident
   * status to PAYED; on failure it logs a warning. Shared by the
   * "emit + deposit" and "deposit only" branches of
   * `_validateCheckboxToEmitAndPay`.
   *
   * @param checkbox Checkbox being settled (mutated in place).
   * @param deposit Result returned by `_registerDeposit`.
   * @param deposit.errorCode
   * @param deposit.dataDeposit
   * @param deposit.message
   */
  private _applyDepositOutcome(
    checkbox: Checkbox,
    deposit: { errorCode: number; dataDeposit: any; message?: string },
  ): void {
    // Persist the deposit response
    this.addResponse(checkbox.onResponseExternal, deposit.dataDeposit);

    if (deposit.errorCode === ErrorCode.NONE) {
      checkbox.statusIncident = IncidentStatus.PAYED;
    } else {
      this.logger.warn(
        `[Depósito fallido] checkbox ${checkbox.id}: ${deposit.message}`,
      );
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Resolve the client's residentId in GIM and issue the credit title
  // ─────────────────────────────────────────────────────────────────────────
  /**
   *
   * @param checkbox
   */
  private async _emitCreditCard(checkbox: Checkbox) {
    const { userId, identityCard, transactionId } = checkbox;
    let residentId: number = null;

    // 1) Look up residentId in our DB
    const user = await this.commonAuthService.filterByIdentityCard(
      userId,
      identityCard,
    );
    if (user.errorCode === ErrorCode.NONE) {
      residentId = user.data?.residentId ?? null;
    }

    // 2) If not in our DB, query GIM
    if (!residentId) {
      const userGim =
        await this.gimService.getUserByIdentityCardGim(identityCard);
      if (userGim.errorCode === ErrorCode.NONE) {
        residentId = userGim.taxpayer?.id ?? null;
      }
    }

    // 3) If GIM does not know the client either, create them there
    if (!residentId) {
      const createClientGimDto: CreateClientGimDto = {
        controllerId: userId,
        identityCard,
        firstName: user.data?.firstName,
        lastName: user.data?.lastName,
        emailClient: user.data?.email,
      };
      const createUserGim =
        await this.gimService.createNewNaturalPersonGim(createClientGimDto);
      if (createUserGim.errorCode === ErrorCode.NONE) {
        residentId = createUserGim.residentDTO?.id ?? null;
        this.commonAuthService.updateResidentId(
          userId,
          identityCard,
          residentId,
        );
      }
    }

    if (!residentId) {
      return {
        errorCode: ErrorCode.NOT_VALID,
        dataEmision: null,
        message: 'No se pudo verificar la información del cliente en el GIM',
      };
    }

    // 4) Issue the credit title
    const { entryCode } = this._buildRubroOptionalData();
    const emisionCreditCard: EmissionCreditCardDto = {
      entryCode,
      residentId,
      description: 'Compra de Tarjeta de parking',
      reference: transactionId,
      quantity: 1,
    };

    const emision =
      await this.gimService.emissionTitleCreditCard(emisionCreditCard);

    if (emision.errorCode !== ErrorCode.NONE) {
      this.logger.error(
        `[_emitCreditCard] Error generando título checkbox ${checkbox.id}: ${emision.data?.message}`,
      );
      return {
        errorCode: ErrorCode.NOT_VALID,
        dataEmision: emision.data,
        message: 'No se pudo generar el título de crédito',
      };
    }

    return {
      errorCode: ErrorCode.NONE,
      dataEmision: emision.data,
      message: 'Emisión correcta',
    };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Register the deposit in GIM using the bondId from the previous issuance
  // ─────────────────────────────────────────────────────────────────────────
  /**
   *
   * @param checkbox
   */
  private async _registerDeposit(checkbox: Checkbox) {
    const { amount, identityCard, transactionId } = checkbox;

    const onResponseExternal = Array.isArray(checkbox.onResponseExternal)
      ? checkbox.onResponseExternal
      : [];
    const bondEntry = onResponseExternal.find(
      (item: any) => item?.bondId != null,
    );

    if (!bondEntry) {
      this.logger.error(
        `No se encontró bondId en onResponseExternal para la transacción ${transactionId}`,
      );
      return {
        errorCode: ErrorCode.NOT_VALID,
        dataDeposit: null,
        message: 'No se encontró bondId para registrar el depósito',
      };
    }

    const registerDepositGimDto: RegisterDepositGimDto = {
      amount,
      identificationNumber: identityCard,
      bondIds: [bondEntry?.bondId],
      paymentDate: new Date().toISOString().split('T')[0],
      transactionId,
    };

    const response = await this.gimService.registerDeposit(
      registerDepositGimDto,
    );

    if (response.errorCode !== ErrorCode.NONE) {
      this.logger.error(
        `[_registerDepositCheck] Error depósito checkbox ${checkbox.id}: ${response.data?.message}`,
      );
      return {
        errorCode: ErrorCode.NOT_VALID,
        dataDeposit: response.data,
        message: 'No se pudo registrar el depósito',
      };
    }

    return {
      errorCode: ErrorCode.NONE,
      dataDeposit: response.data,
      message: 'Depósito correcto',
    };
  }

  /**
   *
   * @param list
   * @param item
   */
  private addResponse(list: any[], item: any) {
    if (!item) return;

    // Replace if an identical response already exists, append otherwise
    const itemKey = JSON.stringify(item);
    const existingIndex = list.findIndex(
      (existing) => JSON.stringify(existing) === itemKey,
    );
    if (existingIndex >= 0) {
      list[existingIndex] = item;
      return;
    }
    if (list.length >= 20) {
      list.pop();
    }
    list.push(item);
  }
}
