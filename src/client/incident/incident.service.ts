import { BadRequestException, Inject, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import axios, { AxiosRequestConfig } from 'axios';
import { Fraction } from 'src/admin/fraction/entities/fraction.entity';
import { FractionStatus } from 'src/admin/fraction_status/entities/fraction_status.entity';
import { Incident } from 'src/admin/incident/entities/incident.entity';
import { CreateIncidentPaymentDto } from 'src/admin/incident-payment/dto/create.incident-payment.dto';
import { IncidentPayment } from 'src/admin/incident-payment/entities/incident-payment.entity';
import { IncidentType } from 'src/admin/incident-type/entities/incident-type.entity';
import { Slot } from 'src/admin/slot/entities/slot.entity';
import { DinardapAntService } from 'src/api/dinardap-ant/dinardap-ant.service';
import { CreateGimDto } from 'src/api/gim/dto/create-gim.dto';
import { GimService } from 'src/api/gim/gim.service';
import { Obligation } from 'src/api/gim/interfaces/gim-responses.interfaces';
import { CommonAntService } from 'src/common/common.ant.service';
import { CommonAuthService } from 'src/common/common.auth.service';
import { CommonCacheService } from 'src/common/common.cache.service';
import { CommonGimService } from 'src/common/common.gim.service';
import { CommonService } from 'src/common/common.service';
import { BillingDataDto } from 'src/common/dto/billing-data.dto';
import { CreateClientGimDto } from 'src/common/dto/create-client-gim.dto';
import { CreateNotificationDto } from 'src/common/dto/create-notification.dto';
import { DebitAmounDto } from 'src/common/dto/debit-amoun.dto';
import { PurchaseDataDto } from 'src/common/dto/purchase-data.dto';
import { RegisterAhoritaDto } from 'src/common/dto/register-ahorita.dto';
import { RegisterDepositGimDto } from 'src/common/dto/register-deposit-gim.dto';
import { RegisterDeunaDto } from 'src/common/dto/register-deuna.dto';
import { RegisterPlaceToPayDto } from 'src/common/dto/register-place-to-pay.dto';
import handleDbExceptions from 'src/common/exceptions/error.db.exception';
import { ErrorCode } from 'src/common/glob/error';
import { IdTransactionReason } from 'src/common/glob/id/id_transaction_reason';
import { StatusFraction } from 'src/common/glob/status/status_fraction';
import { StatusMoment } from 'src/common/glob/status/status_moment';
import { StatusPayment } from 'src/common/glob/status/status_payment';
import { StatusSlot } from 'src/common/glob/status/status_slot';
import { SystemConfigKey } from 'src/common/glob/system-config-key';
import { IncidentCategory, IncidentStatus } from 'src/common/glob/type/type_incident';
import { TypeNotification } from 'src/common/glob/type/type_notification';
import { TypePaymentMethod } from 'src/common/glob/type/type_payment_method';
import { TypePaymentResponsibility } from 'src/common/glob/type/type_payment_responsibility';
import { TypeService } from 'src/common/glob/type/type_service';
import { Fine, FinesResponse } from 'src/common/intefaces/fine.interface';
import { OptionalDataInterface } from 'src/common/intefaces/optional-data.interface';
import { DataSource, In, Repository } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';

import { CreateIncidentDto } from './dto/create-incident.dto';
import { GetIncidentDto } from './dto/get-incident.dto';
import { PayIncidentDto } from './dto/pay-incident.dto';
import { UpdateIncidentDto } from './dto/update-incident.dto';

/**
 * Service that drives the client-facing incident (sanction) flow:
 * lookup by plate or identity card, fines payment dispatching to the
 * external providers (DeUna / Ahorita / PlaceToPay) and post-payment
 * synchronization with GIM.
 *
 * Persists to `public.incident` and `public."incidentPayment"`.
 */
@Injectable()
export class IncidentService {
  private readonly logger = new Logger(IncidentService.name);

  private readonly antBaseUrl = process.env.ANT_BASE_URL; // e.g. https://ant.your-domain.com
  private readonly antApiKey = process.env.ANT_API_KEY;   // if applicable
  private readonly gimBaseUrl = process.env.GIM_BASE_URL;
  private readonly gimApiKey = process.env.GIM_API_KEY;
  private readonly domainSimert: string = process.env.DOMINIO_SIMERT;
  private readonly timerMinuteDeuna: number = 1000 * 60 * Number(process.env.TIMER_MINUTE_DEUNA);

  constructor(
    @InjectRepository(Incident)
    private readonly incidentRepository: Repository<Incident>,

    @InjectRepository(IncidentType)
    private readonly incidentTypeRepository: Repository<IncidentType>,

    @InjectRepository(IncidentPayment)
    private readonly incidentPaymentRepository: Repository<IncidentPayment>,

    @InjectRepository(Fraction)
    private readonly fractionRepository: Repository<Fraction>,

    @InjectRepository(FractionStatus)
    private readonly fractionStatusRepository: Repository<FractionStatus>,

    @InjectRepository(Slot)
    private readonly slotRepository: Repository<Slot>,

    @Inject(CommonAntService)
    private readonly commonAntService: CommonAntService,

    @Inject(CommonGimService)
    private readonly commonGimService: CommonGimService,

    @Inject(CommonService)
    private readonly commonService: CommonService,

    private readonly commonCacheService: CommonCacheService,

    private readonly dinardapAntService: DinardapAntService,

    private readonly gimService: GimService,

    private readonly dataSource: DataSource,

    private readonly commonAuthService: CommonAuthService,
  ) { }

  /**
   * Creates a new incident record, enriching it with ANT vehicle data when a plate
   * is provided, and transitions the linked fraction to SANCTIONED status.
   *
   * @param userId Authenticated user id creating the incident.
   * @param idDevice Device identifier.
   * @param createIncidentDto Incident payload including type, plate and location.
   * @returns Error-code envelope with the persisted {@link Incident}.
   */
  async create(userId: number, idDevice: string, createIncidentDto: CreateIncidentDto) {
    try {
      const { fractionId, incidentCategory, incidentTypeId } = createIncidentDto;

      // 1) Query ANT by plate and set emailClient, fullNameClient, identityCard
      const plate = (createIncidentDto.plate ?? '').trim();
      let antEmailClient: string = null;
      let antFullNameClient: string = null;
      let antIdentityCard: string = null;

      if (plate) {
        const antResult = await this.dinardapAntService.getUserDataByPlateAnt(plate);
        if (antResult.errorCode === ErrorCode.NONE) {
          antEmailClient = antResult.data.email || null;
          antFullNameClient = antResult.data.fullName || null;
          antIdentityCard = antResult.data.identityCard || null;
        }
      }

      let amount: string = null;
      const optionalData = [...(createIncidentDto.optionalData ?? [])];

      // Calculate the incident amount
      if (incidentCategory === IncidentCategory.NOTIFICATION) {

        const queryTypeIncident = await this.incidentTypeRepository.findOne({
          where: { id: incidentTypeId, },
        });
        if (!queryTypeIncident) {
          throw new BadRequestException('Tipo de incidente no encontrado');
        }

        const salaryBasic = await this.commonCacheService.getSalary();

        amount = ((Number(queryTypeIncident.percentage) * salaryBasic.salary) / 100).toFixed(2);
        optionalData.push({ key: SystemConfigKey.BASIC_SALARY, value: salaryBasic.salary });
      }

      // 2) Create and save the incident (same flow)

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
        emailClient: createIncidentDto.emailClient || antEmailClient,
        fullNameClient: createIncidentDto.fullNameClient || antFullNameClient,
        identityCard: createIncidentDto.identityCard || antIdentityCard,
      });

      const savedIncident = await this.incidentRepository.save(incident);

      // Change the fraction status to SANCTIONED
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

        await this._saveSatusFraction(queryFraction, StatusFraction.SANCTIONED, StatusMoment.NOTIFIED);
        await this._notifyChageStatusFraction(queryFraction.userId, StatusFraction.SANCTIONED, fractionId);

        await this.slotRepository.update(queryFraction.slot.id, {
          status: StatusSlot.SANCTIONED,
        });

      }

      return { incident: savedIncident, errorCode: ErrorCode.NONE };
    } catch (error) {
      handleDbExceptions(error, this.logger);
    }
  }

  private async _getEmailFromAntByPlate(plate: string): Promise<string | null> {
    if (!this.antBaseUrl) {
      this.logger.error('ANT_BASE_URL is missing in env vars');
      return null;
    }

    try {
      const config: AxiosRequestConfig = {
        method: 'get',
        url: `${this.antBaseUrl}/tu-endpoint/por-placa`, // <-- AJUSTA ESTA RUTA
        params: { plate },
        timeout: 15000,
        headers: {
          ...(this.antApiKey ? { 'x-api-key': this.antApiKey } : {}),
        },
      };

      const { data } = await axios.request(config);

      // Adjust the real path according to the ANT response
      // Common examples:
      // const email = data?.email;
      // const email = data?.data?.email;
      // const email = data?.owner?.email;
      const email: string | undefined =
        data?.email ?? data?.data?.email ?? data?.client?.email;

      if (!email) return null;

      return String(email).trim();
    } catch (error: any) {
      this.logger.error(
        `ANT lookup failed for plate=${plate}: ${error?.message ?? error}`,
      );
      return null; // Do not break the flow if ANT fails
    }
  }

  /**
   * Queries GIM for outstanding fines matching the given plate or identity card.
   *
   * @param plate Vehicle plate number (optional if identityCard is provided).
   * @param identityCard Owner's identity card number (optional if plate is provided).
   * @returns Outstanding fines summary with totals.
   * @throws BadRequestException when neither plate nor identityCard is supplied.
   */
  async checkMyFractionsOutstanding(plate?: string, identityCard?: string,): Promise<FinesResponse> {

    if (!plate && !identityCard) {
      throw new BadRequestException('Debe enviar plate o identityCard');
    }

    try {
      // They always receive identity card; if some resource has no identity card
      // we need to consult ANT first to extract it via the plate and send it in identityCard.
      // Either one may be empty; we control that here and send only one of them.

      const config: AxiosRequestConfig = {
        method: 'get', // or 'post' if GIM requires it
        url: `${this.gimBaseUrl}/fines/outstanding`,
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.gimApiKey,
        },
        params: { plate, identityCard },
        timeout: 15000,
      };

      const dataresponseTest = {
        "errorCode": 0,
        "total": 2,
        "fines": [
          {
            "fineId": "9981",
            "registerDate": "2026-01-10T12:00:00.000Z",
            "status": "PENDIENTE",
            "titleNumber": "T-991882",
            "amount": 10.50,
            "plate": "ABC123",
          },
          {
            "fineId": "9982",
            "registerDate": "2026-01-15T09:30:00.000Z",
            "status": "PENDIENTE",
            "titleNumber": "T-991883",
            "amount": 200,
            "plate": "ABC123",
          }
        ]
      }

      return dataresponseTest;

      const response = await axios.request(config);
      const data = response.data;

      const finesRaw: any[] = Array.isArray(data?.fines)
        ? data.fines
        : Array.isArray(data)
          ? data
          : [];

      const fines: Fine[] = finesRaw.map((f: any) => ({
        fineId: String(f.idMulta ?? f.id ?? ''),
        registerDate: String(f.fechaRegistro ?? f.createdAt ?? ''),
        status: String(f.estado ?? f.status ?? ''),
        titleNumber: String(f.numeroTitulo ?? f.titleNumber ?? ''),
        amount: Number(f.importe ?? f.amount ?? 0),
        plate: String(f.placa ?? f.plate ?? ''),
      }));

      return {
        total: fines.length,
        fines,
        errorCode: ErrorCode.NONE
      };

    } catch (error) {
      this.logger.error(
        `Error consultando GIM: ${JSON.stringify(error.response?.data || error.message)}`,
      );
      handleDbExceptions(error, this.logger);

      // return { total: 0, fines: [] };
    }
  }

  /**
   * Returns all sanctions recorded against a given fraction.
   *
   * @param fractionId Primary key of the fraction to look up.
   * @returns Error-code envelope with `factionSanctions` raw rows and `currentDate`.
   */
  async findSanctionByFraction(fractionId: number) {

    try {
      const factionSanctions = await this.incidentRepository.createQueryBuilder('i')
        .select(['i.id AS id', 'i.description AS description', 'i.images AS images', 'i.plate AS plate', 'i.createdAt AS createdAt', 'it.name AS reason'])
        .innerJoin(IncidentType, 'it', 'it.id = i.incidentTypeId')
        .where('i.fractionId = :fractionId', { fractionId })
        .getRawMany();

      const currentDate = new Date();
      return { errorCode: ErrorCode.NONE, currentDate, factionSanctions };
    } catch (error) {
      handleDbExceptions(error, this.logger);
    }
  }

  /**
   * Finds pending sanctions by identity card, synchronizes them with GIM
   * (emitting obligations when not yet registered) and returns the updated list.
   *
   * @param userId Authenticated user id.
   * @param idDevice Device identifier used for GIM integration calls.
   * @param identityCard Owner's identity card to look up.
   * @param getIncidentDto Optional date-range filter.
   * @returns Error-code envelope with `incidents` and `currentDate`.
   */
  async findSanctionByIdentityCard(userId: number, idDevice: string, identityCard: string, getIncidentDto: GetIncidentDto) {

    try {

      // Validate that the till is open
      const openTill = await this.gimService.validateOpenTill();
      if (openTill.errorCode !== ErrorCode.NONE) return openTill;

      const tableName = 'public.incident';
      const currentDate = new Date();

      let params: any[] = [];
      let paramIndex = 1;

      const buildWhere = () => {

        // Only notifications that are fines
        let where = `WHERE i."incidentCategory" = $${paramIndex++}`;
        params.push(IncidentCategory.NOTIFICATION);

        // Not already paid at the municipality
        where += ` AND i."statusIncident" IN ($${paramIndex++}, $${paramIndex++}, $${paramIndex++})`;
        params.push(IncidentStatus.ENTERED, IncidentStatus.APPROVED, IncidentStatus.SUPPLIED);

        // Not paid internally either
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
        i."vehicleType" AS "vehicleType", i."code" AS "code",
        i."address" AS "address", i."optionalData" AS "optionalData",
        i."controllerId" AS "controllerId", i."onResponseExternal" AS "onResponseExternal",
        i."fullNameClient" AS "fullNameClient", i."emailClient" AS "emailClient",
        i."identityCard" AS "identityCard", i."commission" AS "commission", i."reference" AS "reference"
      FROM ${table} i
      INNER JOIN public."incidentType" it ON i."incidentTypeId" = it.id
    `;

      const query = `${baseSelect(tableName)} ${buildWhere()}`;

      const incidents: Incident[] = await this.incidentRepository.query(query, params);

      if (incidents.length === 0)
        return { errorCode: ErrorCode.NOT_FOUND, currentDate, incidents };

      // ResidentId is required for issuing the obligation
      const residentResult = await this._getResidentId(userId, idDevice, identityCard, incidents);
      if (!residentResult.residentId) {
        return { errorCode: ErrorCode.NOT_VALID, message: 'No se pudo verificar la información del cliente, por favor inténtelo más tarde' };
      }
      const residentId = residentResult.residentId; // GIM customer id
      const issued = []; // Track issued items to retrieve the amount to pay

      for (const incident of incidents) {

        // Check whether the debt was already issued in GIM and update the status
        const findObligation = await this.gimService.findObligationsByCitation(incident.nroTicket, incident.identityCard);
        if (findObligation.errorCode === ErrorCode.NONE) {
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

        // Create the debt in GIM

        const optionalData = this._formatOptionalData(incident.optionalData, residentId);

        const dto = new CreateGimDto();
        dto.nroTicket = incident.nroTicket;
        dto.identityCard = identityCard;
        dto.plate = incident.plate;
        dto.description = incident.description;
        dto.incidentTypeId = incident.incidentTypeId;
        dto.vehicleType = incident.vehicleType;
        dto.address = incident.address;
        dto.optionalData = optionalData;
        dto.controllerId = incident.controllerId;
        dto.createdAt = incident.register;
        dto.reference = incident.reference;

        const emitResult = await this.gimService.emitInfractionGim(dto);
        this.logger.debug('GIM obligation emission result', emitResult)
        if (emitResult.errorCode === ErrorCode.NONE) {
          issued.push({ incidenId: incident.id, nroTicket: incident.nroTicket, identityCard: identityCard });
          const onResponseExternal = this._formatOnExternalResponse(incident.onResponseExternal, emitResult.data);
          await this.incidentRepository.update(incident.id, {
            bondId: +emitResult.data.bondId,
            nroObligation: emitResult.data.bondNumber.toString(),
            statusIncident: IncidentStatus.SUPPLIED,
            optionalData,
            onResponseExternal
          });
          incident.onResponseExternal = onResponseExternal;
        } else return emitResult;
      }

      const incidentMap = new Map(
        incidents.map(i => [i.id, i])
      );

      await Promise.all(issued.map(async (issue) => {
        const incident = incidentMap.get(issue.incidenId);
        if (!incident) return;

        const findObligation = await this.gimService.findObligationsByCitation(issue.nroTicket, issue.identityCard);

        if (findObligation.errorCode === ErrorCode.NONE) {
          const onResponseExternal = this._formatOnExternalResponse(incident.onResponseExternal, findObligation.data);
          await this.incidentRepository.update(issue.incidenId, {
            amount: findObligation.data?.obligations?.[0]?.total || incident.amount,
            onResponseExternal
          });
          incident.onResponseExternal = onResponseExternal;
        } else return;
      }));

      // Re-query to return only those still in pending states
      const updatedIncidents = await this.incidentRepository.query(query, params);

      if (updatedIncidents.length === 0)
        return { errorCode: ErrorCode.NOT_FOUND, currentDate, incidents: updatedIncidents };

      return { errorCode: ErrorCode.NONE, currentDate, incidents: updatedIncidents };

    } catch (error) {
      this.logger.error(`GIM emit incident ${error?.message}`);
      handleDbExceptions(error, this.logger);
    }
  }

  private _formatOptionalData(optionalData: OptionalDataInterface[], residentId: number): OptionalDataInterface[] {
    const result = [...(optionalData ?? [])];
    const idx = result.findIndex(item => item.key === 'residentId');
    if (idx >= 0) return result;
    result.push({ key: 'residentId', value: residentId });
    return result;
  }

  private _formatOnExternalResponse(onResponseExternal: any[], onResponseExternalData: object): any[] {
    const result = [...(onResponseExternal ?? [])];
    if (onResponseExternalData) result.push(onResponseExternalData);
    return result;
  }

  private async _getResidentId(userId: number, idDevice: string, identityCard: string, incidents: Incident[]): Promise<{ residentId: number | null }> {
    let residentId: number = null;

    // 1) Check whether the user exists and already has residentId in our DB
    const user = await this.commonAuthService.filterByIdentityCard(userId, identityCard);
    const userFound = user.errorCode === ErrorCode.NONE;
    if (userFound) {
      residentId = user.data.residentId || null;
    }

    if (residentId) return { residentId };

    // 2) If residentId is not in our DB, search for it in GIM
    const userGim = await this.commonGimService.getUserByIdentificationNumber(idDevice, identityCard);
    if (userGim.errorCode === ErrorCode.NONE && userGim.data?.id) {
      residentId = userGim.data.id;
      // If the user already exists in our DB but didn't have residentId, persist it
      if (userFound) {
        this.commonAuthService.updateResidentId(userId, identityCard, residentId);
      }
      return { residentId };
    }

    // 3) If it doesn't exist in GIM, create it.
    // Use auth data when available, otherwise the incident's data.
    const incidentFallback = incidents?.[0];
    const fullName = userFound ? null : (incidentFallback?.fullNameClient || 'Usuario');
    const firstName = userFound ? user.data.firstName : fullName;
    const lastName = userFound ? user.data.lastName : fullName;
    const emailClient = userFound ? user.data.email : incidentFallback?.emailClient;

    const createClientGimDto: CreateClientGimDto = {
      controllerId: userId,
      identityCard,
      firstName,
      lastName,
      emailClient,
    };

    const createUserGim = await this.commonGimService.createClientGim(idDevice, createClientGimDto);
    if (createUserGim.errorCode === ErrorCode.NONE && createUserGim.data?.id) {
      residentId = createUserGim.data.id;
      if (userFound) {
        this.commonAuthService.updateResidentId(userId, identityCard, residentId);
      }
    } else {
      this.logger.warn(
        `_getResidentId: no se pudo crear cliente en GIM para identityCard=${identityCard}, ` +
        `userFound=${userFound}, createUserGim=${JSON.stringify(createUserGim)}`,
      );
    }

    return { residentId };
  }

  /**
   * Initiates payment for one or more incidents via the configured provider.
   * Creates an {@link IncidentPayment} batch, dispatches to the provider and
   * returns the provider deeplink.
   *
   * @param idDevice Device identifier originating the payment.
   * @param payIncidentDto Payment payload including incident ids, amount and billing data.
   * @returns Error-code envelope. On success returns `AWAITS_RESPONSE` with the payment record.
   */
  async pay(idDevice: string, payIncidentDto: PayIncidentDto) {

    // Validate that the till is open
    const openTill = await this.gimService.validateOpenTill();
    if (openTill.errorCode !== ErrorCode.NONE) return openTill;

    const { userId, transactionId, typePaymentMethod, optionalData, identityCard, credentialId, incidents, amount, billing_data } = payIncidentDto;

    let urlDeuna = '';
    let urlAhorita = '';
    let urlPlaceToPay = '';

    this.logger.debug('Entering pay function')
    this.logger.debug(payIncidentDto)

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

    // Check whether the user already has a previous transaction
    // let incidentPayment = await this.incidentPaymentRepository.findOne({ where: { transactionId } });

    // if (incidentPayment) {
    //   return { errorCode: ErrorCode.TRANSACTION_REPIT }
    // }

    let typePaymentResponsibility: TypePaymentResponsibility;

    try {
      const concept = await this._buildPaymentConcept(
        incidents.map(incident => incident.id),
        optionalData,
      );

      const ownerName = await this._getOwnerName(incidents[0].id);

      const codes = incidents
        .map(incident => (incident.code ?? '').trim())
        .filter(code => code.length > 0)
        .join(', ');

      const debitAmounDto = await this._parseDebitAmounDto(concept, payIncidentDto);

      // Verify

      const queryRunner = this.dataSource.createQueryRunner();

      try {

        await queryRunner.connect();
        await queryRunner.startTransaction();
        const register = this.commonService.getDate()

        const referenceId = uuidv4().replace(/-/g, '');

        const payments: CreateIncidentPaymentDto[] = incidents.map(incident => ({
          incidentId: incident.id,
          transactionId,
          typePaymentMethod,
          moment: StatusMoment.REQUESTED,
          statusPayment: StatusPayment.WAITING,
          referenceId,
          register,
          userId,
          amount: incident.amount,
          billing_data,
          optionalData: [{ key: 'register', value: incident.register }],
        }));

        await queryRunner.manager.insert(IncidentPayment, payments);

        switch (typePaymentMethod) {
          case TypePaymentMethod.DEUNAV2:

            const responseDeunaV2 = await this._payDeunaV2(idDevice, debitAmounDto, payIncidentDto, typePaymentResponsibility, referenceId, codes, ownerName);
            if (responseDeunaV2['errorCode'] === ErrorCode.NONE) {
              urlDeuna = responseDeunaV2['deeplink'];
              await queryRunner.manager.update(
                IncidentPayment,
                { referenceId },
                { url: urlDeuna }
              );
            } else {
              throw new Error('call buy TypePaymentMethod DeunaV2 not found');
            }
            break;

          case TypePaymentMethod.AHORITA:

            const responseAhorita = await this._payAhorita(idDevice, debitAmounDto, payIncidentDto, typePaymentResponsibility, referenceId, codes, ownerName);

            if (responseAhorita['errorCode'] === ErrorCode.NONE) {
              urlAhorita = responseAhorita['deeplink'];
              await queryRunner.manager.update(
                IncidentPayment,
                { referenceId },
                { url: urlAhorita }
              );
            } else {
              throw new Error('call buy TypePaymentMethod Ahorita not found');
            }
            break;

          case TypePaymentMethod.PLACE_TO_PAY:

            const responsePlaceToPay = await this._payPlaceToPay(idDevice, debitAmounDto, payIncidentDto, typePaymentResponsibility, referenceId, codes, ownerName);

            if (responsePlaceToPay['errorCode'] === ErrorCode.NONE) {
              urlPlaceToPay = responsePlaceToPay['deeplink'];
              await queryRunner.manager.update(
                IncidentPayment,
                { referenceId },
                { url: urlPlaceToPay }
              );

            } else {
              throw new Error('call buy TypePaymentMethod PlaceToPay not found');
            }
            break;

          default:
            throw new Error('call buy TypePaymentMethod not found');
        }

        if (queryRunner.isTransactionActive)
          await queryRunner.commitTransaction();

        const incidentPaymentBuying = await this.incidentPaymentRepository.findOne({
          where: {
            referenceId: referenceId,
          },
          select: ['id', 'createdAt', 'typePaymentMethod', 'statusPayment', 'url', 'referenceId'],
        });

        return { errorCode: ErrorCode.AWAITS_RESPONSE, incidentPaymentBuying };

      } catch (error) {
        if (queryRunner.isTransactionActive) {
          await queryRunner.rollbackTransaction();
        }
        this.logger.error(`call payIncidentes error.message ${error.message}`);
      } finally {
        await queryRunner.release();
      }

      return { errorCode: ErrorCode.UNAUTHORIZED };

    } catch (error) {
    }

  }

  /**
   * Builds the human-readable concept that travels with the payment to
   * simert-pay. Reads each incident's `nroObligation` (bondNumber) from DB
   * and appends them so simert-pay can correlate the resulting transaction
   * against the obligations being paid (e.g. "Pago de multa #18650477, #18650478").
   *
   * If the caller provides a `concept` entry in `optionalData`, it is
   * prepended (existing behavior) so callers can override the prefix.
   * Downstream truncation in simert-pay (`LengthDb.concept`) still applies
   * when the joined string exceeds the column length.
   *
   * @param incidentIds Ids of the incidents covered by the payment batch.
   * @param optionalData Optional caller-supplied extras; honors `concept` key.
   * @returns The final concept string passed to `_parseDebitAmounDto`.
   */
  private async _buildPaymentConcept(
    incidentIds: number[],
    optionalData?: OptionalDataInterface[],
  ): Promise<string> {
    const incidents = (await this.incidentRepository.find({
      where: { id: In(incidentIds) },
      select: ['nroObligation'],
    })) ?? [];

    const bondNumbersText = incidents
      .map(incident => incident.nroObligation)
      .filter(Boolean)
      .map(nroObligation => `#${nroObligation}`)
      .join(', ');

    let concept = bondNumbersText ? `Pago de multa ${bondNumbersText}` : 'Pago de multa';

    const conceptElement = optionalData?.find(element => element.key === 'concept');
    if (conceptElement) {
      concept = `${conceptElement.value} | ${concept}`;
    }

    return concept;
  }

  /**
   * Resolves the vehicle owner's full name for a payment batch using a single
   * query. Every incident in a batch shares the same owner, so it reads just
   * one incident by its id instead of loading the whole list.
   *
   * @param incidentId Id of a single incident from the payment batch.
   * @returns The owner's full name (`fullNameClient`), or an empty string when not found.
   */
  private async _getOwnerName(incidentId: number): Promise<string> {
    const incident = await this.incidentRepository.findOne({
      where: { id: incidentId },
      select: ['fullNameClient'],
    });

    return incident?.fullNameClient ?? '';
  }

  private async _parseDebitAmounDto(concept: string, payIncidentDto: PayIncidentDto) {

    try {
      const { credentialId, amount, userId, transactionId, optionalData, commission,
      } = payIncidentDto;

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
        transactionReason: { id: IdTransactionReason.PAY_INCIDENT },
        billing_data: { ...payIncidentDto.billing_data, typeService: TypeService.PARKING },
        purchase_data,
        credentialId,
        commission,
      });

      return debitAmounDto;

    } catch (error) {
    }
  }

  /**
   * Schedules the deferred verification that reverses a payment when the
   * provider never confirms it. After `timerMinuteDeuna` it re-reads the
   * payments tied to `referenceId`: if all are already PAID nothing changes,
   * otherwise the payments are marked as ERROR and the client is notified.
   *
   * Shared by every payment-provider flow (DeUna, Ahorita, PlaceToPay); the
   * only per-provider differences are the success log message and whether an
   * empty payments list short-circuits the check.
   *
   * @param referenceId Reference grouping the payments to verify.
   * @param userId Owner of the payments, used for the status notification.
   * @param amount Total amount, forwarded to the notification.
   * @param typePaymentMethod Provider used, forwarded to the notification.
   * @param paidLogMessage Message logged when the payment was confirmed in time.
   * @param returnIfEmpty When true, an empty payments list aborts the check
   *   (PlaceToPay behavior); when false the empty list is treated as PAID
   *   (DeUna/Ahorita behavior). Preserves each flow's original semantics.
   */
  private _scheduleUnconfirmedPaymentReversal(
    referenceId: string,
    userId: number,
    amount: string,
    typePaymentMethod: TypePaymentMethod,
    paidLogMessage: string,
    returnIfEmpty: boolean,
  ): void {
    setTimeout(async () => {
      const incidentPayments = await this.incidentPaymentRepository.find({ where: { referenceId: referenceId } });
      if (!incidentPayments) return;
      if (returnIfEmpty && incidentPayments.length === 0) return;
      if (incidentPayments.every(incidentPayment => incidentPayment.statusPayment === StatusPayment.PAID)) {
        return this.logger.log(paidLogMessage);
      }
      this.logger.warn('No se pago en 5 minutos se liberaron los checkbox');
      this._saveResponsePay(incidentPayments, StatusMoment.RESPONSE, StatusPayment.ERROR);
      this._notifyChageStatus(userId, StatusPayment.ERROR, referenceId, amount, typePaymentMethod);
    }, this.timerMinuteDeuna);
  }

  /**
   * Handles an unsuccessful provider response: flags every payment tied to
   * `referenceId` as ERROR and notifies the client. Shared by all payment
   * provider flows.
   *
   * @param referenceId Reference grouping the failed payments.
   * @param userId Owner of the payments.
   * @param amount Total amount, forwarded to the notification.
   * @param typePaymentMethod Provider used, forwarded to the notification.
   * @returns The standard RESPONSE error envelope.
   */
  private async _handleProviderPaymentFailure(
    referenceId: string,
    userId: number,
    amount: string,
    typePaymentMethod: TypePaymentMethod,
  ): Promise<{ errorCode: number }> {
    const incidentPayments = await this.incidentPaymentRepository.find({ where: { referenceId: referenceId } });
    this._saveResponsePay(incidentPayments, StatusMoment.RESPONSE, StatusPayment.ERROR);
    this._notifyChageStatus(userId, StatusPayment.ERROR, referenceId, amount, typePaymentMethod);
    return { errorCode: ErrorCode.RESPONSE };
  }

  /**
   * Builds the asynchronous payment-confirmation webhook URL that every
   * provider (DeUna, Ahorita, PlaceToPay) calls back. The path is identical
   * for all providers, so centralizing it removes the repeated, error-prone
   * template literal from each flow.
   *
   * @param idDevice Device identifier originating the payment.
   * @param userId Owner of the payment.
   * @param referenceId Reference grouping the payments.
   * @param typePaymentMethod Provider used.
   * @param register Transaction register timestamp.
   * @param typePaymentResponsibility Who assumes the payment commission.
   * @returns The fully qualified webhook URL.
   */
  private _buildPaymentResponseWebhook(
    idDevice: string,
    userId: number,
    referenceId: string,
    typePaymentMethod: TypePaymentMethod,
    register: string,
    typePaymentResponsibility: TypePaymentResponsibility,
  ): string {
    return `${this.domainSimert}api/simert/client/incident/on-response-pay/${idDevice}/${userId}/${referenceId}/${typePaymentMethod}/${register}/${typePaymentResponsibility}`;
  }

  /**
   * Resolves the outcome of a payment-provider request shared by all flows:
   * on success it schedules the deferred reversal and returns the deeplink;
   * on failure it flags the payments as errored and returns the RESPONSE
   * envelope. Preserves each provider's original semantics through its
   * `paidLogMessage` and `returnIfEmpty` arguments.
   *
   * @param response Raw provider response (may be null/undefined).
   * @param referenceId Reference grouping the payments.
   * @param userId Owner of the payments.
   * @param amount Total amount, forwarded to scheduling/notification.
   * @param typePaymentMethod Provider used.
   * @param paidLogMessage Message logged when payment confirms in time.
   * @param returnIfEmpty Empty-list semantics for the reversal check.
   * @returns The success envelope with deeplink, or the failure envelope.
   */
  private async _finalizeProviderResponse(
    response: Record<string, any>,
    referenceId: string,
    userId: number,
    amount: string,
    typePaymentMethod: TypePaymentMethod,
    paidLogMessage: string,
    returnIfEmpty: boolean,
  ): Promise<{ errorCode: number; deeplink?: string }> {
    // When the provider responds with the correct status
    if (response && response['errorCode'] === ErrorCode.NONE) {
      // Wait 3 minutes to verify whether the PAYMENT happened. If it occurred earlier in response to the
      // webhook the client was already notified; otherwise we verify the transaction before reversing.
      this._scheduleUnconfirmedPaymentReversal(
        referenceId, userId, amount, typePaymentMethod, paidLogMessage, returnIfEmpty,
      );
      return { errorCode: ErrorCode.NONE, deeplink: response['deeplink'] };
    }
    return this._handleProviderPaymentFailure(referenceId, userId, amount, typePaymentMethod);
  }

  private async _payDeunaV2(idDevice: string, debitAmounDto: DebitAmounDto, payIncidentDto: PayIncidentDto, typePaymentResponsibility: TypePaymentResponsibility, referenceId: string, codes: string, ownerName: string) {

    const { userId, typePaymentMethod, credentialId, amount
    } = payIncidentDto;
    const { register } = debitAmounDto;

    if (!typePaymentResponsibility) {
      typePaymentResponsibility = TypePaymentResponsibility.NONE;
    }

    const registerDeunaDto = new RegisterDeunaDto({
      credentialId,
      register: debitAmounDto.register,
      amount: amount,
      commission: debitAmounDto.commission,
      identityCard: payIncidentDto.identityCard,
      idTransactionReason: IdTransactionReason.PAY_INCIDENT,
      concept: debitAmounDto.concept,
      purchase_data: debitAmounDto.purchase_data,
      billing_data: { ...debitAmounDto.billing_data, code: codes, ownerName } as BillingDataDto,
      transactionId: debitAmounDto.transactionId,
      userId,
      webhook: this._buildPaymentResponseWebhook(idDevice, userId, referenceId, typePaymentMethod, register, typePaymentResponsibility),
    })

    const response = await this.commonService.payDeUnaV2(idDevice, registerDeunaDto);

    return this._finalizeProviderResponse(
      response, referenceId, userId, amount, typePaymentMethod,
      'Se pago correctamente con de una en menos de 3 minutos', false,
    );
  }

  private async _payAhorita(idDevice: string, debitAmounDto: DebitAmounDto, payIncidentDto: PayIncidentDto, typePaymentResponsibility: TypePaymentResponsibility, referenceId: string, codes: string, ownerName: string) {
    const { userId, typePaymentMethod, credentialId, amount } = payIncidentDto;
    const { register } = debitAmounDto;

    if (!typePaymentResponsibility) {
      typePaymentResponsibility = TypePaymentResponsibility.NONE;
    }

    const registerAhoritaDto = new RegisterAhoritaDto({
      credentialId,
      register: debitAmounDto.register,
      amount: amount,
      commission: debitAmounDto.commission,
      identityCard: payIncidentDto.identityCard,
      idTransactionReason: IdTransactionReason.PAY_INCIDENT,
      concept: debitAmounDto.concept,
      purchase_data: debitAmounDto.purchase_data,
      billing_data: { ...debitAmounDto.billing_data, code: codes, ownerName } as BillingDataDto,
      transactionId: debitAmounDto.transactionId,
      userId,
      webhook: this._buildPaymentResponseWebhook(idDevice, userId, referenceId, typePaymentMethod, register, typePaymentResponsibility),
    })

    const response = await this.commonService.payAhorita(idDevice, registerAhoritaDto);

    return this._finalizeProviderResponse(
      response, referenceId, userId, amount, typePaymentMethod,
      'Se pago correctamente con ahorita en menos de 3 minutos', false,
    );
  }

  private async _payPlaceToPay(idDevice: string, debitAmounDto: DebitAmounDto, payIncidentDto: PayIncidentDto, typePaymentResponsibility: TypePaymentResponsibility, referenceId: string, codes: string, ownerName: string) {

    const { userId, typePaymentMethod, credentialId, amount } = payIncidentDto;
    const { register } = debitAmounDto;

    if (!typePaymentResponsibility) {
      typePaymentResponsibility = TypePaymentResponsibility.NONE;
    }

    const registerPlaceToPayDto = new RegisterPlaceToPayDto({
      credentialId,
      register: debitAmounDto.register,
      amount: amount,
      commission: debitAmounDto.commission,
      identityCard: payIncidentDto.identityCard,
      idTransactionReason: IdTransactionReason.PAY_INCIDENT,
      concept: debitAmounDto.concept,
      purchase_data: debitAmounDto.purchase_data,
      billing_data: { ...debitAmounDto.billing_data, code: codes, ownerName } as BillingDataDto,
      transactionId: debitAmounDto.transactionId,
      userId,
      webhook: this._buildPaymentResponseWebhook(idDevice, userId, referenceId, typePaymentMethod, register, typePaymentResponsibility),
      referenceId
    })

    const response = await this.commonService.payPlaceToPay(idDevice, referenceId, registerPlaceToPayDto);

    return this._finalizeProviderResponse(
      response, referenceId, userId, amount, typePaymentMethod,
      'Se pago correctamente con place to pay en menos de 3 minutos', true,
    );
  }

  async _saveResponsePay(incidentPayments: IncidentPayment[], moment: StatusMoment, statusPayment: StatusPayment) {

    if (!incidentPayments || incidentPayments.length === 0) return;

    const { referenceId } = incidentPayments[0];
    const ids = incidentPayments.map(incidentPayment => incidentPayment.incidentId);

    if (statusPayment === StatusPayment.PAID) {
      try {

        await this.incidentPaymentRepository.update({ referenceId }, { statusPayment, moment });

        // Single query to fetch bondIds, identityCard and onResponseExternal
        const incidents = await this.incidentRepository.find({ where: { id: In(ids) } });
        const bondIds = incidents.map(incident => incident.bondId);

        // Control to avoid decimal precision errors; compute the total paid
        const amount = incidentPayments.reduce((acc, i) => {
          return acc + Number(i.amount) * 100;
        }, 0) / 100;

        // Perform the deposit in GIM
        const registerDepositGimDto: RegisterDepositGimDto = {
          amount: amount.toFixed(2),
          identificationNumber: incidents[0].identityCard,
          bondIds: bondIds,
          paymentDate: new Date().toISOString().split('T')[0],
          transactionId: incidentPayments[0].transactionId,
        };

        const response = await this.gimService.registerDeposit(registerDepositGimDto);

        if (response && response.errorCode === ErrorCode.NONE) {
          // Update each incident with statusIncident PAYED and the accumulated onResponseExternal
          for (const incident of incidents) {
            const onResponseExternal = [...(incident.onResponseExternal ?? [])];
            if (response.data) onResponseExternal.push(response.data);
            await this.incidentRepository.update(incident.id, {
              statusPayment,
              transactionId: incidentPayments[0].transactionId,
              typePaymentMethod: incidentPayments[0].typePaymentMethod,
              statusIncident: IncidentStatus.PAYED,
              onResponseExternal,
            });
          }
        } else {
          await this.incidentRepository.update(
            { id: In(ids) },
            {
              statusPayment,
              transactionId: incidentPayments[0].transactionId,
              typePaymentMethod: incidentPayments[0].typePaymentMethod,
            }
          );
        }

      } catch (error) {
        this.logger.error(`call _saveResponsePay error.message ${error.message} StatusMoment.CORRECTLY_PAID_UNASSIGNED`);

        moment = StatusMoment.CORRECTLY_PAID_UNASSIGNED;
        await this.incidentPaymentRepository.update({ referenceId }, { statusPayment, moment });
        await this.incidentRepository.update(
          { id: In(ids) },
          { statusPayment, transactionId: incidentPayments[0].transactionId, typePaymentMethod: incidentPayments[0].typePaymentMethod }
        );
      }
    } else {
      await this.incidentPaymentRepository.update({ referenceId }, { statusPayment, moment });
      await this.incidentRepository.update(
        { id: In(ids) },
        { statusPayment, transactionId: incidentPayments[0].transactionId, typePaymentMethod: incidentPayments[0].typePaymentMethod }
      );
    }
  }

  private async _notifyChageStatus(userId: number, status: number, referenceId: string, amount: string, typePaymentMethod: TypePaymentMethod) {
    const notification = new CreateNotificationDto({
      userId,
      notification: {
        type: TypeNotification.CHANGE_STATUS_PAY_FINE,
        data: {
          referenceId,
          status,
          amount,
          typePaymentMethod,
        },
      }
    });
    this.commonService.notify(notification);
  }

  /**
   * Payment-provider success webhook. Marks all payments in the reference batch as PAID,
   * registers the deposit in GIM and notifies the owner.
   *
   * @param idDevice Device that originated the payment.
   * @param userId Owner of the payments.
   * @param referenceId Reference grouping all affected incident payments.
   * @param typePaymentMethod Provider that called back.
   * @param register Original register timestamp.
   * @param typePaymentResponsibility Commission responsibility type.
   * @returns Standard error-code envelope.
   */
  async onResponsePay(idDevice: string, userId: number, referenceId: string, typePaymentMethod: TypePaymentMethod, register: string, typePaymentResponsibility: TypePaymentResponsibility) {

    const incidentPayments = await this.incidentPaymentRepository.find({ where: { referenceId: referenceId } });

    if (!incidentPayments || incidentPayments.length === 0) {
      return { errorCode: ErrorCode.NOT_FOUND }
    }

    // Control to avoid decimal precision errors
    const amount = incidentPayments.reduce((acc, i) => {
      return acc + Number(i.amount) * 100;
    }, 0) / 100;

    if (incidentPayments[0].statusPayment === StatusPayment.WAITING) {

      await this._saveResponsePay(incidentPayments, StatusMoment.LISTENING, StatusPayment.PAID);
      await this._notifyChageStatus(userId, StatusPayment.PAID, referenceId, amount.toString(), typePaymentMethod);

      return { errorCode: ErrorCode.NONE }
    }
    return { errorCode: ErrorCode.NOT_FOUND }
  }

  /**
   * Payment-provider error/cancellation webhook. Marks all payments in the
   * reference batch as ERROR and notifies the owner.
   *
   * @param idDevice Device that originated the payment.
   * @param userId Owner of the payments.
   * @param referenceId Reference grouping all affected incident payments.
   * @param typePaymentMethod Provider that called back.
   * @param register Original register timestamp.
   * @param typePaymentResponsibility Commission responsibility type.
   */
  async onResponsePayError(idDevice: string, userId: number, referenceId: string, typePaymentMethod: TypePaymentMethod, register: string, typePaymentResponsibility: number) {

    const incidentPayments = await this.incidentPaymentRepository.find({ where: { referenceId: referenceId } });
    if (!incidentPayments || incidentPayments.length === 0) return;

    // Control to avoid decimal precision errors
    const amount = incidentPayments.reduce((acc, i) => {
      return acc + Number(i.amount) * 100;
    }, 0) / 100;

    this._saveResponsePay(incidentPayments, StatusMoment.RESPONSE, StatusPayment.ERROR);
    this._notifyChageStatus(userId, StatusPayment.ERROR, referenceId, amount.toString(), typePaymentMethod);

  }

  /**
   * Returns the payment record for a given reference id, scoped to the user.
   *
   * @param userId Owner of the payment.
   * @param referenceId Reference grouping the incident payments.
   * @returns Error-code envelope with the matching payment record or an empty object.
   */
  async getTransactionsByReference(userId: number, referenceId: string) {

    try {
      const incidentPaymentBuying = await this.incidentPaymentRepository.createQueryBuilder('ip')
        .select(['ip.referenceId', 'ip.statusPayment', 'ip.createdAt', 'ip.typePaymentMethod'])
        .where('ip.referenceId = :referenceId', { referenceId })
        .andWhere('ip.userId = :userId', { userId })
        .getOne();

      if (incidentPaymentBuying)
        return { errorCode: ErrorCode.NONE, incidentPaymentBuying };
      return { errorCode: ErrorCode.NOT_FOUND, incidentPaymentBuying: {} };

    } catch (error) {
      handleDbExceptions(error, this.logger);
    }
  }

  private async _tableExists(tableName: string): Promise<boolean> {
    const names = tableName.split('.');
    if (names.length <= 1) {
      this.logger.error(`Schema not specified for table ${tableName}`);
      return false;
    }

    const table_schema = names[0].replace(/"/g, '').trim();
    const table_name = names[1].replace(/"/g, '').trim();

    const query = `
    SELECT EXISTS(
      SELECT 1
      FROM information_schema.tables
      WHERE table_schema = $1
        AND table_name = $2
    ) AS "exists";
  `;

    const result = await this.incidentRepository.query(query, [table_schema, table_name]);
    return !!result[0]?.exists;
  }

  private async _saveSatusFraction(fraction: Fraction, statusId: number, moment: number) {
    // Check whether a record already exists for the given status and fractionId
    const existingFractionStatus = await this.fractionStatusRepository.findOne({
      where: { fraction: { id: fraction.id }, status: { id: statusId }, },
    });

    if (existingFractionStatus) {
      existingFractionStatus.moment = moment;
      await this.fractionStatusRepository.save(existingFractionStatus);
    }
    else {
      // Always persist the fraction status
      const fractionSatus = this.fractionStatusRepository.create({ fraction, moment, status: { id: statusId } });
      await this.fractionStatusRepository.save(fractionSatus);
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

  private async _notifyChageStatusFraction(userId: number, status: number, fractionId: number) {
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

  private _buildAntDataResponse(obligation: Obligation, statusIncident: IncidentStatus): UpdateIncidentDto {
    const updateDto = new UpdateIncidentDto();
    updateDto.bondId = obligation.obligationId;
    updateDto.nroObligation = obligation.obligationNumber;
    updateDto.statusIncident = statusIncident;
    if (obligation.total)
      updateDto.amount = obligation.total;

    // let currentOptionalData = incident.optionalData;
    // let currentOnResponseExternal = incident.onResponseExternal;

    // if (obligation.taxpayerId != null) {
    //   const optionalData = [...(currentOptionalData ?? [])];
    //   const idx = optionalData.findIndex(item => item.key === 'residentId');
    //   if (idx >= 0) {
    //     optionalData[idx] = { ...optionalData[idx], value: obligation.taxpayerId };
    //   } else {
    //     optionalData.push({ key: 'residentId', value: obligation.taxpayerId });
    //   }
    //   updateDto.optionalData = optionalData;
    // }

    // // onResponseExternal: push obligation al array existente
    // updateDto.onResponseExternal = [...(currentOnResponseExternal ?? []), obligation];

    return updateDto;
  }

}
