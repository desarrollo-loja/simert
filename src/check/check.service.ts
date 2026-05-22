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

@Injectable()
export class CheckService {

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
    ) { }

    private readonly logger = new Logger('CheckService');
    private readonly intervalTransferCheck: number = parseInt(process.env.INTERVAL_TRANSFER_CHECK_MS || '') || 1000 * 60 * 1; //por defecto un minuto
    private readonly intervalValidateCheckbox: number = parseInt(process.env.INTERVAL_VALIDATE_CHECKBOX_MS || '') || 1000 * 60 * 2; //por defecto 3 minutos
    private readonly timeCacheBlockOperator = 60 * (Number(process.env.TIME_CACHE_BLOCK_OPERATOR) || 5);
    private readonly catalogs: Map<string, any> = new Map();

    async onModuleInit() {
        this.logger.verbose('start call onModuleInit');

        try {
            const all = await this.catalogRepository.find();
            for (const catalog of all) {
                this.catalogs.set(catalog.name, catalog.data);
            }
            this.logger.log(`Catalogs loaded in memory: ${this.catalogs.size}`);
        } catch (error) {
            this.logger.error(`onModuleInit: error loading catalogs - ${error.message}`);
        }

        //Validaras las fracciones que estan por vencerse
        setInterval(() => this._transferCheck(), this.intervalTransferCheck);

        //Validaras los checkboxes que estan por vencerse que se hayan pagado internamnete pero no en el municipio
        setInterval(() => this._validateCheckboxToEmitAndPay(), this.intervalValidateCheckbox);
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

    // ─────────────────────────────────────────────────────────────────────────
    // Monitorea fracciones próximas a caducar y notifica al usuario
    // ─────────────────────────────────────────────────────────────────────────
    private async _transferCheck(): Promise<void> {
        try {
            const fractions = await this.dataSource.query(`
            SELECT id, "userId", "statusId", "blockId"
            FROM fraction
            WHERE
            "statusId" = ${StatusFraction.NEXT_TO_EXCEEDED_TIME} OR ("statusId" < ${StatusFraction.EXCEEDED_TIME} AND (NOW() AT TIME ZONE 'America/Guayaquil') + INTERVAL '3 MINUTE' > "departureDate")
            AND "statusId" < ${StatusFraction.SANCTIONED}
            AND "statusId" != ${StatusFraction.FINISHED_BY_OPERATOR}
          `);

            for (const fraction of fractions) {
                const { id, userId, statusId, blockId } = fraction;
                if (statusId < StatusFraction.NEXT_TO_EXCEEDED_TIME) {
                    await this.fractionRepository
                        .createQueryBuilder()
                        .update()
                        .set({ status: { id: StatusFraction.NEXT_TO_EXCEEDED_TIME } })
                        .whereInIds(id)
                        .execute();
                    this._notifyChangeStatus(userId, StatusFraction.NEXT_TO_EXCEEDED_TIME, id);
                    this._notifyBlockOperators(blockId, StatusFraction.NEXT_TO_EXCEEDED_TIME, id);
                } else {
                    const shouldUpdate = await this.fractionRepository
                        .createQueryBuilder()
                        .where({ id })
                        .andWhere(`((NOW() AT TIME ZONE 'America/Guayaquil') - INTERVAL '1 MINUTE' > "departureDate")`)
                        .getCount() > 0;
                    if (shouldUpdate) {
                        await this.fractionRepository
                            .createQueryBuilder()
                            .update()
                            .set({ status: { id: StatusFraction.EXCEEDED_TIME } })
                            .whereInIds(id)
                            .execute();
                        this._notifyChangeStatus( userId, StatusFraction.EXCEEDED_TIME, id);
                        this._notifyBlockOperators( blockId, StatusFraction.EXCEEDED_TIME, id);
                    }
                }
            }
        } catch (err) {
            this.logger.error(`Call _transferCheck err: ${err}`);
        }
    }

    private async _notifyBlockOperators(blockId: number, statusFraction: StatusFraction, fractionId: number) {
        const cacheKey = `BLOCK_OPERATORS:${blockId}`;
        const secondsCache = this.timeCacheBlockOperator;

        let blockOperators: BlockOperator[] = await this.commonCacheService.get(cacheKey) as BlockOperator[];

        // On a cache miss, load the block's active operators and cache the result.
        if (!blockOperators) {
            blockOperators = await this.blockOperatorRepository.createQueryBuilder('bo')
                .select(['bo.id', 'bo.userId'])
                .where('bo.blockId = :blockId', { blockId })
                .andWhere(`DATE(bo.from) <= DATE(NOW() AT TIME ZONE 'America/Guayaquil') AND DATE(bo.to) >= DATE(NOW() AT TIME ZONE 'America/Guayaquil')`)
                .getMany();

            await this.commonCacheService.set(cacheKey, blockOperators, secondsCache);
        }

        for (const operator of blockOperators) {
            this._notifyChangeStatus(operator.userId, statusFraction, fractionId.toString());
        }
    }

    private async _notifyChangeStatus(userId: number, status: number, ids: string) {
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
    // Job cada 10 min: completa el ciclo GIM de checkboxes con pago PAID
    //
    // statusIncident null | ENTERED → emitir título de crédito + registrar depósito
    // statusIncident SUPPLIED       → solo registrar depósito
    // cualquier otro estado         → marcar statusPayment = ERROR
    //
    // Siempre se guarda onResponseExternal al finalizar cada checkbox.
    // ─────────────────────────────────────────────────────────────────────────
    private async _validateCheckboxToEmitAndPay() {

        //validamos que caja este abierta
        const openTill = await this.gimService.validateOpenTill();
        if (openTill.errorCode !== ErrorCode.NONE) return openTill;

        try {

            //Buscamos todas las pagadas y los estados de la incidencia pendintes
            const checkboxes: Checkbox[] = await this.checkboxRepository.find({
                where: [
                    { statusPayment: StatusPayment.PAID, statusIncident: IsNull() },
                    { statusPayment: StatusPayment.PAID, statusIncident: IncidentStatus.ENTERED },
                    { statusPayment: StatusPayment.PAID, statusIncident: IncidentStatus.APPROVED },
                    { statusPayment: StatusPayment.PAID, statusIncident: IncidentStatus.SUPPLIED },
                ],
                order: { register: 'ASC' },
            });

            if (!checkboxes.length) return;

            for (const checkbox of checkboxes) {
                try {

                    checkbox.onResponseExternal = checkbox.onResponseExternal ?? [];
                    const { statusIncident } = checkbox;

                    switch (statusIncident) {

                        //no se emitio ni se registro deposito
                        case null:
                        case IncidentStatus.ENTERED:
                        case IncidentStatus.APPROVED:
                            // Emitir título de crédito
                            const emision = await this._emitCreditCard(checkbox);

                            //guardamos la respuesta de la emision
                            this.addResponse(checkbox.onResponseExternal, emision.dataEmision);

                            if (emision.errorCode !== ErrorCode.NONE) {
                                this.logger.warn(`[Emisión fallida] checkbox ${checkbox.id}: ${emision.message}`);
                                await this.checkboxRepository.save(checkbox);
                                continue;
                            }

                            checkbox.statusIncident = IncidentStatus.SUPPLIED;

                            // Registrar depósito
                            const deposit = await this._registerDeposit(checkbox);
                            this._applyDepositOutcome(checkbox, deposit);
                            break;

                        case IncidentStatus.SUPPLIED:
                            // Ya fue emitido → solo registrar depósito
                            const depositSupplied = await this._registerDeposit(checkbox);
                            this._applyDepositOutcome(checkbox, depositSupplied);
                            break;

                        default:
                            // Estado inesperado → marcar como error
                            this.logger.warn(`[Estado inválido] checkbox ${checkbox.id} statusIncident=${statusIncident}`);
                            // checkbox.statusPayment = StatusPayment.ERROR;
                            break;
                    }

                    await this.checkboxRepository.save(checkbox);

                } catch (err) {
                    this.logger.error(`[Job GIM] Error checkbox ${checkbox.id}: ${err.message}`);
                }
            }

        } catch (error) {
            this.logger.error(`Call _validateCheckboxToEmitAndPay err: ${error.message}`);
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
     */
    private _applyDepositOutcome(
        checkbox: Checkbox,
        deposit: { errorCode: number; dataDeposit: any; message?: string },
    ): void {
        //guardamos la respuesta del deposito
        this.addResponse(checkbox.onResponseExternal, deposit.dataDeposit);

        if (deposit.errorCode === ErrorCode.NONE) {
            checkbox.statusIncident = IncidentStatus.PAYED;
        } else {
            this.logger.warn(`[Depósito fallido] checkbox ${checkbox.id}: ${deposit.message}`);
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Resuelve el residentId del cliente en el GIM y emite el título de crédito
    // ─────────────────────────────────────────────────────────────────────────
    private async _emitCreditCard(checkbox: Checkbox) {
        const { userId, identityCard, transactionId } = checkbox;
        let residentId: number = null;

        // 1) Buscar residentId en nuestra BD
        const user = await this.commonAuthService.filterByIdentityCard(userId, identityCard);
        if (user.errorCode === ErrorCode.NONE) {
            residentId = user.data?.residentId ?? null;
        }

        // 2) Si no está en nuestra BD, buscar en el GIM
        if (!residentId) {
            const userGim = await this.gimService.getUserByIdentityCardGim(identityCard);
            if (userGim.errorCode === ErrorCode.NONE) {
                residentId = userGim.taxpayer?.id ?? null;
            }
        }

        // 3) Si no existe en el GIM, crear el cliente
        if (!residentId) {
            const createClientGimDto: CreateClientGimDto = {
                controllerId: userId,
                identityCard,
                firstName: user.data?.firstName,
                lastName: user.data?.lastName,
                emailClient: user.data?.email,
            };
            const createUserGim = await this.gimService.createNewNaturalPersonGim(createClientGimDto);
            if (createUserGim.errorCode === ErrorCode.NONE) {
                residentId = createUserGim.residentDTO?.id ?? null;
                this.commonAuthService.updateResidentId(userId, identityCard, residentId);
            }
        }

        if (!residentId) {
            return { errorCode: ErrorCode.NOT_VALID, dataEmision: null, message: 'No se pudo verificar la información del cliente en el GIM' };
        }

        // 4) Emitir el título de crédito
        const { entryCode } = this._buildRubroOptionalData();
        const emisionCreditCard: EmissionCreditCardDto = {
            entryCode,
            residentId,
            description: 'Compra de Tarjeta de parking',
            reference: transactionId,
            quantity: 1,
        };

        const emision = await this.gimService.emissionTitleCreditCard(emisionCreditCard);

        if (emision.errorCode !== ErrorCode.NONE) {
            this.logger.error(`[_emitCreditCard] Error generando título checkbox ${checkbox.id}: ${emision.data?.message}`);
            return { errorCode: ErrorCode.NOT_VALID, dataEmision: emision.data, message: 'No se pudo generar el título de crédito' };
        }

        return { errorCode: ErrorCode.NONE, dataEmision: emision.data, message: 'Emisión correcta' };
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Registra el depósito en el GIM usando el bondId de la emisión previa
    // ─────────────────────────────────────────────────────────────────────────
    private async _registerDeposit(checkbox: Checkbox) {
        const { amount, identityCard, transactionId } = checkbox;

        const onResponseExternal = Array.isArray(checkbox.onResponseExternal)
            ? checkbox.onResponseExternal
            : [];
        const bondEntry = onResponseExternal.find((item: any) => item?.bondId != null);

        if (!bondEntry) {
            this.logger.error(`No se encontró bondId en onResponseExternal para la transacción ${transactionId}`);
            return { errorCode: ErrorCode.NOT_VALID, dataDeposit: null, message: 'No se encontró bondId para registrar el depósito' };
        }

        const registerDepositGimDto: RegisterDepositGimDto = {
            amount,
            identificationNumber: identityCard,
            bondIds: [bondEntry?.bondId],
            paymentDate: new Date().toISOString().split('T')[0],
            transactionId,
        };

        const response = await this.gimService.registerDeposit(registerDepositGimDto);

        if (response.errorCode !== ErrorCode.NONE) {
            this.logger.error(`[_registerDepositCheck] Error depósito checkbox ${checkbox.id}: ${response.data?.message}`);
            return { errorCode: ErrorCode.NOT_VALID, dataDeposit: response.data, message: 'No se pudo registrar el depósito' };
        }

        return { errorCode: ErrorCode.NONE, dataDeposit: response.data, message: 'Depósito correcto' };
    }

    private addResponse(list: any[], item: any) {
        if (!item) return;

        //verificamos si no existe una respesta igual
        const itemKey = JSON.stringify(item);
        const existingIndex = list.findIndex(existing => JSON.stringify(existing) === itemKey);
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
