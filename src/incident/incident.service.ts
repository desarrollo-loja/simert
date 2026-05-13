import { Inject, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Incident } from 'src/admin/incident/entities/incident.entity';
import { GimService } from 'src/api/gim/gim.service';
import { RegisterDepositGimDto } from 'src/common/dto/register-deposit-gim.dto';
import { ErrorCode } from 'src/common/glob/error';
import { StatusPayment } from 'src/common/glob/status/status_payment';
import { IncidentStatus } from 'src/common/glob/type/type_incident';
import { Repository } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';


@Injectable()
export class IncidentService {

    constructor(
        @InjectRepository(Incident)
        private readonly incidentRepository: Repository<Incident>,

        @Inject(GimService)
        private readonly gimService: GimService,
    ) { }

    private readonly logger = new Logger('IncidentService');
    private readonly intervalValidateIncident: number = parseInt(process.env.INTERVAL_VALIDATE_INCIDENT_MS || '') || 1000 * 60 * 2;

    async onModuleInit() {
        this.logger.verbose('start call onModuleInit');

        // Valida los incidents que fueron emitidos en GIM pero aún no tienen depósito registrado
        setInterval(() => this._validateIncidentEmitAndPay(), this.intervalValidateIncident);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Job: registra el depósito GIM de incidents SUPPLIED + PAID
    //
    // Agrupa por identityCard + transactionId y envía todos los bondIds del
    // grupo en una sola llamada al GIM (de más antiguo a más nuevo).
    // Siempre se guarda onResponseExternal en cada incident del grupo.
    // ─────────────────────────────────────────────────────────────────────────
    private async _validateIncidentEmitAndPay() {

        //validamos que caja este abierta
        const openTill = await this.gimService.validateOpenTill();
        if (openTill.errorCode !== ErrorCode.NONE) return openTill;

        const idDevice = uuidv4();
        try {
            const incidents = await this.incidentRepository.find({
                where: {
                    statusIncident: IncidentStatus.SUPPLIED,
                    statusPayment: StatusPayment.PAID,
                },
                order: { register: 'ASC' },
            });

            if (!incidents.length) return;

            // Agrupar por identityCard + transactionId para enviar un bloque de las que se pagaron
            const groups = incidents.reduce(
                (acc: Record<string, Incident[]>, incident) => {
                    const key = `${incident.identityCard}|${incident.transactionId}`;
                    if (!acc[key]) acc[key] = [];
                    acc[key].push(incident);
                    return acc;
                },
                {}
            );


            for (const [key, group] of Object.entries(groups)) {
                try {
                    const deposit = await this._registerDeposit(group);

                    for (const incident of group) {
                        incident.onResponseExternal = incident.onResponseExternal ?? [];

                        if (deposit.dataDeposit) {
                            if (incident.onResponseExternal.length >= 20) {
                                incident.onResponseExternal.pop();
                            }
                            incident.onResponseExternal.push(deposit.dataDeposit);
                        }

                        if (deposit.errorCode === ErrorCode.NONE) {
                            incident.statusIncident = IncidentStatus.PAYED;
                        } else {
                            this.logger.warn(`[Depósito fallido] grupo ${key} incident ${incident.id}: ${deposit.message}`);
                        }

                        await this.incidentRepository.save(incident);
                    }

                } catch (err) {
                    this.logger.error(`[Job GIM] Error grupo ${key}: ${err.message}`);
                }
            }

        } catch (error) {
            this.logger.error(`Call _validateIncidentEmitAndPay err: ${error.message}`);
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Registra el depósito en el GIM con todos los bondIds del grupo
    // ─────────────────────────────────────────────────────────────────────────
    private async _registerDeposit(group: Incident[]) {
        const { identityCard, transactionId } = group[0];

        //control para evitar errores de decimales
        const amount = group.reduce((acc, i) => {
            return acc + Number(i.amount) * 100;
        }, 0) / 100;

        const bondIds = group.map((i) => i.bondId);

        const registerDepositGimDto: RegisterDepositGimDto = {
            amount: amount.toFixed(2),
            identificationNumber: identityCard,
            bondIds,
            paymentDate: new Date().toLocaleDateString('en-CA', { timeZone: 'America/Guayaquil' }),
            transactionId,
        };

        const response = await this.gimService.registerDeposit(registerDepositGimDto);

        if (response.errorCode !== ErrorCode.NONE) {
            this.logger.error(`[_registerDepositIncident] Error depósito grupo ${identityCard}|${transactionId}: ${response.data?.message}`);
            return { errorCode: ErrorCode.NOT_VALID, dataDeposit: response.data, message: 'No se pudo registrar el depósito' };
        }

        return { errorCode: ErrorCode.NONE, dataDeposit: response.data, message: 'Depósito correcto' };
    }
}
