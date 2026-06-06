import { Inject, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Incident } from 'src/admin/incident/entities/incident.entity';
import { GimService } from 'src/api/gim/gim.service';
import { RegisterDepositGimDto } from 'src/common/dto/register-deposit-gim.dto';
import { ErrorCode } from 'src/common/glob/error';
import { StatusPayment } from 'src/common/glob/status/status_payment';
import { IncidentStatus } from 'src/common/glob/type/type_incident';
import { Repository } from 'typeorm';

/**
 * Background service that monitors GIM-emitted incidents that have not yet
 * received a deposit confirmation. Runs on a configurable interval
 * (env `INTERVAL_VALIDATE_INCIDENT_MS`, default 2 min) and registers
 * pending deposits via {@link GimService}.
 */
@Injectable()
export class IncidentService {
  /**
   *
   * @param incidentRepository
   * @param gimService
   */
  constructor(
    @InjectRepository(Incident)
    private readonly incidentRepository: Repository<Incident>,

    @Inject(GimService)
    private readonly gimService: GimService,
  ) {}

  private readonly logger = new Logger('IncidentService');
  private readonly intervalValidateIncident: number =
    parseInt(process.env.INTERVAL_VALIDATE_INCIDENT_MS || '') || 1000 * 60 * 2;

  /**
   *
   */
  async onModuleInit() {
    this.logger.verbose('start call onModuleInit');

    // Validates incidents that were issued in GIM but have not yet received a deposit
    setInterval(
      () => this._validateIncidentEmitAndPay(),
      this.intervalValidateIncident,
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Job: registers the GIM deposit for incidents in SUPPLIED + PAID state.
  //
  // Groups by identityCard + transactionId and sends all bondIds for the
  // group in a single GIM call (oldest to newest).
  // onResponseExternal is persisted on every incident in the group.
  // ─────────────────────────────────────────────────────────────────────────
  /**
   *
   */
  private async _validateIncidentEmitAndPay() {
    // Validate that the cashier window is open in GIM before proceeding
    const openTill = await this.gimService.validateOpenTill();
    if (openTill.errorCode !== ErrorCode.NONE) return openTill;

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
        {},
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
              this.logger.warn(
                `[Depósito fallido] grupo ${key} incident ${incident.id}: ${deposit.message}`,
              );
            }

            await this.incidentRepository.save(incident);
          }
        } catch (err) {
          this.logger.error(`[Job GIM] Error grupo ${key}: ${err.message}`);
        }
      }
    } catch (error) {
      this.logger.error(
        `Call _validateIncidentEmitAndPay err: ${error.message}`,
      );
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Registers the GIM deposit using all bondIds belonging to the group
  // ─────────────────────────────────────────────────────────────────────────
  /**
   *
   * @param group
   */
  private async _registerDeposit(group: Incident[]) {
    const { identityCard, transactionId } = group[0];

    //control para evitar errores de decimales
    const amount =
      group.reduce((acc, i) => {
        return acc + Number(i.amount) * 100;
      }, 0) / 100;

    const bondIds = group.map((i) => i.bondId);

    const registerDepositGimDto: RegisterDepositGimDto = {
      amount: amount.toFixed(2),
      identificationNumber: identityCard,
      bondIds,
      paymentDate: new Date().toLocaleDateString('en-CA', {
        timeZone: 'America/Guayaquil',
      }),
      transactionId,
    };

    const response = await this.gimService.registerDeposit(
      registerDepositGimDto,
    );

    if (response.errorCode !== ErrorCode.NONE) {
      this.logger.error(
        `[_registerDepositIncident] Error depósito grupo ${identityCard}|${transactionId}: ${response.data?.message}`,
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
}
