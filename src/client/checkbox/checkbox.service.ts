import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Card } from 'src/admin/card/entities/card.entity';
import { Catalog } from 'src/admin/catalog/entities/catalog.entity';
import { Checkbox } from 'src/admin/checkbox/entities/checkbox.entity';
import { CheckboxUser } from 'src/admin/checkbox-user/entities/checkbox-user.entity';
import { GimService } from 'src/api/gim/gim.service';
import { CommonAuthService } from 'src/common/common.auth.service';
import { CommonCheckboxService } from 'src/common/common.checkbox.service';
import { CommonGimService } from 'src/common/common.gim.service';
import { CommonService } from 'src/common/common.service';
import { BillingDataDto } from 'src/common/dto/billing-data.dto';
import { CreateNotificationDto } from 'src/common/dto/create-notification.dto';
import { DebitAmounDto } from 'src/common/dto/debit-amoun.dto';
import { GetTransactionDto } from 'src/common/dto/get-transaction.dto';
import { PaginationDto } from 'src/common/dto/pagination.dto';
import { PurchaseDataDto } from 'src/common/dto/purchase-data.dto';
import { RegisterAhoritaDto } from 'src/common/dto/register-ahorita.dto';
import { RegisterDeunaDto } from 'src/common/dto/register-deuna.dto';
import { RegisterPlaceToPayDto } from 'src/common/dto/register-place-to-pay.dto';
import handleDbExceptions from 'src/common/exceptions/error.db.exception';
import { ErrorCode } from 'src/common/glob/error';
import { IdTransactionFootbridge } from 'src/common/glob/id/id_transaction_footbridge';
import { IdTransactionReason } from 'src/common/glob/id/id_transaction_reason';
import { IdTransactionType } from 'src/common/glob/id/id_transaction_type';
import { StatusMoment } from 'src/common/glob/status/status_moment';
import { StatusPayment } from 'src/common/glob/status/status_payment';
import { CatalogType } from 'src/common/glob/type/type_catalog';
import { IncidentStatus } from 'src/common/glob/type/type_incident';
import { TypeNotification } from 'src/common/glob/type/type_notification';
import { TypePaymentMethod } from 'src/common/glob/type/type_payment_method';
import { TypePaymentResponsibility } from 'src/common/glob/type/type_payment_responsibility';
import { TypeService } from 'src/common/glob/type/type_service';
import { DataSource, Repository } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';

import { CreateCheckboxDto } from './dto/create-checkbox.dto';

/**
 * Catalog name holding the accounting account code applied to card purchases.
 * Not part of the shared `CatalogType` enum (which lives in the `src/common`
 * submodule), so it is referenced by its literal name.
 */
const ACCOUNTING_ACCOUNT_CARD_CATALOG = 'accountingAccountCard';

/**
 * Service that handles the client-facing checkbox (prepaid balance) flow:
 * purchases, payment-provider dispatch (DeUna / Ahorita / PlaceToPay),
 * webhook responses, balance reservation/release timers and integration
 * with the user wallet tracked in `CheckboxUser`.
 *
 * Implements {@link OnModuleInit} to bootstrap pending-state recovery on startup.
 */
@Injectable()
export class CheckboxService implements OnModuleInit {
  private readonly logger = new Logger(CheckboxService.name);
  private readonly domainSimert: string = process.env.DOMINIO_SIMERT;
  private readonly timerMinuteDeuna: number =
    1000 * 60 * Number(process.env.TIMER_MINUTE_DEUNA || 5);

  private readonly timerMinutePlaceToPay: number =
    1000 * 60 * Number(process.env.TIMER_MINUTE_PLACE_TO_PAY || 6);

  private readonly catalogs: Map<string, any> = new Map();

  /**
   * Injects the repositories, shared services and data source required to
   * manage checkbox transactions and the associated user wallet balance.
   *
   * @param checkboxRepository Repository for `Checkbox` transaction rows.
   * @param checkboxUserRepository Repository for the `CheckboxUser` wallet.
   * @param cardRepository Repository for `Card` entities.
   * @param catalogRepository Repository for `Catalog` lookup entries.
   * @param commonService Shared utility service.
   * @param commonAuthService Shared authentication service.
   * @param commonGimService Shared GIM integration service.
   * @param commonCheckboxService Shared checkbox helper service.
   * @param gimService GIM domain service.
   * @param dataSource TypeORM data source used for transactions and raw queries.
   */
  constructor(
    @InjectRepository(Checkbox)
    private readonly checkboxRepository: Repository<Checkbox>,

    @InjectRepository(CheckboxUser)
    private readonly checkboxUserRepository: Repository<CheckboxUser>,

    @InjectRepository(Card)
    private readonly cardRepository: Repository<Card>,

    @InjectRepository(Catalog)
    private readonly catalogRepository: Repository<Catalog>,

    @Inject(CommonService)
    private readonly commonService: CommonService,

    @Inject(CommonAuthService)
    private readonly commonAuthService: CommonAuthService,

    @Inject(CommonGimService)
    private readonly commonGimService: CommonGimService,

    @Inject(CommonCheckboxService)
    private readonly commonCheckboxService: CommonCheckboxService,

    @Inject(GimService)
    private readonly gimService: GimService,

    private readonly dataSource: DataSource,
  ) { }

  /**
   * Loads all catalog entries into the in-memory map on module startup.
   * Logs an error without throwing if the DB is unavailable.
   */
  async onModuleInit() {
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
  }

  /**
   * Returns paginated checkbox transaction history for a user, combining
   * current-month rows from the live table with historical archive partitions.
   *
   * @param userId Owner of the transactions.
   * @param getTransactionDto Year/month filter and currentMonth flag.
   * @param paginationDto Pagination controls (limit/offset).
   * @returns Error-code envelope with the `checkboxs` array.
   */
  async getTransactions(
    userId: number,
    getTransactionDto: GetTransactionDto,
    paginationDto: PaginationDto,
  ) {
    const { limit = 10, offset = 0 } = paginationDto;
    const { year, month, currentMonth } = getTransactionDto;

    const currentDate = new Date();
    const currentDay = currentDate.getDate();

    try {
      // Historical checkbox tables are created in the `history` schema
      // by the archival cron (see data.service._pasarHistoricas).
      const schema = 'history';
      let tableName = 'checkbox';
      let tableExists = false;

      // Defense-in-depth: validate year/month as safe integers before
      // interpolating into the table identifier. DTO already constrains
      // these via class-validator, but this guard prevents any callers
      // that bypass the pipe from injecting SQL.
      const safeYear =
        Number.isInteger(Number(year)) &&
          Number(year) >= 2000 &&
          Number(year) <= 2100
          ? Number(year)
          : null;
      const safeMonth =
        Number.isInteger(Number(month)) &&
          Number(month) >= 1 &&
          Number(month) <= 12
          ? Number(month)
          : null;

      if (safeYear && safeMonth) {
        // Archival cron names tables with a zero-padded month
        // (`to_char(..., 'YYYY_MM')`), so the lookup must match.
        const mm = String(safeMonth).padStart(2, '0');
        tableName = `"${safeYear}_${mm}_${tableName}"`;
        tableName = `${schema}.${tableName}`;
        tableExists = await this._tableExists(tableName);
      }
      let query: string = '';
      const params = [];
      let idx = 1;

      if (tableExists) {
        query = `
                        SELECT
                        cb.id, cb.amount, cb.checkboxes, cb."statusPayment", TO_CHAR(cb."createdAt" AT TIME ZONE 'UTC' AT TIME ZONE 'America/Guayaquil', 'YYYY-MM-DD HH24:MI:SS') AS "createdAt"
                        FROM ${tableName} cb
                        WHERE cb."userId" = $${idx++}
                    `;
        params.push(userId);
      }

      if (!tableExists && !currentMonth) return { checkboxs: [] };

      if (currentMonth) {
        // Parameterize year/month to prevent SQL injection in EXTRACT
        // comparisons. Filtering by year as well as month avoids
        // mixing same-month rows from different years (e.g., May 2024
        // and May 2026) when the historical table for the requested
        // period does not (yet) exist.
        query += `
                ${tableExists ? 'UNION ALL' : ''}
                SELECT
                cb.id, cb.amount, cb.checkboxes, cb."statusPayment", TO_CHAR(cb."createdAt" AT TIME ZONE 'UTC' AT TIME ZONE 'America/Guayaquil', 'YYYY-MM-DD HH24:MI:SS') AS "createdAt"
                FROM checkbox cb
                WHERE cb."userId" = $${idx++}
                  AND EXTRACT(YEAR FROM cb."createdAt") = $${idx++}
                  AND EXTRACT(MONTH FROM cb."createdAt") = $${idx++}
                `;
        params.push(userId, safeYear ?? 0, safeMonth ?? 0);
      }

      // On day 1 of the current month, also fetch records from the
      // previous month still in the transactional table (the cron that
      // moves rows to history runs every 24h, so day 1 may still see
      // last day of the previous month).
      else if (currentDay === 1) {
        query += `
                ${tableExists ? 'UNION ALL' : ''}
                SELECT
                cb.id, cb.amount, cb.checkboxes, cb."statusPayment", TO_CHAR(cb."createdAt" AT TIME ZONE 'UTC' AT TIME ZONE 'America/Guayaquil', 'YYYY-MM-DD HH24:MI:SS') AS "createdAt"
                FROM checkbox cb
                WHERE cb."userId" = $${idx++}
                  AND EXTRACT(YEAR FROM cb."createdAt") = $${idx++}
                  AND EXTRACT(MONTH FROM cb."createdAt") = $${idx++}
                `;
        params.push(userId, safeYear ?? 0, safeMonth ?? 0);
      }

      query += `
            ORDER BY id DESC
            LIMIT $${idx++} OFFSET $${idx++};
            `;
      params.push(limit, offset);

      const checkboxs = await this.checkboxRepository.query(query, params);

      if (checkboxs && checkboxs.length > 0)
        return { errorCode: ErrorCode.NONE, checkboxs };
      return { errorCode: ErrorCode.NOT_VALID, checkboxs: [] };
    } catch (error) {
      handleDbExceptions(error, this.logger);
    }
  }

  /**
   * Returns a single checkbox transaction by its id, scoped to the given user.
   *
   * @param userId Owner of the transaction.
   * @param id Primary key of the checkbox transaction.
   * @returns Error-code envelope with the matched checkbox or an empty object.
   */
  async getTransactionsById(userId: number, id: number) {
    try {
      const checkbox = await this.checkboxRepository
        .createQueryBuilder('cb')
        .select([
          'cb.id',
          'cb.amount',
          'cb.commission',
          'cb.checkboxes',
          'cb.statusPayment',
          'cb.createdAt',
          'cb.url',
          'cb.typePaymentMethod',
        ])
        .where('cb.id = :id', { id })
        .andWhere('cb.userId = :userId', { userId })
        .getOne();

      if (checkbox) return { errorCode: ErrorCode.NONE, checkbox };
      return { errorCode: ErrorCode.NOT_FOUND, checkbox: {} };
    } catch (error) {
      handleDbExceptions(error, this.logger);
    }
  }

  /**
   * Checks whether a database table or view exists for the given identifier.
   *
   * @param tableName Fully-qualified table identifier to test.
   * @returns Promise resolving to `true` if the table exists, otherwise `false`.
   */
  private async _tableExists(tableName: string): Promise<boolean> {
    const query = `
                        SELECT to_regclass($1) IS NOT NULL AS exists
                    `;

    try {
      const result = await this.checkboxRepository.query(query, [
        `${tableName}`,
      ]);

      return result[0].exists;
    } catch {
      return false;
    }
  }

  /**
   * Returns all active card options alongside the user's current checkbox balance.
   *
   * @param userId Owner whose balance is to be retrieved.
   * @returns Error-code envelope with `cards` array and `checkboxes` count.
   */
  async getCardsAndCheckboxes(userId: number) {
    try {
      const [cards, checkboxes] = await Promise.all([
        this.cardRepository
          .createQueryBuilder('cd')
          .select(['cd.id', 'cd.price', 'cd.commission', 'cd.checkboxes'])
          .where('cd.isActivated = :isActivated', { isActivated: true })
          .getMany(),

        this.checkboxUserRepository
          .createQueryBuilder('cb')
          .select(['cb.checkboxes'])
          .where('cb.userId = :userId', { userId })
          .getOne(),
      ]);

      return {
        errorCode: ErrorCode.NONE,
        cards,
        checkboxes: checkboxes ? checkboxes.checkboxes : 0,
      };
    } catch (error) {
      this.logger.error('getCardsAndCheckboxes failed', error);
      handleDbExceptions(error, this.logger);
    }
  }

  /**
   * Initiates a checkbox purchase via the configured payment provider (DeUna V2,
   * Ahorita or PlaceToPay) and returns the provider deeplink.
   *
   * @param idDevice Device identifier originating the purchase.
   * @param createCheckboxDto Purchase payload including amount, payment method and billing data.
   * @returns Error-code envelope. On success returns `AWAITS_RESPONSE` with the checkbox record.
   */
  async buyCheckboxs(idDevice: string, createCheckboxDto: CreateCheckboxDto) {
    // Validate that the cashier window is open in GIM
    const openTill = await this.gimService.validateOpenTill();
    if (openTill.errorCode !== ErrorCode.NONE) {
      return { errorCode: ErrorCode.GIM_CLOSE, message: 'La jornada no se encuentra aperturada.' };
    }

    const {
      userId,
      transactionId,
      typePaymentMethod,
      optionalData,
      identityCard,
      credentialId,
    } = createCheckboxDto;

    let urlDeuna = '';
    let urlAhorita = '';
    let urlPlaceToPay = '';

    if (
      typePaymentMethod === TypePaymentMethod.DEUNA ||
      typePaymentMethod === TypePaymentMethod.DEUNAV2
    ) {
      if (!identityCard || identityCard.length < 10) {
        return { errorCode: ErrorCode.RESPONSE };
      }
      const response = await this.commonService.checkDeUnaByIdentityCard(
        idDevice,
        identityCard,
        userId,
        credentialId,
      );
      if (!response || response['errorCode'] !== ErrorCode.NONE) {
        return { errorCode: ErrorCode.WAIT_TRANSACTION_PREVIEWS };
      }
      urlDeuna = response['url'];
    }

    if (typePaymentMethod === TypePaymentMethod.PLACE_TO_PAY) {
      if (!identityCard || identityCard.length < 10) {
        return { errorCode: ErrorCode.RESPONSE };
      }
      const response = await this.commonService.checkPlaceToPayByIdentityCard(
        idDevice,
        identityCard,
        userId,
        credentialId,
      );
      if (!response || response['errorCode'] !== ErrorCode.NONE) {
        return { errorCode: ErrorCode.WAIT_TRANSACTION_PREVIEWS };
      }
      urlPlaceToPay = response['url'];
    }

    // Check whether the user already has a previous transaction
    const checkboxCheck = await this.checkboxRepository.findOne({
      where: { userId, transactionId },
    });

    if (checkboxCheck) return { errorCode: ErrorCode.TRANSACTION_REPIT };

    let typePaymentResponsibility: TypePaymentResponsibility;

    try {
      let concept = `Compra de ${createCheckboxDto.checkboxes} casilleros | Simert Loja`;

      if (optionalData) {
        const conceptElement = optionalData.find(
          (element) => element.key === 'concept',
        );
        concept = `${conceptElement ? conceptElement.value + ' | ' + concept : concept}`;
      }

      // Map createCheckboxDto properties into debitAmounDto
      const debitAmounDto = await this._parseDebitAmounDto(
        concept,
        createCheckboxDto,
      );

      const queryRunner = this.dataSource.createQueryRunner();

      try {
        await queryRunner.connect();
        await queryRunner.startTransaction();

        let checkbox = this.checkboxRepository.create({
          ...createCheckboxDto,
          register: debitAmounDto.register,
          onResponseExternal: [],
        });

        checkbox = await queryRunner.manager.save(checkbox);

        switch (typePaymentMethod) {
          case TypePaymentMethod.DEUNAV2: {
            const responseDeunaV2 = await this._payDeunaV2(
              idDevice,
              checkbox,
              debitAmounDto,
              createCheckboxDto,
              typePaymentResponsibility,
            );
            urlDeuna = responseDeunaV2['deeplink'];
            checkbox.url = urlDeuna;
            await queryRunner.manager.save(checkbox);
            break;
          }
          case TypePaymentMethod.AHORITA: {
            const responseAhorita = await this._payAhorita(
              idDevice,
              checkbox,
              debitAmounDto,
              createCheckboxDto,
              typePaymentResponsibility,
            );
            urlAhorita = responseAhorita['deeplink'];
            checkbox.url = urlAhorita;
            await queryRunner.manager.save(checkbox);
            break;
          }

          case TypePaymentMethod.PLACE_TO_PAY: {
            const responsePlaceToPay = await this._payPlaceToPay(
              idDevice,
              checkbox,
              debitAmounDto,
              createCheckboxDto,
              typePaymentResponsibility,
            );

            urlPlaceToPay = responsePlaceToPay['deeplink'];
            checkbox.url = urlPlaceToPay;
            await queryRunner.manager.save(checkbox);
            break;
          }

          default:
            throw new Error('call buy TypePaymentMethod not found');
        }

        if (queryRunner.isTransactionActive)
          await queryRunner.commitTransaction();

        const checkboxBuying = await this.checkboxRepository.findOne({
          where: { id: checkbox.id },
        });
        delete checkboxBuying.transactionId;

        return {
          errorCode: ErrorCode.AWAITS_RESPONSE,
          checkbox: checkboxBuying,
        };
      } catch (error) {
        if (queryRunner.isTransactionActive) {
          await queryRunner.rollbackTransaction();
        }
        this.logger.error(`call buyCheckboxs error.message ${error.message}`);
      } finally {
        await queryRunner.release();
      }

      return { errorCode: ErrorCode.UNAUTHORIZED };
    } catch {
      // Errors are swallowed here on purpose: the buy flow already returns its
      // own error-code envelope above and must not surface raw exceptions.
    }
  }

  /**
   * Builds the `DebitAmounDto` used to charge a SIMERT purchase, assembling
   * the purchase line item, billing data and transaction reason.
   *
   * @param concept Description of the purchased product.
   * @param createCheckboxDto Source DTO with amount, user and billing details.
   * @returns Promise resolving to the assembled `DebitAmounDto`, or `undefined`
   *   if the DTO could not be built.
   */
  private async _parseDebitAmounDto(
    concept: string,
    createCheckboxDto: CreateCheckboxDto,
  ) {
    try {
      const { credentialId, amount, userId, transactionId, commission } =
        createCheckboxDto;

      const register = this.commonService.getDate();

      const purchaseData: PurchaseDataDto[] = [
        new PurchaseDataDto({
          quantity: 1,
          product: concept,
          price: amount,
          total: amount,
        }),
      ];

      // Billing/accounting codes queried from the `catalog` table: the first
      // `key` of `typeRubroCard` and of `accountingAccountCard` respectively.
      const [code, accountingAccountCode] = await Promise.all([
        this._firstCatalogKey(CatalogType.TypeRubroCard, '573'),
        this._firstCatalogKey(
          ACCOUNTING_ACCOUNT_CARD_CATALOG,
          '1.4.03.99.21.001',
        ),
      ]);

      const debitAmounDto = new DebitAmounDto({
        register,
        concept,
        debit: amount,
        userId,
        transactionId,
        transactionReason: { id: IdTransactionReason.BUY_SIMERT },
        billing_data: {
          ...createCheckboxDto.billing_data,
          typeService: TypeService.PARKING,
          code,
          accountingAccountCode,
        } as BillingDataDto,
        purchase_data: purchaseData,
        credentialId,
        commission,
      });
      return debitAmounDto;
    } catch {
      // Returns undefined on failure; callers handle the missing DTO.
    }
  }

  /**
   * Queries the `catalog` table by name and returns the first entry's `key`
   * from its `data` array, stringified.
   *
   * @param catalogName Value of the catalog `name` column to look up.
   * @param fallback Value returned when the catalog row is missing, its `data`
   *   is empty or the first entry has no `key`. Defaults to an empty string.
   * @returns The first entry's `key` as a string, or `fallback`.
   */
  private async _firstCatalogKey(
    catalogName: string,
    fallback = '',
  ): Promise<string> {
    const catalog = await this.catalogRepository.findOne({
      where: { name: catalogName },
    });
    const data = catalog?.data;
    if (Array.isArray(data) && data.length > 0 && data[0]?.key != null) {
      return String(data[0].key);
    }
    return fallback;
  }

  /**
   * Resolves the GIM revenue code (rubro) and description used when issuing a
   * card credit title, falling back to environment defaults when the catalog
   * entry is missing.
   *
   * @returns Object with the resolved `entryCode`, `description` and the
   *   `optionalData` key/value pairs sent to GIM.
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

  /**
   * Persists the outcome of a card payment, issuing the GIM credit title and
   * updating the checkbox state according to the reported payment status.
   *
   * @param idDevice Identifier of the device that processed the payment.
   * @param checkbox Checkbox transaction being settled.
   * @param moment Lifecycle moment of the payment status update.
   * @param statusPayment Reported payment status (paid, pending, failed, etc.).
   */
  async _saveResponsePay(
    idDevice: string,
    checkbox: Checkbox,
    moment: StatusMoment,
    statusPayment: StatusPayment,
  ) {
    const { entryCode, optionalData } = this._buildRubroOptionalData();
    if (statusPayment === StatusPayment.PAID) {
      try {
        const { userId } = checkbox;

        // ─── PRUEBA TEMPORAL: GIM deshabilitado al momento del pago ───
        // Se deja el checkbox en PAID con statusIncident = null (sin emitir ni
        // registrar depósito) para verificar que el hilo
        // _validateCheckboxToEmitAndPay (check.service.ts) lo recoja y complete
        // la emisión/depósito en GIM. REVERTIR (descomentar) tras la prueba.
        /*
        // Issue the credit title in GIM
        const emisionResult =
          await this.commonCheckboxService.resolveResidentIdAndEmitCreditCard(
            idDevice,
            checkbox,
            entryCode,
          );

        console.log(`emisionResult`, emisionResult);
        if (emisionResult && emisionResult.errorCode !== ErrorCode.NONE) {
          this.logger.error(
            `_saveResponsePay: failed to issue credit title for checkbox ${checkbox.id}`,
          );
          // Persist the issuance attempt on the checkbox
          if (emisionResult.dataEmision)
            checkbox.onResponseExternal.push(emisionResult.dataEmision);
        } else {
          // Persist the issuance result on the checkbox
          if (emisionResult.dataEmision)
            checkbox.onResponseExternal.push(emisionResult.dataEmision);
          checkbox.statusIncident = IncidentStatus.SUPPLIED;

          // Register the deposit in GIM
          const depositResult =
            await this.commonCheckboxService.registerDepositGim(
              idDevice,
              checkbox,
            );

          if (depositResult && depositResult.errorCode !== ErrorCode.NONE) {
            if (depositResult.dataDeposit)
              checkbox.onResponseExternal.push(depositResult.dataDeposit);
            checkbox.statusIncident = IncidentStatus.SUPPLIED;

            this.logger.error(
              `_saveResponsePay: failed to register deposit for checkbox ${checkbox.id}`,
            );
          } else {
            // Persist the deposit result on the checkbox
            if (depositResult.dataDeposit)
              checkbox.onResponseExternal.push(depositResult.dataDeposit);
            checkbox.statusIncident = IncidentStatus.PAYED;
          }
        }
        */

        // Update the checkbox with the new status fields
        const updateData = {
          onResponseExternal: checkbox.onResponseExternal,
          statusIncident: checkbox.statusIncident,
          statusPayment: statusPayment,
          optionalData,
          // moment: moment,
        };
        await this.checkboxRepository.update(checkbox.id, updateData);

        // Check whether the user already has a checkboxUser to increment their balance
        let checkboxUser = await this.checkboxUserRepository.findOne({
          where: { userId },
        });
        if (!checkboxUser) {
          // Create a checkboxUser row for the recipient user
          checkboxUser = this.checkboxUserRepository.create({
            userId,
            checkboxes: checkbox.checkboxes,
          });
          await this.checkboxUserRepository.save(checkboxUser);
        } else {
          checkboxUser.checkboxes += checkbox.checkboxes;
          await this.checkboxUserRepository.save(checkboxUser);
        }
      } catch (error) {
        this.logger.error(
          `call _saveResponsePay error.message ${error.message} StatusMoment.CORRECTLY_PAID_UNASSIGNED`,
        );
        checkbox.moment = StatusMoment.CORRECTLY_PAID_UNASSIGNED;
        checkbox.statusPayment = statusPayment;
        await this.checkboxRepository.save(checkbox);
        this.logger.error(`${JSON.stringify(checkbox)}`);
      }
    }
    checkbox.moment = moment;
    checkbox.statusPayment = statusPayment;
    checkbox.optionalData = optionalData;
    await this.checkboxRepository.save(checkbox);
  }

  /**
   * Sends a push notification informing the buyer about a status change for a
   * SIMERT card purchase.
   *
   * @param userId Buyer id that receives the notification.
   * @param status New status code reported to the buyer.
   * @param checkbox Checkbox transaction whose status changed.
   */
  private async _notifyChageStatus(
    userId: number,
    status: number,
    checkbox: Checkbox,
  ) {
    const notification = new CreateNotificationDto({
      userId,
      notification: {
        type: TypeNotification.CHANGE_STATUS_BUY_CARD_SIMERT,
        data: {
          checkboxId: checkbox.id,
          status,
          typePaymentMethod: checkbox.typePaymentMethod,
          amount: checkbox.amount,
        },
      },
    });
    this.commonService.notify(notification);
  }

  /**
   * Schedules the deferred verification that reverses a checkbox purchase
   * when the provider never confirms the payment. After `timerMs` it
   * re-reads the checkbox: if it is already PAID nothing changes, otherwise
   * it is flagged as ERROR and the buyer is notified.
   *
   * Shared by every payment-provider flow; the only differences are the
   * success log message and the wait timer (DeUna/Ahorita vs PlaceToPay).
   *
   * @param idDevice Device identifier propagated to `_saveResponsePay`.
   * @param checkbox Checkbox purchase being verified.
   * @param userId Buyer id, used for the status notification.
   * @param paidLogMessage Message logged when the payment was confirmed in time.
   * @param timerMs Delay before running the verification.
   * @param debitAmounDto Debit payload used to register the erroneous
   *   transaction in simert-pay when the payment is not confirmed in time.
   */
  private _scheduleUnconfirmedCheckboxReversal(
    idDevice: string,
    checkbox: Checkbox,
    userId: number,
    paidLogMessage: string,
    timerMs: number,
    debitAmounDto: DebitAmounDto,
  ): void {
    setTimeout(async () => {
      const checkboxCheck = await this.checkboxRepository.findOne({
        where: { id: checkbox.id },
      });
      if (!checkboxCheck) return;
      if (checkboxCheck.statusPayment === StatusPayment.PAID) {
        return this.logger.log(paidLogMessage);
      }
      this.logger.warn('No se pago en 5 minutos se liberaron los checkbox');
      this._saveResponsePay(
        idDevice,
        checkbox,
        StatusMoment.RESPONSE,
        StatusPayment.ERROR,
      );
      this._notifyChageStatus(userId, StatusPayment.ERROR, checkbox);

      // Record the failed payment as an erroneous transaction in simert-pay.
      // The footbridge (payment gateway) is required by the transaction record.
      debitAmounDto.transactionFootbridge = {
        id: this._resolveTransactionFootbridge(checkbox.typePaymentMethod),
      };
      await this.commonService.registerErrorTransaction(
        idDevice,
        IdTransactionType.TRANSACTION,
        debitAmounDto,
      );
    }, timerMs);
  }

  /**
   * Maps a payment method to its payment-gateway (footbridge) identifier,
   * required when registering the transaction in simert-pay.
   *
   * @param typePaymentMethod Payment method used for the purchase.
   * @returns The matching {@link IdTransactionFootbridge} value.
   */
  private _resolveTransactionFootbridge(
    typePaymentMethod: TypePaymentMethod,
  ): IdTransactionFootbridge {
    switch (typePaymentMethod) {
      case TypePaymentMethod.AHORITA:
        return IdTransactionFootbridge.AHORITA;
      case TypePaymentMethod.PLACE_TO_PAY:
        return IdTransactionFootbridge.PLACE_TO_PAY;
      case TypePaymentMethod.COOPMEGO:
        return IdTransactionFootbridge.COOPMEGO;
      default:
        return IdTransactionFootbridge.DE_UNA;
    }
  }

  /**
   * Handles an unsuccessful provider response for a checkbox purchase: flags
   * the checkbox as ERROR and notifies the buyer. Shared by all provider flows.
   *
   * @param idDevice Device identifier propagated to `_saveResponsePay`.
   * @param checkbox Checkbox purchase that failed.
   * @param userId Buyer id.
   * @returns The standard RESPONSE error envelope.
   */
  private _handleCheckboxPaymentFailure(
    idDevice: string,
    checkbox: Checkbox,
    userId: number,
  ): { errorCode: number } {
    this._saveResponsePay(
      idDevice,
      checkbox,
      StatusMoment.RESPONSE,
      StatusPayment.ERROR,
    );
    this._notifyChageStatus(userId, StatusPayment.ERROR, checkbox);
    return { errorCode: ErrorCode.RESPONSE };
  }

  /**
   * Builds the asynchronous payment-confirmation webhook URL invoked by every
   * provider (DeUna, Ahorita, PlaceToPay) for a checkbox purchase. The path is
   * identical across providers, so centralizing it removes the repeated
   * template literal from each flow.
   *
   * @param idDevice Device identifier originating the purchase.
   * @param userId Buyer id.
   * @param checkboxId Checkbox purchase id.
   * @param typePaymentMethod Provider used.
   * @param register Transaction register timestamp.
   * @param typePaymentResponsibility Who assumes the payment commission.
   * @returns The fully qualified webhook URL.
   */
  private _buildCheckboxResponseWebhook(
    idDevice: string,
    userId: number,
    checkboxId: number,
    typePaymentMethod: TypePaymentMethod,
    register: string,
    typePaymentResponsibility: TypePaymentResponsibility,
  ): string {
    return `${this.domainSimert}api/simert/client/checkbox/on-response-pay/${idDevice}/${userId}/${checkboxId}/${typePaymentMethod}/${register}/${typePaymentResponsibility}`;
  }

  /**
   * Initiates a SIMERT card purchase through the DeUna v2 payment provider and
   * schedules the reversal verification when no confirmation arrives in time.
   *
   * @param idDevice Device identifier originating the purchase.
   * @param checkbox Checkbox transaction being paid.
   * @param debitAmounDto Debit details for the charge.
   * @param createCheckboxDto Source DTO with amount, user and billing details.
   * @param typePaymentResponsibility Party responsible for the payment.
   * @returns Promise resolving to an error-code envelope, including the provider
   *   `deeplink` on success.
   */
  private async _payDeunaV2(
    idDevice: string,
    checkbox: Checkbox,
    debitAmounDto: DebitAmounDto,
    createCheckboxDto: CreateCheckboxDto,
    typePaymentResponsibility: TypePaymentResponsibility,
  ) {
    const { userId, typePaymentMethod, credentialId } = createCheckboxDto;
    const { register } = debitAmounDto;

    if (!typePaymentResponsibility)
      typePaymentResponsibility = TypePaymentResponsibility.NONE;

    const registerDeunaDto = new RegisterDeunaDto({
      credentialId,
      register: debitAmounDto.register,
      amount: createCheckboxDto.amount,
      commission: createCheckboxDto.commission,
      identityCard: createCheckboxDto.identityCard,
      idTransactionReason: IdTransactionReason.BUY_SIMERT,
      concept: debitAmounDto.concept,
      purchase_data: debitAmounDto.purchase_data,
      billing_data: debitAmounDto.billing_data,
      transactionId: debitAmounDto.transactionId,
      userId,
      webhook: this._buildCheckboxResponseWebhook(
        idDevice,
        userId,
        checkbox.id,
        typePaymentMethod,
        register,
        typePaymentResponsibility,
      ),
    });

    const response = await this.commonService.payDeUnaV2(
      idDevice,
      registerDeunaDto,
    );

    // Provider acknowledged with the expected success status
    if (response && response['errorCode'] === ErrorCode.NONE) {
      // Wait 5 minutes to confirm the PAYMENT actually happened. If the webhook arrives
      // first the client is already notified there; otherwise we verify the transaction
      // before reversing it.
      this._scheduleUnconfirmedCheckboxReversal(
        idDevice,
        checkbox,
        userId,
        'Se pago correctamente con deuna en menos de 5 minutos',
        this.timerMinuteDeuna,
        debitAmounDto,
      );
      return { errorCode: ErrorCode.NONE, deeplink: response['deeplink'] };
    } else {
      return this._handleCheckboxPaymentFailure(idDevice, checkbox, userId);
    }
  }

  /**
   * Initiates a SIMERT card purchase through the Ahorita payment provider and
   * schedules the reversal verification when no confirmation arrives in time.
   *
   * @param idDevice Device identifier originating the purchase.
   * @param checkbox Checkbox transaction being paid.
   * @param debitAmounDto Debit details for the charge.
   * @param createCheckboxDto Source DTO with amount, user and billing details.
   * @param typePaymentResponsibility Party responsible for the payment.
   * @returns Promise resolving to an error-code envelope, including the provider
   *   `deeplink` on success.
   */
  private async _payAhorita(
    idDevice: string,
    checkbox: Checkbox,
    debitAmounDto: DebitAmounDto,
    createCheckboxDto: CreateCheckboxDto,
    typePaymentResponsibility: TypePaymentResponsibility,
  ) {
    const { userId, typePaymentMethod, credentialId } = createCheckboxDto;
    const { register } = debitAmounDto;

    if (!typePaymentResponsibility) {
      typePaymentResponsibility = TypePaymentResponsibility.NONE;
    }

    const registerAhoritaDto = new RegisterAhoritaDto({
      credentialId,
      register: debitAmounDto.register,
      amount: createCheckboxDto.amount,
      commission: createCheckboxDto.commission,
      identityCard: createCheckboxDto.identityCard,
      idTransactionReason: IdTransactionReason.BUY_SIMERT,
      concept: debitAmounDto.concept,
      purchase_data: debitAmounDto.purchase_data,
      billing_data: debitAmounDto.billing_data,
      transactionId: debitAmounDto.transactionId,
      userId,
      webhook: this._buildCheckboxResponseWebhook(
        idDevice,
        userId,
        checkbox.id,
        typePaymentMethod,
        register,
        typePaymentResponsibility,
      ),
    });

    const response = await this.commonService.payAhorita(
      idDevice,
      registerAhoritaDto,
    );

    // Provider acknowledged with the expected success status
    if (response && response['errorCode'] === ErrorCode.NONE) {
      // Wait 3 minutes to confirm the PAYMENT actually happened. If the webhook arrives
      // first the client is already notified there; otherwise we verify the transaction
      // before reversing it.
      this._scheduleUnconfirmedCheckboxReversal(
        idDevice,
        checkbox,
        userId,
        'Se pago correctamente con ahorita en menos de 3 minutos',
        this.timerMinuteDeuna,
        debitAmounDto,
      );
      return { errorCode: ErrorCode.NONE, deeplink: response['deeplink'] };
    } else {
      return this._handleCheckboxPaymentFailure(idDevice, checkbox, userId);
    }
  }

  /**
   * Initiates a SIMERT card purchase through the PlaceToPay payment provider and
   * schedules the reversal verification when no confirmation arrives in time.
   *
   * @param idDevice Device identifier originating the purchase.
   * @param checkbox Checkbox transaction being paid.
   * @param debitAmounDto Debit details for the charge.
   * @param createCheckboxDto Source DTO with amount, user and billing details.
   * @param typePaymentResponsibility Party responsible for the payment.
   * @returns Promise resolving to an error-code envelope, including the provider
   *   `deeplink` on success.
   */
  private async _payPlaceToPay(
    idDevice: string,
    checkbox: Checkbox,
    debitAmounDto: DebitAmounDto,
    createCheckboxDto: CreateCheckboxDto,
    typePaymentResponsibility: TypePaymentResponsibility,
  ) {
    const { userId, typePaymentMethod, credentialId } = createCheckboxDto;
    const { register } = debitAmounDto;

    if (!typePaymentResponsibility) {
      typePaymentResponsibility = TypePaymentResponsibility.NONE;
    }

    const referenceId = uuidv4().replace(/-/g, '');

    const registerPlaceToPayDto = new RegisterPlaceToPayDto({
      credentialId,
      register: debitAmounDto.register,
      amount: createCheckboxDto.amount,
      commission: createCheckboxDto.commission,
      referenceId,
      identityCard: createCheckboxDto.identityCard,
      idTransactionReason: IdTransactionReason.BUY_SIMERT,
      concept: debitAmounDto.concept,
      purchase_data: debitAmounDto.purchase_data,
      billing_data: debitAmounDto.billing_data,
      transactionId: debitAmounDto.transactionId,
      userId,
      webhook: this._buildCheckboxResponseWebhook(
        idDevice,
        userId,
        checkbox.id,
        typePaymentMethod,
        register,
        typePaymentResponsibility,
      ),
    });

    const response = await this.commonService.payPlaceToPay(
      idDevice,
      referenceId,
      registerPlaceToPayDto,
    );

    // Provider acknowledged with the expected success status
    if (response && response['errorCode'] === ErrorCode.NONE) {
      // Wait 3 minutes to confirm the PAYMENT actually happened. If the webhook arrives
      // first the client is already notified there; otherwise we verify the transaction
      // before reversing it.
      this._scheduleUnconfirmedCheckboxReversal(
        idDevice,
        checkbox,
        userId,
        'Se pago correctamente con pay to pay 3 minutos',
        this.timerMinutePlaceToPay,
        debitAmounDto,
      );
      return { errorCode: ErrorCode.NONE, deeplink: response['deeplink'] };
    } else {
      return this._handleCheckboxPaymentFailure(idDevice, checkbox, userId);
    }
  }

  /**
   * Payment-provider success webhook. Marks the checkbox as PAID and notifies
   * the buyer. Idempotent: only processes if the checkbox is still in WAITING state.
   *
   * @param idDevice Device that originated the purchase.
   * @param userId Buyer id.
   * @param checkboxId Primary key of the checkbox being confirmed.
   * @param _typePaymentMethod Provider that called back (currently unused).
   * @param _register Original register timestamp (currently unused).
   * @param _typePaymentResponsibility Commission responsibility type (currently unused).
   * @returns Standard error-code envelope.
   */
  async onResponsePay(
    idDevice: string,
    userId: number,
    checkboxId: number,
    _typePaymentMethod: number,
    _register: string,
    _typePaymentResponsibility: TypePaymentResponsibility,
  ) {
    const checkbox = await this.checkboxRepository.findOne({
      where: { id: checkboxId },
    });
    if (!checkbox) {
      return { errorCode: ErrorCode.NOT_FOUND };
    }
    if (checkbox.statusPayment === StatusPayment.WAITING) {
      await this._saveResponsePay(
        idDevice,
        checkbox,
        StatusMoment.LISTENING,
        StatusPayment.PAID,
      );
      await this._notifyChageStatus(userId, StatusPayment.PAID, checkbox);

      return { errorCode: ErrorCode.NONE };
    }
    return { errorCode: ErrorCode.NOT_FOUND };
  }

  /**
   * Payment-provider error/cancellation webhook. Marks the checkbox as ERROR
   * and notifies the buyer.
   *
   * @param idDevice Device that originated the purchase.
   * @param userId Buyer id.
   * @param checkboxId Primary key of the checkbox that failed.
   * @param _typePaymentMethod Provider that called back (currently unused).
   * @param _register Original register timestamp (currently unused).
   * @param _typePaymentResponsibility Commission responsibility type (currently unused).
   * @returns Standard error-code envelope.
   */
  async onResponsePayError(
    idDevice: string,
    userId: number,
    checkboxId: number,
    _typePaymentMethod: number,
    _register: string,
    _typePaymentResponsibility: TypePaymentResponsibility,
  ) {
    const checkbox = await this.checkboxRepository.findOne({
      where: { id: checkboxId },
    });
    if (!checkbox) {
      return { errorCode: ErrorCode.NOT_FOUND };
    }

    await this._saveResponsePay(
      idDevice,
      checkbox,
      StatusMoment.RESPONSE,
      StatusPayment.ERROR,
    );
    await this._notifyChageStatus(userId, StatusPayment.ERROR, checkbox);
    return { errorCode: ErrorCode.NONE };
  }
}
