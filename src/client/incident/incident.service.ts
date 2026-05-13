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

@Injectable()
export class IncidentService {
  private readonly logger = new Logger(IncidentService.name);

  private readonly antBaseUrl = process.env.ANT_BASE_URL; // ej: https://ant.tu-dominio.com
  private readonly antApiKey = process.env.ANT_API_KEY;   // si aplica
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

  async create(userId: number, idDevice: string, createIncidentDto: CreateIncidentDto) {
    try {
      const { fractionId, incidentCategory, incidentTypeId } = createIncidentDto;

      //  1) Consultar ANT por placa y setear emailClient, fullNameClient, identityCard
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

      //calculamos el valor del incidente
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

      //  2) Crear y guardar incidente (flujo igual)

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

      //cambiamos el estado de la fraccion a sancionada
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

      // ✅ Ajusta el path real según la respuesta de ANT
      // Ejemplos comunes:
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
      return null; // no revienta el flujo si ANT falla
    }
  }

  async checkMyFractionsOutstanding(plate?: string, identityCard?: string,): Promise<FinesResponse> {

    if (!plate && !identityCard) {
      throw new BadRequestException('Debe enviar plate o identityCard');
    }

    try {
      // ellos siempre reciben cedula si algun recurso no tiene cedula antes hay q consultar al ANT SACAR LA CEDULA X MEDIO DE LA PLACA 
      // Y ENVIARLA EN identityCard 
      // asi uno de ellos este vacio o eso deberia controlar yo aca y 
      // solo enviar uno de ellos

      const config: AxiosRequestConfig = {
        method: 'get', // o 'post' si el GIM lo requiere
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

  async findSanctionByIdentityCard(userId: number, idDevice: string, identityCard: string, getIncidentDto: GetIncidentDto) {

    try {

      //validamos que caja este abierta
      const openTill = await this.gimService.validateOpenTill();
      if (openTill.errorCode !== ErrorCode.NONE) return openTill;


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
        i."fullNameClient" AS "fullNameClient", i."emailClient" AS "emailClient",
        i."identityCard" AS "identityCard", i."commission" AS "commission", i."reference" AS "reference"
      FROM ${table} i
      INNER JOIN public.incident_type it ON i."incidentTypeId" = it.id
    `;

      const query = `${baseSelect(tableName)} ${buildWhere()}`;

      const incidents: Incident[] = await this.incidentRepository.query(query, params);

      if (incidents.length === 0)
        return { errorCode: ErrorCode.NOT_FOUND, currentDate, incidents };

      //ResidentId necesario para la emisión
      const residentResult = await this._getResidentId(userId, idDevice, identityCard, incidents);
      if (!residentResult.residentId) {
        return { errorCode: ErrorCode.NOT_VALID, message: 'No se pudo verificar la información del cliente, por favor inténtelo más tarde' };
      }
      const residentId = residentResult.residentId; //id del cliente del GIM
      const issued = []; //Guardamos las emitidas para obtne el valor a pagar

      for (const incident of incidents) {

        // VERIFICAMOS SI LA DEUDA YA FUE EMITIDA en el gim y actualizamos el estado
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

        //creamos la deuda en el gim

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
        this.logger.debug('Intentando emitir en simert ', emitResult)
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

    // 1) Verificamos si existe el usuario y tiene el residentId en nuestra base de datos
    const user = await this.commonAuthService.filterByIdentityCard(userId, identityCard);
    const userFound = user.errorCode === ErrorCode.NONE;
    if (userFound) {
      residentId = user.data.residentId || null;
    }

    if (residentId) return { residentId };

    // 2) Si no existe el residentId en nuestra BD lo buscamos en el GIM
    const userGim = await this.commonGimService.getUserByIdentificationNumber(idDevice, identityCard);
    if (userGim.errorCode === ErrorCode.NONE && userGim.data?.id) {
      residentId = userGim.data.id;
      // Si el usuario existe en nuestra BD pero no tenía residentId, lo guardamos
      if (userFound) {
        this.commonAuthService.updateResidentId(userId, identityCard, residentId);
      }
      return { residentId };
    }

    // 3) Si no existe en el GIM lo creamos.
    // Usamos los datos de auth si están disponibles; si no, los del incidente.
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

  async pay(idDevice: string, payIncidentDto: PayIncidentDto) {

    //validamos que caja este abierta
    const openTill = await this.gimService.validateOpenTill();
    if (openTill.errorCode !== ErrorCode.NONE) return openTill;

    const { userId, transactionId, typePaymentMethod, optionalData, identityCard, credentialId, incidents, amount, billing_data } = payIncidentDto;

    let urlDeuna = '';
    let urlAhorita = '';
    let urlPlaceToPay = '';

    this.logger.debug('Ingreso a la funcion de pay')
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

    // Buscamos si el usuario tiene una transaccion previa
    // let incidentPayment = await this.incidentPaymentRepository.findOne({ where: { transactionId } });

    // if (incidentPayment) {
    //   return { errorCode: ErrorCode.TRANSACTION_REPIT }
    // }

    let typePaymentResponsibility: TypePaymentResponsibility;

    try {
      let concept = `Pago de incidente`;

      if (optionalData) {
        const conceptElement = optionalData.find(element => element.key === 'concept');
        concept = `${conceptElement ? conceptElement.value + ' | ' + concept : concept}`;
      }

      const debitAmounDto = await this._parseDebitAmounDto(concept, payIncidentDto);

      //vERIFICAMOS 

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

            const responseDeunaV2 = await this._payDeunaV2(idDevice, debitAmounDto, payIncidentDto, typePaymentResponsibility, referenceId);
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

            const responseAhorita = await this._payAhorita(idDevice, debitAmounDto, payIncidentDto, typePaymentResponsibility, referenceId);

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

            const responsePlaceToPay = await this._payPlaceToPay(idDevice, debitAmounDto, payIncidentDto, typePaymentResponsibility, referenceId);

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

  private async _payDeunaV2(idDevice: string, debitAmounDto: DebitAmounDto, payIncidentDto: PayIncidentDto, typePaymentResponsibility: TypePaymentResponsibility, referenceId: string) {

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
      billing_data: debitAmounDto.billing_data,
      transactionId: debitAmounDto.transactionId,
      userId,
      webhook: `${this.domainSimert}api/simert/client/incident/on-response-pay/${idDevice}/${userId}/${referenceId}/${typePaymentMethod}/${register}/${typePaymentResponsibility}`,
    })

    const response = await this.commonService.payDeUnaV2(idDevice, registerDeunaDto);

    //Cuando el provehedor responde el estado correcto
    if (response && response['errorCode'] === ErrorCode.NONE) {
      // Esperamos 3 minutos para verificar si se realizo el PAGO, si el pago se hizo antes en respuesta al
      // webhook ya se responde al cliente antes, caso contrario se verifica la transaccion antes de reversar

      setTimeout(async () => {
        const incidentPayments = await this.incidentPaymentRepository.find({ where: { referenceId: referenceId } });
        if (!incidentPayments) return;
        if (incidentPayments.every(incidentPayment => incidentPayment.statusPayment === StatusPayment.PAID)) {
          return this.logger.log('Se pago correctamente con de una en menos de 3 minutos');
        }
        this.logger.warn('No se pago en 5 minutos se liberaron los checkbox');
        this._saveResponsePay(incidentPayments, StatusMoment.RESPONSE, StatusPayment.ERROR);
        this._notifyChageStatus(userId, StatusPayment.ERROR, referenceId, amount, typePaymentMethod);
      }, this.timerMinuteDeuna)
      return { errorCode: ErrorCode.NONE, deeplink: response['deeplink'] };
    } else {
      const incidentPayments = await this.incidentPaymentRepository.find({ where: { referenceId: referenceId } });
      this._saveResponsePay(incidentPayments, StatusMoment.RESPONSE, StatusPayment.ERROR);
      this._notifyChageStatus(userId, StatusPayment.ERROR, referenceId, amount, typePaymentMethod);
      return { errorCode: ErrorCode.RESPONSE };
    }
  }

  private async _payAhorita(idDevice: string, debitAmounDto: DebitAmounDto, payIncidentDto: PayIncidentDto, typePaymentResponsibility: TypePaymentResponsibility, referenceId: string) {
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
      billing_data: debitAmounDto.billing_data,
      transactionId: debitAmounDto.transactionId,
      userId,
      webhook: `${this.domainSimert}api/simert/client/incident/on-response-pay/${idDevice}/${userId}/${referenceId}/${typePaymentMethod}/${register}/${typePaymentResponsibility}`,
    })

    const response = await this.commonService.payAhorita(idDevice, registerAhoritaDto);

    //Cuando el provehedor responde el estado correcto
    if (response && response['errorCode'] === ErrorCode.NONE) {
      // Esperamos 3 minutos para verificar si se realizo el PAGO, si el pago se hizo antes en respuesta al
      // webhook ya se responde al cliente antes, caso contrario se verifica la transaccion antes de reversar

      setTimeout(async () => {
        const incidentPayments = await this.incidentPaymentRepository.find({ where: { referenceId: referenceId } });
        if (!incidentPayments) return;
        if (incidentPayments.every(incidentPayment => incidentPayment.statusPayment === StatusPayment.PAID)) {
          return this.logger.log('Se pago correctamente con ahorita en menos de 3 minutos');
        }
        this.logger.warn('No se pago en 5 minutos se liberaron los checkbox');
        this._saveResponsePay(incidentPayments, StatusMoment.RESPONSE, StatusPayment.ERROR);
        this._notifyChageStatus(userId, StatusPayment.ERROR, referenceId, amount, typePaymentMethod);
      }, this.timerMinuteDeuna)
      return { errorCode: ErrorCode.NONE, deeplink: response['deeplink'] };
    } else {
      const incidentPayments = await this.incidentPaymentRepository.find({ where: { referenceId: referenceId } });
      this._saveResponsePay(incidentPayments, StatusMoment.RESPONSE, StatusPayment.ERROR);
      this._notifyChageStatus(userId, StatusPayment.ERROR, referenceId, amount, typePaymentMethod);
      return { errorCode: ErrorCode.RESPONSE };
    }
  }

  private async _payPlaceToPay(idDevice: string, debitAmounDto: DebitAmounDto, payIncidentDto: PayIncidentDto, typePaymentResponsibility: TypePaymentResponsibility, referenceId: string) {

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
      billing_data: debitAmounDto.billing_data,
      transactionId: debitAmounDto.transactionId,
      userId,
      webhook: `${this.domainSimert}api/simert/client/incident/on-response-pay/${idDevice}/${userId}/${referenceId}/${typePaymentMethod}/${register}/${typePaymentResponsibility}`,
      referenceId
    })

    const response = await this.commonService.payPlaceToPay(idDevice, referenceId, registerPlaceToPayDto);

    //Cuando el provehedor responde el estado correcto
    if (response && response['errorCode'] === ErrorCode.NONE) {
      // Esperamos 3 minutos para verificar si se realizo el PAGO, si el pago se hizo antes en respuesta al 
      // webhook ya se responde al cliente antes, caso contrario se verifica la transaccion antes de reversar 
      setTimeout(async () => {
        const incidentPayments = await this.incidentPaymentRepository.find({ where: { referenceId: referenceId } });
        if (!incidentPayments || incidentPayments.length === 0) return;
        if (incidentPayments.every(incidentPayment => incidentPayment.statusPayment === StatusPayment.PAID)) {
          return this.logger.log('Se pago correctamente con place to pay en menos de 3 minutos');
        }
        this.logger.warn('No se pago en 5 minutos se liberaron los checkbox');
        this._saveResponsePay(incidentPayments, StatusMoment.RESPONSE, StatusPayment.ERROR);
        this._notifyChageStatus(userId, StatusPayment.ERROR, referenceId, amount, typePaymentMethod);
      }, this.timerMinuteDeuna)
      return { errorCode: ErrorCode.NONE, deeplink: response['deeplink'] };
    } else {
      const incidentPayments = await this.incidentPaymentRepository.find({ where: { referenceId: referenceId } });
      this._saveResponsePay(incidentPayments, StatusMoment.RESPONSE, StatusPayment.ERROR);
      this._notifyChageStatus(userId, StatusPayment.ERROR, referenceId, amount, typePaymentMethod);
      return { errorCode: ErrorCode.RESPONSE };
    }
  }

  async _saveResponsePay(incidentPayments: IncidentPayment[], moment: StatusMoment, statusPayment: StatusPayment) {

    if (!incidentPayments || incidentPayments.length === 0) return;

    const { referenceId } = incidentPayments[0];
    const ids = incidentPayments.map(incidentPayment => incidentPayment.incidentId);

    if (statusPayment === StatusPayment.PAID) {
      try {

        await this.incidentPaymentRepository.update({ referenceId }, { statusPayment, moment });

        // Una sola consulta para obtener bondIds, identityCard y onResponseExternal
        const incidents = await this.incidentRepository.find({ where: { id: In(ids) } });
        const bondIds = incidents.map(incident => incident.bondId);

        // control para evitar errores de decimales, obtenemos el total pagado
        const amount = incidentPayments.reduce((acc, i) => {
          return acc + Number(i.amount) * 100;
        }, 0) / 100;

        // realizamos el depósito en el GIM
        const registerDepositGimDto: RegisterDepositGimDto = {
          amount: amount.toFixed(2),
          identificationNumber: incidents[0].identityCard,
          bondIds: bondIds,
          paymentDate: new Date().toISOString().split('T')[0],
          transactionId: incidentPayments[0].transactionId,
        };

        const response = await this.gimService.registerDeposit(registerDepositGimDto);

        if (response && response.errorCode === ErrorCode.NONE) {
          // Actualizamos cada incidente con statusIncident PAYED y onResponseExternal acumulado
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

  async onResponsePay(idDevice: string, userId: number, referenceId: string, typePaymentMethod: TypePaymentMethod, register: string, typePaymentResponsibility: TypePaymentResponsibility) {

    const incidentPayments = await this.incidentPaymentRepository.find({ where: { referenceId: referenceId } });


    if (!incidentPayments || incidentPayments.length === 0) {
      return { errorCode: ErrorCode.NOT_FOUND }
    }

    //control para evitar errores de decimales
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

  async onResponsePayError(idDevice: string, userId: number, referenceId: string, typePaymentMethod: TypePaymentMethod, register: string, typePaymentResponsibility: number) {

    const incidentPayments = await this.incidentPaymentRepository.find({ where: { referenceId: referenceId } });
    if (!incidentPayments || incidentPayments.length === 0) return;

    //control para evitar errores de decimales
    const amount = incidentPayments.reduce((acc, i) => {
      return acc + Number(i.amount) * 100;
    }, 0) / 100;

    this._saveResponsePay(incidentPayments, StatusMoment.RESPONSE, StatusPayment.ERROR);
    this._notifyChageStatus(userId, StatusPayment.ERROR, referenceId, amount.toString(), typePaymentMethod);

  }

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
      this.logger.error(`No se especificó el esquema en la tabla ${tableName}`);
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
    // Verifica si ya existe un registro para el status y fractionid dado
    const existingFractionStatus = await this.fractionStatusRepository.findOne({
      where: { fraction: { id: fraction.id }, status: { id: statusId }, },
    });

    if (existingFractionStatus) {
      existingFractionStatus.moment = moment;
      await this.fractionStatusRepository.save(existingFractionStatus);
    }
    else {
      // Siempre guardamos el estado del fraction
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
