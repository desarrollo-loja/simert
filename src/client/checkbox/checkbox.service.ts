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
import { IdTransactionReason } from 'src/common/glob/id/id_transaction_reason';
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

@Injectable()
export class CheckboxService implements OnModuleInit {

    private readonly logger = new Logger('CheckboxService');
    private readonly domainSimert: string = process.env.DOMINIO_SIMERT;
    private readonly timerMinuteDeuna: number = 1000 * 60 * Number(process.env.TIMER_MINUTE_DEUNA || 5);
    private readonly timerMinutePlaceToPay: number = 1000 * 60 * Number(process.env.TIMER_MINUTE_PLACE_TO_PAY || 6);
    private readonly catalogs: Map<string, any> = new Map();

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

        private readonly dataSource: DataSource
    ) { }

    async onModuleInit() {
        try {
            const all = await this.catalogRepository.find();
            for (const catalog of all) {
                this.catalogs.set(catalog.name, catalog.data);
            }
            this.logger.log(`Catalogs loaded in memory: ${this.catalogs.size}`);
        } catch (error) {
            this.logger.error(`onModuleInit: error loading catalogs - ${error.message}`);
        }
    }

    async getTransactions(userId: number, getTransactionDto: GetTransactionDto, paginationDto: PaginationDto) {
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
            const safeYear = Number.isInteger(Number(year)) && Number(year) >= 2000 && Number(year) <= 2100 ? Number(year) : null;
            const safeMonth = Number.isInteger(Number(month)) && Number(month) >= 1 && Number(month) <= 12 ? Number(month) : null;

            if (safeYear && safeMonth) {
                // Archival cron names tables with a zero-padded month
                // (`to_char(..., 'YYYY_MM')`), so the lookup must match.
                const mm = String(safeMonth).padStart(2, '0');
                tableName = `"${safeYear}_${mm}_${tableName}"`;
                tableName = `${schema}.${tableName}`;
                tableExists = await this._tableExists(tableName);
            }
            let query: string = '';
            let params = [];
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

            if (!tableExists && !currentMonth)
                return { checkboxs: [] };

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

    async getTransactionsById(userId: number, id: number) {

        try {
            const checkbox = await this.checkboxRepository.createQueryBuilder('cb')
                .select(['cb.id', 'cb.amount', 'cb.commission', 'cb.checkboxes', 'cb.statusPayment', 'cb.createdAt', 'cb.url', 'cb.typePaymentMethod'])
                .where('cb.id = :id', { id })
                .andWhere('cb.userId = :userId', { userId })
                .getOne();

            if (checkbox)
                return { errorCode: ErrorCode.NONE, checkbox };
            return { errorCode: ErrorCode.NOT_FOUND, checkbox: {} };

        } catch (error) {
            handleDbExceptions(error, this.logger);
        }
    }

    private async _tableExists(tableName: string): Promise<boolean> {
        const query = `
                        SELECT to_regclass($1) IS NOT NULL AS exists
                    `;

        try {
            const result = await this.checkboxRepository.query(query, [
                `${tableName}`
            ]);

            return result[0].exists;
        } catch (error) {
            return false;
        }
    }

    async getCardsAndCheckboxes(userId: number) {

        try {
            const [cards, checkboxes] = await Promise.all(
                [
                    this.cardRepository.createQueryBuilder('cd')
                        .select(['cd.id', 'cd.price', 'cd.commission', 'cd.checkboxes'])
                        .where('cd.isActivated = :isActivated', { isActivated: true })
                        .getMany(),

                    this.checkboxUserRepository.createQueryBuilder('cb')
                        .select(['cb.checkboxes'])
                        .where('cb.userId = :userId', { userId })
                        .getOne()
                ]);

            return { errorCode: ErrorCode.NONE, cards, checkboxes: checkboxes ? checkboxes.checkboxes : 0 };
        } catch (error) {
            this.logger.error('error en getCardsAndCheckboxes', error);
            handleDbExceptions(error, this.logger);
        }
    }

    async buyCheckboxs(idDevice: string, createCheckboxDto: CreateCheckboxDto) {

        //validamos que caja este abierta
        const openTill = await this.gimService.validateOpenTill();
        if (openTill.errorCode !== ErrorCode.NONE) return openTill;

        const { userId, transactionId, typePaymentMethod, optionalData, identityCard, credentialId } = createCheckboxDto;

        let urlDeuna = '';
        let urlAhorita = '';
        let urlPlaceToPay = '';

        if (typePaymentMethod === TypePaymentMethod.DEUNA || typePaymentMethod === TypePaymentMethod.DEUNAV2) {
            if ((!identityCard || identityCard.length < 10)) {
                return { errorCode: ErrorCode.RESPONSE };
            }
            const response = await this.commonService.checkDeUnaByIdentityCard(idDevice, identityCard, userId, credentialId);
            if (!response || response['errorCode'] !== ErrorCode.NONE) {
                return { errorCode: ErrorCode.WAIT_TRANSACTION_PREVIEWS };
            }
            urlDeuna = response['url'];
        }

        if (typePaymentMethod === TypePaymentMethod.PLACE_TO_PAY) {
            if ((!identityCard || identityCard.length < 10)) {
                return { errorCode: ErrorCode.RESPONSE };
            }
            const response = await this.commonService.checkPlaceToPayByIdentityCard(idDevice, identityCard, userId, credentialId);
            if (!response || response['errorCode'] !== ErrorCode.NONE) {
                return { errorCode: ErrorCode.WAIT_TRANSACTION_PREVIEWS };
            }
            urlPlaceToPay = response['url'];
        }

        // Buscamos si el usuario tiene una transaccion previa
        let checkboxCheck = await this.checkboxRepository.findOne({ where: { userId, transactionId } });

        if (checkboxCheck) return { errorCode: ErrorCode.TRANSACTION_REPIT };

        let typePaymentResponsibility: TypePaymentResponsibility;
        const date = this.commonService.getDate();

        try {
            let concept = `Compra de ${createCheckboxDto.checkboxes} casilleros | Simert Loja - ${date}`;

            if (optionalData) {
                const conceptElement = optionalData.find(element => element.key === 'concept');
                concept = `${conceptElement ? conceptElement.value + ' | ' + concept : concept}`;
            }

            //Mapeamos las propiedades de createCheckboxDto a debitAmounDto
            const debitAmounDto = await this._parseDebitAmounDto(concept, createCheckboxDto);

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

                    case TypePaymentMethod.DEUNAV2:

                        const responseDeunaV2 = await this._payDeunaV2(idDevice, checkbox, debitAmounDto, createCheckboxDto, typePaymentResponsibility);
                        urlDeuna = responseDeunaV2['deeplink'];
                        checkbox.url = urlDeuna;
                        await queryRunner.manager.save(checkbox);
                        break;
                    case TypePaymentMethod.AHORITA:

                        const responseAhorita = await this._payAhorita(idDevice, checkbox, debitAmounDto, createCheckboxDto, typePaymentResponsibility);
                        urlAhorita = responseAhorita['deeplink'];
                        checkbox.url = urlAhorita;
                        await queryRunner.manager.save(checkbox);
                        break;

                    case TypePaymentMethod.PLACE_TO_PAY:

                        const responsePlaceToPay = await this._payPlaceToPay(idDevice, checkbox, debitAmounDto, createCheckboxDto, typePaymentResponsibility);

                        urlPlaceToPay = responsePlaceToPay['deeplink'];
                        checkbox.url = urlPlaceToPay;
                        await queryRunner.manager.save(checkbox);
                        break;

                    default:
                        throw new Error('call buy TypePaymentMethod not found');
                }

                if (queryRunner.isTransactionActive)
                    await queryRunner.commitTransaction();

                const checkboxBuying = await this.checkboxRepository.findOne({ where: { id: checkbox.id } });
                delete checkboxBuying.transactionId;

                return { errorCode: ErrorCode.AWAITS_RESPONSE, checkbox: checkboxBuying };

            } catch (error) {
                if (queryRunner.isTransactionActive) {
                    await queryRunner.rollbackTransaction();
                }
                this.logger.error(`call buyCheckboxs error.message ${error.message}`);
            } finally {
                await queryRunner.release();
            }

            return { errorCode: ErrorCode.UNAUTHORIZED };

        } catch (error) {
        }

    }

    private async _parseDebitAmounDto(concept: string, createCheckboxDto: CreateCheckboxDto) {

        try {
            const { credentialId, amount, userId, transactionId, optionalData, commission
            } = createCheckboxDto;

            const register = this.commonService.getDate();

            let useGif: boolean = false;

            if (optionalData) {
                const useGifElement = optionalData.find(element => element.key === 'useGif');
                useGif = !!useGifElement?.value;
            }

            const purchase_data: PurchaseDataDto[] = [new PurchaseDataDto({
                quantity: 1,
                product: concept,
                price: amount,
                total: amount,
            })];

            const debitAmounDto = new DebitAmounDto({
                register,
                concept,
                debit: amount,
                userId,
                transactionId,
                transactionReason: { id: IdTransactionReason.BUY_SIMERT },
                billing_data: { ...createCheckboxDto.billing_data, typeService: TypeService.PARKING },
                purchase_data,
                credentialId,
                commission
            });

            return debitAmounDto;

        } catch (error) {
        }
    }

    private _buildRubroOptionalData(): {
        entryCode: string;
        description: string;
        optionalData: { key: string; value: string | Object }[];
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
            description = process.env.CODE_ENTRY_EMISION_CARD_DESCRIPTION || 'Compra de tarjeta simert | Loja';
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

    async _saveResponsePay(idDevice: string, checkbox: Checkbox, moment: StatusMoment, statusPayment: StatusPayment) {
        const { entryCode, optionalData } = this._buildRubroOptionalData();
        if (statusPayment === StatusPayment.PAID) {
            try {
                const { userId } = checkbox;

                // Emitimos el título de crédito en el GIM
                // const emisionResult = await this._resolveResidentIdAndEmitCreditCard(idDevice, checkbox);
                const emisionResult = await this.commonCheckboxService.resolveResidentIdAndEmitCreditCard(idDevice, checkbox, entryCode);

                if (emisionResult && emisionResult.errorCode !== ErrorCode.NONE) {
                    this.logger.error(`_saveResponsePay: no se pudo emitir título de crédito para checkbox ${checkbox.id}`);
                    // Guardamos la emisión en el checkbox
                    if (emisionResult.dataEmision)
                        checkbox.onResponseExternal.push(emisionResult.dataEmision);

                } else {
                    // Guardamos la emisión en el checkbox
                    if (emisionResult.dataEmision)
                        checkbox.onResponseExternal.push(emisionResult.dataEmision);
                    checkbox.statusIncident = IncidentStatus.SUPPLIED;

                    // Hacemos el depósito en el GIM
                    // const depositResult = await this._registerDepositGim(idDevice, checkbox);
                    const depositResult = await this.commonCheckboxService.registerDepositGim(idDevice, checkbox);

                    // this._registerDepositGim(idDevice, checkbox);

                    if (depositResult && depositResult.errorCode !== ErrorCode.NONE) {
                        if (depositResult.dataDeposit)
                            checkbox.onResponseExternal.push(depositResult.dataDeposit);
                        checkbox.statusIncident = IncidentStatus.SUPPLIED;

                        this.logger.error(`_saveResponsePay: no se pudo hacer el depósito para checkbox ${checkbox.id}`);
                    } else {
                        // Guardamos el depósito en el checkbox
                        if (depositResult.dataDeposit)
                            checkbox.onResponseExternal.push(depositResult.dataDeposit);
                        checkbox.statusIncident = IncidentStatus.PAYED;
                    }

                }

                // actualizamos el checkbox con sus nuevos estados
                const updateData = {
                    onResponseExternal: checkbox.onResponseExternal,
                    statusIncident: checkbox.statusIncident,
                    statusPayment: statusPayment,
                    optionalData,
                    // moment: moment,
                }
                const updateResponseCheck = await this.checkboxRepository.update(checkbox.id, updateData);

                // Buscamos si el usuario tiene checkboxUser para aumentar alli sus checkboxes
                let checkboxUser = await this.checkboxUserRepository.findOne({ where: { userId } });
                if (!checkboxUser) {
                    //Le creamos una checkboxUser al usuario al que le vamos a asignar el checkboxes
                    checkboxUser = this.checkboxUserRepository.create({ userId, checkboxes: checkbox.checkboxes });
                    await this.checkboxUserRepository.save(checkboxUser);
                } else {
                    checkboxUser.checkboxes += checkbox.checkboxes;
                    await this.checkboxUserRepository.save(checkboxUser);
                }
            } catch (error) {
                this.logger.error(`call _saveResponsePay error.message ${error.message} StatusMoment.CORRECTLY_PAID_UNASSIGNED`);
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

    private async _notifyChageStatus(userId: number, status: number, checkbox: Checkbox) {
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
            }
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
     */
    private _scheduleUnconfirmedCheckboxReversal(
        idDevice: string,
        checkbox: Checkbox,
        userId: number,
        paidLogMessage: string,
        timerMs: number,
    ): void {
        setTimeout(async () => {
            const checkboxCheck = await this.checkboxRepository.findOne({ where: { id: checkbox.id } });
            if (!checkboxCheck) return;
            if (checkboxCheck.statusPayment === StatusPayment.PAID) {
                return this.logger.log(paidLogMessage);
            }
            this.logger.warn('No se pago en 5 minutos se liberaron los checkbox');
            this._saveResponsePay(idDevice, checkbox, StatusMoment.RESPONSE, StatusPayment.ERROR);
            this._notifyChageStatus(userId, StatusPayment.ERROR, checkbox);
        }, timerMs);
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
        this._saveResponsePay(idDevice, checkbox, StatusMoment.RESPONSE, StatusPayment.ERROR);
        this._notifyChageStatus(userId, StatusPayment.ERROR, checkbox);
        return { errorCode: ErrorCode.RESPONSE };
    }

    private async _payDeunaV2(idDevice: string, checkbox: Checkbox, debitAmounDto: DebitAmounDto, createCheckboxDto: CreateCheckboxDto, typePaymentResponsibility: TypePaymentResponsibility) {

        const { userId, typePaymentMethod, credentialId, } = createCheckboxDto;
        const { register } = debitAmounDto;

        if (!typePaymentResponsibility) typePaymentResponsibility = TypePaymentResponsibility.NONE;

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
            webhook: `${this.domainSimert}api/simert/client/checkbox/on-response-pay/${idDevice}/${userId}/${checkbox.id}/${typePaymentMethod}/${register}/${typePaymentResponsibility}`,
        });

        const response = await this.commonService.payDeUnaV2(idDevice, registerDeunaDto);

        //Cuando el provehedor responde el estado correcto
        if (response && response['errorCode'] === ErrorCode.NONE) {
            // Esperamos 5 minutos para verificar si se realizo el PAGO, si el pago se hizo antes en respuesta al
            // webhook ya se responde al cliente antes, caso contrario se verifica la transaccion antes de reversar
            this._scheduleUnconfirmedCheckboxReversal(
                idDevice, checkbox, userId,
                'Se pago correctamente con deuna en menos de 5 minutos', this.timerMinuteDeuna,
            );
            return { errorCode: ErrorCode.NONE, deeplink: response['deeplink'] };
        } else {
            return this._handleCheckboxPaymentFailure(idDevice, checkbox, userId);
        }
    }

    private async _payAhorita(idDevice: string, checkbox: Checkbox, debitAmounDto: DebitAmounDto, createCheckboxDto: CreateCheckboxDto, typePaymentResponsibility: TypePaymentResponsibility) {
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
            webhook: `${this.domainSimert}api/simert/client/checkbox/on-response-pay/${idDevice}/${userId}/${checkbox.id}/${typePaymentMethod}/${register}/${typePaymentResponsibility}`,
        });

        const response = await this.commonService.payAhorita(idDevice, registerAhoritaDto);

        //Cuando el provehedor responde el estado correcto
        if (response && response['errorCode'] === ErrorCode.NONE) {
            // Esperamos 3 minutos para verificar si se realizo el PAGO, si el pago se hizo antes en respuesta al
            // webhook ya se responde al cliente antes, caso contrario se verifica la transaccion antes de reversar
            this._scheduleUnconfirmedCheckboxReversal(
                idDevice, checkbox, userId,
                'Se pago correctamente con ahorita en menos de 3 minutos', this.timerMinuteDeuna,
            );
            return { errorCode: ErrorCode.NONE, deeplink: response['deeplink'] };
        } else {
            return this._handleCheckboxPaymentFailure(idDevice, checkbox, userId);
        }
    }

    private async _payPlaceToPay(idDevice: string, checkbox: Checkbox, debitAmounDto: DebitAmounDto, createCheckboxDto: CreateCheckboxDto, typePaymentResponsibility: TypePaymentResponsibility) {
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
            webhook: `${this.domainSimert}api/simert/client/checkbox/on-response-pay/${idDevice}/${userId}/${checkbox.id}/${typePaymentMethod}/${register}/${typePaymentResponsibility}`,
        });

        const response = await this.commonService.payPlaceToPay(idDevice, referenceId, registerPlaceToPayDto);

        //Cuando el provehedor responde el estado correcto
        if (response && response['errorCode'] === ErrorCode.NONE) {
            // Esperamos 3 minutos para verificar si se realizo el PAGO, si el pago se hizo antes en respuesta al
            // webhook ya se responde al cliente antes, caso contrario se verifica la transaccion antes de reversar
            setTimeout(async () => {
                const checkboxCheck = await this.checkboxRepository.findOne({ where: { id: checkbox.id } });
                if (!checkboxCheck) return;
                if (checkboxCheck.statusPayment === StatusPayment.PAID) {
                    return this.logger.log('Se pago correctamente con pay to pay 3 minutos');
                }
                this.logger.warn('No se pago en 5 minutos se liberaron los checkbox');
                this._saveResponsePay(idDevice, checkbox, StatusMoment.RESPONSE, StatusPayment.ERROR);
                this._notifyChageStatus(userId, StatusPayment.ERROR, checkbox);
            }, this.timerMinutePlaceToPay);
            return { errorCode: ErrorCode.NONE, deeplink: response['deeplink'] };
        } else {
            this._saveResponsePay(idDevice, checkbox, StatusMoment.RESPONSE, StatusPayment.ERROR);
            this._notifyChageStatus(userId, StatusPayment.ERROR, checkbox);
            return { errorCode: ErrorCode.RESPONSE };
        }
    }

    async onResponsePay(idDevice: string, userId: number, checkboxId: number, typePaymentMethod: number, register: string, typePaymentResponsibility: TypePaymentResponsibility) {

        let checkbox = await this.checkboxRepository.findOne({ where: { id: checkboxId } });
        if (!checkbox) {
            return { errorCode: ErrorCode.NOT_FOUND };
        }
        const { amount } = checkbox;

        if (checkbox.statusPayment === StatusPayment.WAITING) {

            await this._saveResponsePay(idDevice, checkbox, StatusMoment.LISTENING, StatusPayment.PAID);
            await this._notifyChageStatus(userId, StatusPayment.PAID, checkbox);

            return { errorCode: ErrorCode.NONE };
        }
        return { errorCode: ErrorCode.NOT_FOUND };
    }

    async onResponsePayError(idDevice: string, userId: number, checkboxId: number, typePaymentMethod: number, register: string, typePaymentResponsibility: TypePaymentResponsibility) {

        const checkbox = await this.checkboxRepository.findOne({ where: { id: checkboxId } });
        if (!checkbox) {
            return { errorCode: ErrorCode.NOT_FOUND };
        }

        await this._saveResponsePay(idDevice, checkbox, StatusMoment.RESPONSE, StatusPayment.ERROR);
        await this._notifyChageStatus(userId, StatusPayment.ERROR, checkbox);
        return { errorCode: ErrorCode.NONE };
    }

}
