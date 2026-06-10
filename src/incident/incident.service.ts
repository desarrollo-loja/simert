import { Inject, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Incident } from 'src/admin/incident/entities/incident.entity';
import { GimService } from 'src/api/gim/gim.service';
import { CommonService } from 'src/common/common.service';
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
   * Creates the incident service with its repository and GIM integration.
   *
   * @param incidentRepository Repository used to read and persist incidents.
   * @param gimService Service used to validate the till and register GIM deposits.
   * @param commonService Shared service used to sync GIM responses to simert-pay.
   */
  constructor(
    @InjectRepository(Incident)
    private readonly incidentRepository: Repository<Incident>,

    @Inject(GimService)
    private readonly gimService: GimService,

    @Inject(CommonService)
    private readonly commonService: CommonService,
  ) {}

  private readonly logger = new Logger('IncidentService');
  private readonly intervalValidateIncident: number =
    parseInt(process.env.INTERVAL_VALIDATE_INCIDENT_MS || '') || 1000 * 60 * 2;

  /**
   * Lifecycle hook that schedules the periodic incident validation job.
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
   * Validates incidents emitted in GIM that are paid but pending deposit,
   * groups them, registers the GIM deposit and updates their status.
   *
   * @returns Promise resolving to the open-till validation result when the till is closed, otherwise nothing.
   */
  private async _validateIncidentEmitAndPay() {
    // Validate that the cashier window is open in GIM before proceeding
    const openTill = await this.gimService.validateOpenTill();
    this.logger.log(
      `[Job GIM] validateOpenTill -> errorCode=${openTill.errorCode} message=${openTill.message}`,
    );
    if (openTill.errorCode !== ErrorCode.NONE) {
      this.logger.warn(
        `[Job GIM] abortado: caja GIM no disponible (errorCode=${openTill.errorCode})`,
      );
      return openTill;
    }

    try {
      const incidents = await this.incidentRepository.find({
        where: {
          statusIncident: IncidentStatus.SUPPLIED,
          statusPayment: StatusPayment.PAID,
        },
        order: { register: 'ASC' },
      });

      this.logger.log(
        `[Job GIM] incidentes pendientes de depósito: ${incidents.length}`,
      );
      if (!incidents.length) return;

      // Group by identityCard + transactionId to send a block of the paid incidents
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

            if (incident.statusIncident === IncidentStatus.PAYED) {
              await this.commonService.syncOnResponseExternal(
                incident.transactionId,
                incident.onResponseExternal,
              );
            }
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
   * Registers a GIM deposit for a group of incidents sharing identity card
   * and transaction, sending all their bond IDs in a single call.
   *
   * @param group Incidents belonging to the same identity card and transaction.
   * @returns Promise resolving to the deposit result with error code, deposit data and a message.
   */
  private async _registerDeposit(group: Incident[]) {
    const { identityCard, transactionId } = group[0];

    // Guard against floating-point rounding errors
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
