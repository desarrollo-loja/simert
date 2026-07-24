import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { UpdateIncidentDto } from 'src/admin/incident/dto/update-incident.dto';
import { Incident } from 'src/admin/incident/entities/incident.entity';
import { IncidentService } from 'src/admin/incident/incident.service';
import { IncidentTypeService } from 'src/admin/incident-type/incident-type.service';
import { CommonAuthService } from 'src/common/common.auth.service';
import { CommonGimService } from 'src/common/common.gim.service';
import { CreateClientGimDto } from 'src/common/dto/create-client-gim.dto';
import { CreateClientGimNotExistDto } from 'src/common/dto/create-client-gim-not-exist.dto';
import { EmissionCreditCardDto } from 'src/common/dto/emission-credit-card.dto';
import { EmissionSanctionDto } from 'src/common/dto/emission-sanction.dto';
import { RegisterDepositGimDto } from 'src/common/dto/register-deposit-gim.dto';
// import handleDbExceptions from 'src/common/exceptions/error.db.exception';
import { ErrorCode } from 'src/common/glob/error';
import {
  ResponseCodeGim,
  StatusObligation,
} from 'src/common/glob/responses-gim';
import { getMaritalStatusName } from 'src/common/glob/status/status_marital';
import { getGenreNameById, TypeGenre } from 'src/common/glob/type/type_genre';
import {
  mapIdentificationTypeToGim,
  TypeIdentifyCard,
} from 'src/common/glob/type/type_identifycard';
import { IncidentStatus } from 'src/common/glob/type/type_incident';
import { TypeMaritalStatus } from 'src/common/glob/type/type_maritalStatus';
import { TypeSizeVehicle } from 'src/common/glob/type/type_size_vehicle';
import { KeycloakTokenResponse } from 'src/common/intefaces/gim-responses.interfaces';
import { LoggerService } from 'src/common/logger.service.ts';

import { DinardapAntService } from '../dinardap-ant/dinardap-ant.service';
// import { CreateClientDto } from './dto/create-client.dto';
import { CreateGimDto } from './dto/create-gim.dto';
import FindBondNumberDto from './dto/find-bond-number';
import { GetClientGimDto } from './dto/get-client-gim.dto';
import { Consts } from './helpers/consts.enum';
import {
  CreateNaturalPersonResponse,
  DepositResponse,
  EmisionTitleCreditCardResponse,
  EmitInfractionSimertResponse,
  FindTaxPayerResponse,
  Obligation,
  ObligationsClientResponse,
  ObligationsResponse,
  VehicleTypesGimResponse,
} from './interfaces/gim-responses.interfaces';

/**
 * Service that integrates Simert with the GIM municipal platform: issues
 * infractions and sanctions, manages taxpayer/natural-person records, queries
 * obligations, emits credit-card titles and deposits, and handles GIM
 * authentication. Delegates persistence to IncidentService/IncidentTypeService
 * and shared logic to CommonGimService/CommonAuthService.
 */
@Injectable()
export class GimService {
  private readonly logger = new Logger('GimService');
  private readonly gimBaseUrl: string;
  private readonly gimBaseUrlLogin: string;
  private readonly gim2RealmMunicipio: string;
  private token: string;

  /**
   * Creates the GIM service and resolves GIM base URLs and realm from config.
   *
   * @param commonAuthService Shared authentication service used to resolve users by identity card.
   * @param configService Configuration service used to read GIM environment variables.
   * @param incidentService Incident service used to persist and update incidents.
   * @param incidentTypeService Incident-type service used to resolve incident-type codes.
   * @param commonGimService Shared GIM service that supplies fresh GIM access tokens.
   * @param dinardapAntService DINARDAP/ANT service used to fetch vehicle owner data.
   * @param loggerService Audit logger used to record GIM integration failures.
   */
  constructor(
    private readonly commonAuthService: CommonAuthService,
    private readonly configService: ConfigService,
    private readonly incidentService: IncidentService,
    private readonly incidentTypeService: IncidentTypeService,
    private readonly commonGimService: CommonGimService,
    private readonly dinardapAntService: DinardapAntService,
    private readonly loggerService: LoggerService,
  ) {
    this.gimBaseUrl = this.configService.get<string>('GIM_BASE_URL'); // Default or Env
    this.gimBaseUrlLogin =
      this.configService.get<string>('GIM_BASE_URL_LOGIN'); // Default or Env
    this.gim2RealmMunicipio = this.configService.get<string>(
      'GIM2_REALM_MUNICIPIO',
    ); // Default or Env
    // this.token = this.configService.get<string>('GIM_TOKEN'); // No longer used
  }

  /**
   * Retrieves a fresh GIM access token from CommonGimService and caches it
   * on the instance.
   *
   * @returns The current GIM Bearer token.
   */
  public getToken(): string {
    this.token = this.commonGimService.getTokenGim2();
    return this.token;
  }

  /**
   * Builds the standard headers for authenticated JSON requests to GIM:
   * a JSON content type plus a fresh Bearer token obtained from
   * `CommonGimService`. Centralizing this avoids repeating the header
   * literal on every outbound call.
   *
   * @returns Headers object ready to pass to axios.
   */
  private _authJsonHeaders(): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${this.getToken()}`,
    };
  }

  /**
   * Strips diacritics (accents) from a string and trims it. Matches the
   * normalization GIM expects for person names and address fields.
   *
   * @param text Input text; defaults to an empty string when undefined.
   * @returns The accent-free, trimmed text.
   */
  private _removeAccents(text: string = ''): string {
    return text.normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
  }

  /**
   * Normalizes an Ecuadorian phone number: keeps digits only and ensures a
   * leading zero, as required by the GIM person registration endpoints.
   *
   * @param rawPhone Raw phone value (may contain separators or be empty).
   * @returns The digit-only phone number prefixed with a leading zero.
   */
  private _normalizeEcuadorPhone(rawPhone: unknown): string {
    const digits = String(rawPhone || '').replace(/\D/g, '');
    return digits.startsWith('0') ? digits : '0' + digits;
  }

  /**
   * Performs an authenticated JSON POST against a GIM "external" API endpoint.
   * Centralizes base-URL composition and Bearer-token header construction so
   * each operation only declares the endpoint path and request body, removing
   * the repeated `axios.post(url, body, { headers })` boilerplate.
   *
   * @typeParam T Expected response payload shape.
   * @param endpointPath Path under `/api/external/` (e.g. `findTaxPayer`).
   * @param body Request payload serialized as JSON.
   * @returns The parsed response body returned by GIM.
   */
  private async _postToExternalApi<T>(
    endpointPath: string,
    body: unknown,
  ): Promise<T> {
    const url = `${this.gimBaseUrl}/api/external/${endpointPath}`;
    console.log("------> URL", url);
    console.log("------> BODY", body);
    console.log("------> HEADERS", this._authJsonHeaders());
    try {
      const { data } = await axios.post<T>(url, body, {
        headers: this._authJsonHeaders(),
      });
      return data;
    } catch (error) {
      this._logGimServerError(endpointPath, url, error);
      throw error;
    }
  }

  /**
   * Classifies an error raised by an outbound GIM call and, when it indicates
   * that the GIM server itself is unavailable — a transport failure (no HTTP
   * response: DNS, connection refused, socket hang up), a timeout, or a 5xx
   * response — returns a normalized client response flagged with
   * `HTTP_ERROR_REINTENT` so the front can tell the user the GIM resource
   * failed and retry. Returns `null` for any other error (e.g. a logical 4xx),
   * letting the caller keep its own business-error handling.
   *
   * @param error Error thrown by axios / `_postToExternalApi`.
   * @returns A client response when the GIM server is unreachable; otherwise `null`.
   */
  private _gimServerErrorOrNull(
    error: any,
  ): { errorCode: number; data: null; message: string } | null {
    const status = error?.response?.status;
    const isTransportError = axios.isAxiosError(error) && !error.response;
    const isTimeout =
      error?.code === 'ECONNABORTED' || error?.code === 'ETIMEDOUT';
    const isServerError = typeof status === 'number' && status >= 500;

    if (isTransportError || isTimeout || isServerError) {
      return {
        errorCode: ErrorCode.HTTP_ERROR_REINTENT,
        message:
          'No hay comunicación con el municipio (GIM), el recurso no está disponible, por favor intente más tarde',
        data: null,
      };
    }

    return null;
  }

  /**
   * Records a real GIM integration failure (transport error, timeout or 5xx) in
   * the `logsgim` collection. Uses {@link _gimServerErrorOrNull} as the
   * classifier, so logical 4xx business responses are ignored. Fire-and-forget:
   * never alters the caller flow.
   *
   * @param method Operation or GIM endpoint path that failed.
   * @param endpoint GIM endpoint URL invoked.
   * @param error Error thrown by the outbound GIM call.
   */
  private _logGimServerError(
    method: string,
    endpoint: string,
    error: any,
  ): void {
    const serverError = this._gimServerErrorOrNull(error);
    if (!serverError) return;

    this.loggerService.saveLogsGimLogger({
      resource: 'GIM',
      service: 'GimService',
      method,
      endpoint,
      httpStatus: error?.response?.status,
      errorCode: serverError.errorCode,
      message: serverError.message,
      response: error?.response?.data,
      exception: error?.name
        ? `${error.name}: ${error.message}`
        : String(error),
    });
  }

  /**
   * Records a GIM natural-person creation failure in the `logsgim` collection,
   * capturing GIM's raw response so the rejection reason (code / message /
   * validationErrors) is available for diagnosis.
   *
   * Complements {@link _logGimServerError}: this covers business rejections
   * (HTTP 200 with a negative payload) and non-server (4xx) errors, while real
   * 5xx/transport failures are logged at the {@link _postToExternalApi} layer.
   *
   * @param method Calling method name recorded in the log.
   * @param fields Failure details captured from the GIM response.
   * @param fields.httpStatus HTTP status of the GIM response (200 for business rejections).
   * @param fields.errorCode Mapped application error code.
   * @param fields.message Human-readable rejection reason, when available.
   * @param fields.response Raw GIM response body (holds the rejection reason).
   * @param fields.exception Exception summary, for error (4xx) cases.
   */
  private _logGimCreateFailure(
    method: string,
    fields: {
      httpStatus?: number;
      errorCode?: number;
      message?: string;
      response?: any;
      exception?: string;
    },
  ): void {
    this.loggerService.saveLogsGimLogger({
      resource: 'GIM',
      service: 'GimService',
      method,
      endpoint: `${this.gimBaseUrl}/api/external/createNewNaturalPerson`,
      ...fields,
    });
  }

  /**
   * Issues an incident debt in GIM end to end: completes missing client data
   * from the ANT, resolves or creates the GIM resident, checks whether the
   * debt was already issued, emits the infraction when needed, and updates the
   * local incident with the resulting obligation.
   *
   * @param createGimDto Incident data used to issue the debt in GIM.
   * @param incidentId Identifier of the local incident to update.
   * @param isTransacional Flag indicating whether the update runs within a transaction.
   * @returns Object with the error code, optional message and the resulting data.
   */
  async issueIncidentGim(
    createGimDto: CreateGimDto,
    incidentId: number,
    isTransacional: number,
  ): Promise<{
    errorCode: number;
    data: CreateGimDto | null | any;
    message?: string;
  }> {
    try {
      // Check whether identity card, email, name and residentId are present
      let dataUserComplete = false;
      if (
        createGimDto.identityCard &&
        createGimDto.emailClient &&
        createGimDto.fullNameClient
      ) {
        dataUserComplete = true;
      }

      if (!dataUserComplete) {
        // Fetch data from the ANT (identity card, first/last name and email)
        const antData =
          await this.dinardapAntService.getUserDataByPlateAnt(
            createGimDto.plate,
          );

        if (antData.errorCode !== ErrorCode.NONE) {
          return {
            errorCode: ErrorCode.NOT_FOUND,
            message: 'Error al obtener la cedula desde la ANT',
            data: antData,
          };
        }
        createGimDto.identityCard = antData.data.identityCard;
        createGimDto.emailClient = antData.data.email;
        createGimDto.fullNameClient = antData.data.fullName;
        createGimDto.firstName = antData.data.firstName;
        createGimDto.lastName = antData.data.lastName;
      }

      let residentIdComplete = false;
      if (
        createGimDto.optionalData.find(
          (item) => item.key === 'residentId',
        )?.value
      ) {
        residentIdComplete = true;
      }

      if (!residentIdComplete) {
        // Fetch the client from GIM by identity card and extract its residentId
        const dataUserGim = await this.getUserByIdentityCardGim(
          createGimDto.identityCard,
        );

        if (dataUserGim.errorCode !== ErrorCode.NONE) {
          // Create the client in GIM when it does not exist yet
          const createClientGimDto = new CreateClientGimDto();
          createClientGimDto.identityCard = createGimDto.identityCard;
          createClientGimDto.emailClient = createGimDto.emailClient;
          createClientGimDto.firstName = createGimDto.firstName;
          createClientGimDto.lastName = createGimDto.lastName;
          createClientGimDto.controllerId = createGimDto.controllerId;

          const createClientGim =
            await this.createNewNaturalPersonGim(
              createClientGimDto,
            );

          if (createClientGim.errorCode !== ErrorCode.NONE) {
            return {
              errorCode: ErrorCode.NOT_FOUND,
              message: 'Error al crear el cliente en el GIM',
              data: createClientGim,
            };
          }
          // Add the residentId to the DTO so it is persisted in our database
          createGimDto.optionalData = createGimDto.optionalData || [];
          createGimDto.optionalData.push({
            key: 'residentId',
            value: createClientGim.residentDTO.id,
          });
        } else {
          // Add the residentId to the DTO so it is persisted in our database
          createGimDto.optionalData = createGimDto.optionalData || [];
          createGimDto.optionalData.push({
            key: 'residentId',
            value: dataUserGim.taxpayer.id,
          });
        }
      }

      // Check whether the debt was already issued in GIM
      const debtData = await this.findObligationsByCitation(
        createGimDto.nroTicket,
        createGimDto.identityCard,
      );

      if (debtData.errorCode === ErrorCode.NONE) {
        const validateStatus = await this._validateStatusSistemWithGim(
          debtData.data.obligations,
        );
        if (validateStatus.errorCode === ErrorCode.NONE) {
          createGimDto.statusIncident = validateStatus.statusIncident;
          const updateDto = this._buildAntDataResponse(
            debtData.data.obligations[0],
            validateStatus.statusIncident,
          );
          await this.incidentService.update(
            incidentId,
            updateDto,
            isTransacional,
          );
        }
        return validateStatus;
      }

      // Issue the debt in GIM
      const responeEmit = await this.emitInfractionGim(createGimDto);

      if (responeEmit.errorCode !== ErrorCode.NONE) {
        return {
          errorCode: ErrorCode.NOT_FOUND,
          message: responeEmit.data?.message,
          data: responeEmit.data,
        };
      }

      const obligation = {
        obligationId: +responeEmit.data.bondId,
        obligationNumber: responeEmit.data.bondNumber.toString(),
      } as Obligation;

      // Re-query to refresh the amount to pay; only runs on the first issuance
      const findObligation = await this.findObligationsByCitation(
        createGimDto.nroTicket,
        createGimDto.identityCard,
      );
      if (findObligation.errorCode === ErrorCode.NONE) {
        obligation.total =
          findObligation.data?.obligations?.[0]?.total ||
          createGimDto.amount;
      }

      const updateDto = this._buildAntDataResponse(
        obligation,
        IncidentStatus.SUPPLIED,
      );
      await this.incidentService.update(
        incidentId,
        updateDto,
        isTransacional,
      );

      return {
        errorCode: ErrorCode.NONE,
        message: 'Deuda emitida correctamente',
        data: updateDto,
      };
    } catch (error) {
      this.logger.error(`Error emitirIncidenteGim: ${error.message}`);
      return {
        errorCode: ErrorCode.NOT_FOUND,
        message:
          'Error al generar la deuda en el GIM notificar al administrador',
        data: null,
      };
    }
  }

  /**
   * Builds an incident update DTO from an obligation and its mapped status,
   * setting the GIM bond id, obligation number, status and amount.
   *
   * @param obligation Obligation returned by GIM.
   * @param statusIncident Local incident status mapped from the obligation.
   * @returns The populated incident update DTO.
   */
  private _buildAntDataResponse(
    obligation: Obligation,
    statusIncident: IncidentStatus,
  ): UpdateIncidentDto {
    const updateDto = new UpdateIncidentDto();
    updateDto.bondId = obligation.obligationId;
    updateDto.nroObligation = obligation.obligationNumber;
    updateDto.statusIncident = statusIncident;
    if (obligation.total) updateDto.amount = obligation.total;

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

  /**
   * Builds an incident update DTO from an obligation, merging the existing
   * incident's optional data (residentId) and appending the obligation to the
   * external-response history.
   *
   * @param obligation Obligation returned by GIM.
   * @param statusIncident Local incident status mapped from the obligation.
   * @param incident Current incident whose optional and external-response data is merged.
   * @returns The populated incident update DTO.
   */
  private _buildObligationDataResponse(
    obligation: Obligation,
    statusIncident: IncidentStatus,
    incident: Incident,
  ): UpdateIncidentDto {
    const updateDto = new UpdateIncidentDto();
    updateDto.bondId = obligation.obligationId;
    updateDto.nroObligation = obligation.obligationNumber;
    updateDto.statusIncident = statusIncident;
    if (obligation.total) updateDto.amount = obligation.total;

    const currentOptionalData = incident.optionalData;
    const currentOnResponseExternal = incident.onResponseExternal;

    if (obligation.taxpayerId != null) {
      const optionalData = [...(currentOptionalData ?? [])];
      const idx = optionalData.findIndex(
        (item) => item.key === 'residentId',
      );
      if (idx >= 0) {
        optionalData[idx] = {
          ...optionalData[idx],
          value: obligation.taxpayerId,
        };
      } else {
        optionalData.push({
          key: 'residentId',
          value: obligation.taxpayerId,
        });
      }
      updateDto.optionalData = optionalData;
    }

    // onResponseExternal: append obligation to the existing array
    updateDto.onResponseExternal = [
      ...(currentOnResponseExternal ?? []),
      obligation,
    ];

    return updateDto;
  }

  /**
   * Looks up a GIM taxpayer by identification number through the
   * `findTaxPayer` external endpoint.
   *
   * @param identificationNumber Identity card or RUC to search for.
   * @returns Object with the error code and the taxpayer when found.
   */
  async getUserByIdentityCardGim(
    identificationNumber: string,
  ): Promise<{ errorCode: number } & Partial<FindTaxPayerResponse>> {
    try {
      const body = {
        identificationNumber: identificationNumber,
      };

      const data = await this._postToExternalApi<FindTaxPayerResponse>(
        'findTaxPayer',
        body,
      );

      if (data.ok && +data.code === 200) {
        return {
          errorCode: ErrorCode.NONE,
          taxpayer: data.taxpayer,
        };
      }

      return {
        errorCode: ErrorCode.NOT_FOUND,
        taxpayer: null,
      };
    } catch (error: any) {
      this.logger.error(
        `Error getUserByIdentityCardGim: ${error.message}`,
      );

      return {
        errorCode: ErrorCode.HTTP_ERROR_REINTENT,
        taxpayer: null,
      };
    }
  }

  /**
   * Creates a natural person in GIM. Reuses the local user's data when the
   * identity card exists in our system; otherwise builds a minimal default
   * payload. Persists the resulting GIM residentId back to the local user.
   *
   * @param createClientGimDto Client data used to build the GIM natural-person payload.
   * @returns Object with the error code and the created residentDTO when successful.
   */
  async createNewNaturalPersonGim(
    createClientGimDto: CreateClientGimDto,
  ): Promise<
    { errorCode: number; data?: any } & Partial<CreateNaturalPersonResponse>
  > {
    try {
      // For local development testing only
      // createGimDto.identityCard = '1104187768';

      // Check the user in our own system first
      const user = await this.commonAuthService.filterByIdentityCard(
        createClientGimDto.controllerId,
        createClientGimDto.identityCard,
      );

      let body = null;

      if (user.errorCode !== ErrorCode.NONE) {
        body = {
          identificationType: mapIdentificationTypeToGim(
            TypeIdentifyCard.NATIONAL_IDENTITY_DOCUMENT,
          ),
          identificationNumber:
            createClientGimDto.identityCard?.trim(),
          firstName: this._removeAccents(
            createClientGimDto.firstName || 'Usuario',
          ),
          lastName: this._removeAccents(
            createClientGimDto.firstName || 'Usuario',
          ),
          country: Consts.COUNTRY_GIM,
          city: Consts.CITY_GIM,
          neighborhood: '',
          address: Consts.CITY_GIM,
          email:
            createClientGimDto.emailClient?.trim().toLowerCase() ||
            '',
          phoneNumber: '',
          isForeigner: false,
          birthday: new Date().toISOString().split('T')[0], // current UTC date as YYYY-MM-DD
          gender: TypeGenre.UNDEFINED, // already the correct string value
          maritalStatus: TypeMaritalStatus.SINGLE, // already the correct string value
          isDead: false,
          isHandicaped: false,
        };

        // return {
        //   errorCode: ErrorCode.NOT_FOUND,
        //   message: 'Error al obtener los datos del cliente en nuestro sistema Simert',
        //   data: null
        // };
      } else {
        const phoneNumber = this._normalizeEcuadorPhone(
          user.data[0].phone,
        );

        body = {
          identificationType: mapIdentificationTypeToGim(
            user.data[0].identificationType,
          ),
          identificationNumber:
            createClientGimDto.identityCard?.trim(),
          firstName: this._removeAccents(user.data[0].firstName),
          lastName: this._removeAccents(user.data[0].lastName),
          country: Consts.COUNTRY_GIM,
          city: Consts.CITY_GIM,
          neighborhood: this._removeAccents(
            user.data[0].neighborhood,
          ),
          // GIM rejects an empty address ("La dirección no puede ser nula o
          // vacía."), so fall back to the default city when it is missing.
          address:
            this._removeAccents(user.data[0].address) ||
            Consts.CITY_GIM,
          email: user.data[0].email?.trim().toLowerCase(),
          phoneNumber,
          isForeigner: !!user.data[0].isForeigner,
          birthday: user.data[0].birthday?.split('T')[0], // in case it includes a time component
          gender: getGenreNameById(user.data[0].gender), // already the correct string value
          maritalStatus: getMaritalStatusName(
            user.data[0].maritalStatus,
          ), // already the correct string value
          isDead: false,
          isHandicaped: !!user.data[0].isHandicaped,
        };
      }

      const data =
        await this._postToExternalApi<CreateNaturalPersonResponse>(
          'createNewNaturalPerson',
          body,
        );

      if (
        user &&
        user.errorCode === ErrorCode.NONE &&
        data?.residentDTO?.id
      )
        this.commonAuthService.updateResidentId(
          user.data[0].id,
          createClientGimDto.identityCard,
          data.residentDTO.id,
        );

      if (data.ok && +data.code === 200) {
        return {
          errorCode: ErrorCode.NONE,
          residentDTO: data.residentDTO,
        };
      } else {
        // Client already exists in GIM but was not found earlier (it may have been registered after the initial search)
        if (data.code === '404' && data.residentDTO) {
          return {
            errorCode: ErrorCode.NONE,
            residentDTO: data.residentDTO,
            message: data.message,
          };
        }
      }

      // GIM did not return a residentDTO: log the raw response so the rejection
      // reason (code/message/validationErrors) is visible for diagnosis.
      this.logger.warn(
        `createNewNaturalPersonGim: GIM sin residentDTO -> ${JSON.stringify(data)}`,
      );
      this._logGimCreateFailure('createNewNaturalPersonGim', {
        httpStatus: 200,
        errorCode: ErrorCode.NOT_FOUND,
        message: (data as any)?.message,
        response: data,
      });
      return {
        errorCode: ErrorCode.NOT_FOUND,
        residentDTO: null,
      };
    } catch (error: any) {
      this.logger.error(` ${error}`);
      this.logger.error(`Error createClientGim: ${error.message}`);
      // Log the raw GIM response body (e.g. a 500) so the server-side failure
      // reason is visible instead of just the generic Axios status message.
      this.logger.error(
        `createNewNaturalPersonGim: GIM HTTP ${error?.response?.status} body -> ${JSON.stringify(error?.response?.data)}`,
      );
      // Persist 4xx / non-server GIM failures in logsgim (5xx/transport are
      // already captured by _postToExternalApi) so the reason is queryable.
      if (!this._gimServerErrorOrNull(error)) {
        this._logGimCreateFailure('createNewNaturalPersonGim', {
          httpStatus: error?.response?.status,
          errorCode: ErrorCode.HTTP_ERROR_REINTENT,
          message: error?.message,
          response: error?.response?.data,
          exception: error?.name
            ? `${error.name}: ${error.message}`
            : String(error),
        });
      }

      return {
        errorCode: ErrorCode.HTTP_ERROR_REINTENT,
        residentDTO: null,
      };
    }
  }

  /**
   * Creates a natural person in GIM directly from the provided DTO, without
   * looking the user up in the local system. Used when the client data is
   * supplied explicitly.
   *
   * @param createClientGimNotExistDto Explicit client data used to build the GIM payload.
   * @returns Object with the error code and the created residentDTO when successful.
   */
  async createNewNaturalPersonGimNoExist(
    createClientGimNotExistDto: CreateClientGimNotExistDto,
  ): Promise<
    { errorCode: number; data?: any } & Partial<CreateNaturalPersonResponse>
  > {
    try {
      const phoneNumber = this._normalizeEcuadorPhone(
        createClientGimNotExistDto.phoneNumber,
      );

      const body = {
        identificationType: mapIdentificationTypeToGim(
          createClientGimNotExistDto.identificationType,
        ),
        identificationNumber:
          createClientGimNotExistDto.identificationNumber?.trim(),
        firstName: this._removeAccents(
          createClientGimNotExistDto.firstName || 'Usuario',
        ),
        lastName: this._removeAccents(
          createClientGimNotExistDto.lastName ||
          createClientGimNotExistDto.firstName ||
          'Usuario',
        ),
        country: Consts.COUNTRY_GIM,
        city: Consts.CITY_GIM,
        neighborhood: this._removeAccents(
          createClientGimNotExistDto.neighborhood,
        ),
        address: this._removeAccents(
          createClientGimNotExistDto.address || Consts.CITY_GIM,
        ),
        email: createClientGimNotExistDto.email?.trim().toLowerCase(),
        phoneNumber,
        isForeigner: !!createClientGimNotExistDto.isForeigner,
        birthday: createClientGimNotExistDto.birthday?.split('T')[0], // in case it includes a time component
        gender: getGenreNameById(createClientGimNotExistDto.gender), // already the correct string value
        maritalStatus: getMaritalStatusName(
          createClientGimNotExistDto.maritalStatus,
        ), // already the correct string value
        isDead: false,
        isHandicaped: !!createClientGimNotExistDto.isHandicaped,
      };

      const data =
        await this._postToExternalApi<CreateNaturalPersonResponse>(
          'createNewNaturalPerson',
          body,
        );

      if (data.ok && +data.code === 200) {
        return {
          errorCode: ErrorCode.NONE,
          residentDTO: data.residentDTO,
        };
      } else {
        // Client already exists in GIM but was not found earlier (it may have been registered after the initial search)
        if (data.code === '404' && data.residentDTO) {
          return {
            errorCode: ErrorCode.NONE,
            residentDTO: data.residentDTO,
            message: data.message,
          };
        }
      }

      // Capture GIM's rejection reason (code/message/validationErrors) so we
      // can diagnose why the resident was not created (200 "not created").
      this._logGimCreateFailure('createNewNaturalPersonGimNoExist', {
        httpStatus: 200,
        errorCode: ErrorCode.NOT_FOUND,
        message: (data as any)?.message,
        response: data,
      });

      return {
        errorCode: ErrorCode.NOT_FOUND,
        residentDTO: null,
      };
    } catch (error: any) {
      this.logger.error(` ${error}`);
      this.logger.error(`Error createClientGim: ${error.message}`);
      // Persist 4xx / non-server GIM failures in logsgim (5xx/transport are
      // already captured by _postToExternalApi) so the reason is queryable.
      if (!this._gimServerErrorOrNull(error)) {
        this._logGimCreateFailure('createNewNaturalPersonGimNoExist', {
          httpStatus: error?.response?.status,
          errorCode: ErrorCode.HTTP_ERROR_REINTENT,
          message: error?.message,
          response: error?.response?.data,
          exception: error?.name
            ? `${error.name}: ${error.message}`
            : String(error),
        });
      }

      return {
        errorCode: ErrorCode.HTTP_ERROR_REINTENT,
        residentDTO: null,
      };
    }
  }

  /**
   * Verifies an incident in GIM through the `verifateIncidentSimert`
   * external endpoint.
   *
   * @param id Identifier of the incident to verify in GIM.
   * @returns Object with the error code and the taxpayer data when found.
   */
  async verifateIncidentGim(
    id: string,
  ): Promise<{ errorCode: number } & Partial<FindTaxPayerResponse>> {
    try {
      const url = `${this.gimBaseUrl}/api/external/verifateIncidentSimert`;

      const body = {
        id: id,
      };

      const { data } = await axios.post<FindTaxPayerResponse>(url, body);

      if (data.ok && +data.code === 200) {
        return {
          errorCode: ErrorCode.NONE,
          taxpayer: data.taxpayer,
        };
      }

      return {
        errorCode: ErrorCode.NOT_FOUND,
        taxpayer: null,
      };
    } catch (error: any) {
      this.logger.error(`Error verifateIncidentGim: ${error.message}`);
      this._logGimServerError(
        'verifateIncidentGim',
        `${this.gimBaseUrl}/api/external/verifateIncidentSimert`,
        error,
      );

      return {
        errorCode: ErrorCode.HTTP_ERROR_REINTENT,
        taxpayer: null,
      };
    }
  }

  // Issue the debt directly into GIM
  /**
   * Emits an infraction (sanction) in GIM via `emitSimertSanction`, resolving
   * the incident-type code and building the request body from the incident
   * data. Maps GIM error responses (closed till, disallowed entry code) to
   * Spanish messages.
   *
   * @param createGimDto Incident data used to build the GIM sanction request.
   * @returns Object with the error code, optional message and the GIM response.
   */
  async emitInfractionGim(createGimDto: CreateGimDto): Promise<{
    errorCode: number;
    data: EmitInfractionSimertResponse | null;
    message?: string;
  }> {
    try {
      // OBTENER EL TIPO DE INCIDENTE
      const typeIncident =
        await this.incidentTypeService.getTypeIncidentById(
          createGimDto.incidentTypeId,
        );

      if (typeIncident.errorCode !== ErrorCode.NONE) {
        return {
          errorCode: ErrorCode.NOT_FOUND,
          message: typeIncident.message,
          data: null,
        };
      }

      // GIM `emitSimertSanction` request body — field reference:
      //   `residentId`          | Long   | **Yes** | Offender ID in the GIM system.
      // | `entryCode`           | String | **Yes** | Infraction code (e.g. `"580"`, `"582"`).
      // | `description`         | String | **Yes** | Sanction detail.
      // | `reference`           | String | **Yes** | Citation ticket number or legal reference.
      // | `infringementDate`    | String | **Yes** | Infraction date in **YYYY-MM-DD** format.
      // | `numberPlate`         | String | No      | Offending vehicle plate.
      // | `notificationNumber`  | String | No      | Printed ticket serial/notification number.
      // | `vehicleType`         | Long   | No      | Vehicle-type ID (per GIM catalog).
      // | `address`             | String | No      | Location where the infraction occurred.
      const residentId = createGimDto.optionalData.find(
        (item: any) => item.key === 'residentId',
      )?.value;
      const body = {
        residentId: Number(residentId), // Default or map
        entryCode: typeIncident.incidentType.code,
        description: createGimDto.description,
        reference: createGimDto.reference, // Placeholder as per user example, ideally map from address/coords
        infringementDate: new Date(createGimDto.createdAt)
          .toISOString()
          .split('T')[0],
        numberPlate: createGimDto.plate,
        notificationNumber: createGimDto.nroTicket,
        vehicleType: createGimDto.vehicleType
          ? Number(createGimDto.vehicleType)
          : TypeSizeVehicle.VEHICLE,
        address: createGimDto.address, // Placeholder
      };

      const data =
        await this._postToExternalApi<EmitInfractionSimertResponse>(
          'emitSimertSanction',
          body,
        );

      if (data && data.ok && +data.code === ResponseCodeGim.SUCCESS) {
        return { errorCode: ErrorCode.NONE, data };
      }

      if (!data.ok && data.code === '400') {
        return {
          errorCode: ErrorCode.NOT_FOUND,
          message:
            'Fuera del horario, jornada no aperturada, comuniquese con el administrador',
          data,
        };
      }

      return {
        errorCode: ErrorCode.NOT_FOUND,
        message: data.message,
        data,
      };
    } catch (error) {
      const responseData = error?.response?.data;

      if (responseData) {
        if (!responseData.ok && responseData.code === '400') {
          const innerMessage: string = responseData.message ?? '';

          // Detect "rubro not allowed" error
          if (innerMessage.includes('SIMERT_SANCTION_ENTRY_CODES')) {
            const rubroMatch = innerMessage.match(/rubro\s+(\d+)/i);
            const rubro = rubroMatch?.[1] ?? '';
            this.logger.warn(
              `emitInfractionGim catch rubro no permitido: ${innerMessage}`,
            );
            return {
              errorCode: ErrorCode.NOT_FOUND,
              message: `El rubro ${rubro}, no esta correctamente definido o no esta permitido por favor comuniquese con el administrador`,
              data: responseData,
            };
          }

          this.logger.warn(
            `emitInfractionGim catch jornada cerrada: ${innerMessage}`,
          );
          return {
            errorCode: ErrorCode.NOT_FOUND,
            message:
              'Fuera del horario, jornada no aperturada en el municipio, comuniquese con el administrador',
            data: responseData,
          };
        }

        if (!responseData.ok) {
          return {
            errorCode: ErrorCode.HTTP_ERROR_REINTENT,
            message: responseData.message,
            data: responseData,
          };
        }
      }

      return {
        errorCode: ErrorCode.HTTP_ERROR_REINTENT,
        message:
          'Error interno del municipio al generar la deuda, por favor intente más tarde',
        data: null,
      };
    }
  }

  // Look up an obligation by ticket number
  /**
   * Looks up a bond (obligation) in GIM by ticket number and identity card via
   * the `findBondByNumber` endpoint.
   *
   * @param findBondNumberDto DTO holding the ticket number and identity card to search for.
   * @returns Object with the error code, optional message and the bond data when found.
   */
  async findBondByNumber(
    findBondNumberDto: FindBondNumberDto,
  ): Promise<{ errorCode: number; data: any; message?: string }> {
    try {
      const url = `${this.gimBaseUrl}/api/external/findBondByNumber`;
      const body = {
        bondNumber: findBondNumberDto.nroTicket,
        identificationNumber: findBondNumberDto.identityCard,
      };
      const { data } = await axios.post(url, body);
      if (
        data &&
        data.ok &&
        +data.code === ResponseCodeGim.SUCCESS &&
        data.bond
      ) {
        return {
          errorCode: ErrorCode.NONE,
          data: data.data,
        };
      } else {
        return {
          errorCode: ErrorCode.NOT_FOUND,
          message: 'No se encontro la deuda',
          data: null,
        };
      }
    } catch (error) {
      this.logger.error(`Error findBondByNumber: ${error.message}`);
      this._logGimServerError(
        'findBondByNumber',
        `${this.gimBaseUrl}/api/external/findBondByNumber`,
        error,
      );
      return {
        errorCode: ErrorCode.NOT_FOUND,
        message: error.message,
        data: null,
      };
    }
  }

  // Look up an obligation by ticket number AND identity card (returns ALL the
  // person's debts across every status — not just pending ones)
  /**
   * Looks up obligations in GIM by citation (ticket) number and identity card
   * via `findObligationsByCitation`. Returns all the person's debts regardless
   * of status; an empty list means the debt has not been issued yet.
   *
   * @param number Citation (ticket) number to search for.
   * @param identityCard Identity card of the taxpayer.
   * @returns Object with the error code, optional message and the obligations response.
   */
  async findObligationsByCitation(
    number: string,
    identityCard: string,
  ): Promise<{
    errorCode: number;
    data: ObligationsResponse;
    message?: string;
  }> {
    try {
      const body = {
        citationNumber: number, // Ticket number
        identificationNumber: identityCard, // Identity card
      };
      const data = await this._postToExternalApi<ObligationsResponse>(
        'findObligationsByCitation',
        body,
      );
      // An empty obligations list means the debt has not been issued yet
      if (
        data &&
        data.ok &&
        +data.code === ResponseCodeGim.SUCCESS &&
        data.obligations &&
        data.obligations.length > 0
      ) {
        if (data.obligations.length > 1)
          this.logger.debug(
            'El número de obligaciones por citación es de: ',
            data.obligations.length,
          );

        return {
          errorCode: ErrorCode.NONE,
          data: data,
        };
      } else {
        return {
          errorCode: ErrorCode.NOT_FOUND,
          message: 'No se encontro la deuda',
          data: null,
        };
      }
    } catch (error) {
      this.logger.error(
        `Error findObligationsByCitation: ${error.message}`,
      );
      return {
        errorCode: ErrorCode.NOT_FOUND,
        message: error.message,
        data: null,
      };
    }
  }

  // Look up obligations by plate (returns ALL debts associated with the plate)
  /**
   * Looks up obligations in GIM by license plate via
   * `findObligationsByLicensePlate`. Returns all debts associated with the
   * plate; an empty list means no debt has been issued.
   *
   * @param licensePlate License plate to search obligations for.
   * @returns Object with the error code, optional message and the obligations response.
   */
  async findObligationsByLicensePlate(licensePlate: string): Promise<{
    errorCode: number;
    data: ObligationsResponse;
    message?: string;
  }> {
    try {
      const body = {
        licensePlate: licensePlate,
      };
      const data = await this._postToExternalApi<ObligationsResponse>(
        'findObligationsByLicensePlate',
        body,
      );
      // An empty obligations list means the debt has not been issued yet
      if (
        data &&
        data.ok &&
        +data.code === ResponseCodeGim.SUCCESS &&
        data.obligations &&
        data.obligations.length > 0
      ) {
        if (data.obligations.length > 1)
          this.logger.debug(
            'El número de obligaciones por placa es de: ',
            data.obligations.length,
          );

        return {
          errorCode: ErrorCode.NONE,
          data: data,
        };
      } else {
        return {
          errorCode: ErrorCode.NOT_FOUND,
          message: 'No se encontro la deuda',
          data: null,
        };
      }
    } catch (error) {
      this.logger.error(
        `Error findObligationsByLicensePlate: ${error.message}`,
      );
      return {
        errorCode: ErrorCode.NOT_FOUND,
        message: error.message,
        data: null,
      };
    }
  }

  /**
   * Validates the GIM obligation status against the local system status and,
   * when valid, updates the local incident with the mapped status and
   * obligation data.
   *
   * @param debtDataObligations Obligations returned by GIM to validate.
   * @param incidentId Identifier of the local incident to update.
   * @param createGimDto Incident DTO whose status is updated from the validation.
   * @param isTransacional Flag indicating whether the update runs within a transaction.
   * @returns The validation result, including the error code and mapped status.
   */
  public async validateStatusSistemWithGim(
    debtDataObligations: Obligation[],
    incidentId: number,
    createGimDto: CreateGimDto,
    isTransacional: number,
  ) {
    try {
      const validateStatus =
        await this._validateStatusSistemWithGim(debtDataObligations);
      if (validateStatus.errorCode === ErrorCode.NONE) {
        createGimDto.statusIncident = validateStatus.statusIncident;
        const updateDto = this._buildAntDataResponse(
          debtDataObligations[0],
          validateStatus.statusIncident,
        );
        await this.incidentService.update(
          incidentId,
          updateDto,
          isTransacional,
        );
      }
      return validateStatus;
    } catch (error) {
      this.logger.error(
        `Error validateStatusSistemWithGim: ${error.message}`,
      );
      return {
        errorCode: ErrorCode.NOT_FOUND,
        message: error.message,
        data: null,
      };
    }
  }

  // Validate each GIM obligation status against our own system
  /**
   * Maps the first GIM obligation status to the corresponding local
   * IncidentStatus and explanatory message, covering paid, issued, draft,
   * erroneous, cancelled, approved, agreement, on-credit and pending-settlement
   * cases.
   *
   * @param debtDataObligations Obligations returned by GIM; the first one is evaluated.
   * @returns Object with the error code, mapped incident status, message and source data.
   */
  public async _validateStatusSistemWithGim(
    debtDataObligations: Obligation[],
  ): Promise<{
    errorCode: number;
    data: any;
    statusIncident: IncidentStatus | null;
    message?: string;
  }> {
    try {
      const obligation = debtDataObligations[0];
      const { status } = obligation;
      // The status groupings are documented as comments in the IncidentStatus enum

      let statusIncident: IncidentStatus;
      let message: string;

      switch (status) {
        case StatusObligation.EL_CONTRIBUYENTE_HA_CANCELADO_LOS_VALORES_CORRESPONDIENTES:
        case StatusObligation.EL_CONTRIBUYENTE_HA_CANCELADO_LOS_VALORES_USANDO_UNA_VIA_ELECTRONICA:
          statusIncident = IncidentStatus.PAYED;
          message = 'Esta deuda ya fue pagada';
          break;

        case StatusObligation.EMITIDA_Y_ADEUDADA_POR_EL_CONTRIBUYENTE:
        case StatusObligation.MIGRADA_A_SISTEMA_AXIS_CLOUD_ML_DF_2020_733_M:
        case StatusObligation.PROHIBIDA_DE_CANCELAR_POR_POSIBLE_REVISION:
        case StatusObligation.FACTURA_GENERADA_EN_ESPERA_DE_PAGO_POR_COMPENSACION:
          statusIncident = IncidentStatus.SUPPLIED;
          message = 'Esta deuda ya fue emitida';
          break;

        case StatusObligation.CALCULADA_PARA_REVISION_SIN_NINGUN_EFECTO_LEGAL:
          statusIncident = IncidentStatus.ENTERED;
          message = 'Esta deuda ya esta en estado borrador';
          break;

        case StatusObligation.PREEMITIDA_QUE_NO_ES_APROBADA_PARA_EMISION:
        case StatusObligation.TITULO_DE_CREDITO_MAL_EMITIDO_CON_FECHA_ANTERIOR:
          statusIncident = IncidentStatus.ERRONEOUS;
          message = 'Esta deuda estaba en gim como erronea';
          break;

        case StatusObligation.EMITIDA_Y_ANULADA_EN_EL_MISMO_DIA:
        case StatusObligation.EMITIDA_Y_DADA_DE_BAJA_LUEGO_DE_SER_CONTABILIZADA:
          statusIncident = IncidentStatus.CANCELED;
          message = 'Esta deuda ya fue anulada';
          break;

        case StatusObligation.GENERADA_PARA_SU_REVISION_Y_EMISION_EN_RENTAS:
        case StatusObligation.FUTURA:
          statusIncident = IncidentStatus.APPROVED;
          message = 'Esta deuda ya fue pre aprobada';
          break;

        case StatusObligation.A_PAGAR_POR_CUOTAS_MEDIANTE_UN_CONVENIO:
          statusIncident = IncidentStatus.CONVENIO;
          message = 'Esta deuda ya fue anulada';
          break;

        case StatusObligation.PERMITE_GENERAR_ABONOS:
          statusIncident = IncidentStatus.ON_CREDIT;
          message = 'Esta deuda ya esta en abono';
          break;

        case StatusObligation.OBLIGACION_PENDIENTE_DE_LIQUIDACION_MEDIANTE_DEBITO_BANCARIO:
          statusIncident = IncidentStatus.PENDIENTE_LIQUIDACION;
          message = 'Esta deuda ya esta en pendiente de liquidacion';
          break;

        default:
          return {
            errorCode: ErrorCode.NOT_FOUND,
            message:
              'Error al validar el estado de la deuda en el GIM',
            data: debtDataObligations,
            statusIncident: null,
          };
      }
      return {
        errorCode: ErrorCode.NONE,
        message,
        statusIncident,
        data: debtDataObligations,
      };
    } catch (error) {
      this.logger.error(
        `Error validateStatusSistemWithGim: ${error.message}`,
      );
      return {
        errorCode: ErrorCode.NOT_FOUND,
        message: error?.message,
        data: null,
        statusIncident: null,
      };
    }
  }

  // Validate that the GIM till is open
  /**
   * Checks whether the GIM till is currently open (within working hours) via
   * the `validateOpenTill` endpoint, distinguishing timeout, unauthorized and
   * internal-error cases.
   *
   * @returns Object with the error code, a Spanish status message and the response data.
   */
  async validateOpenTill(): Promise<{
    errorCode: number;
    data: any;
    message?: string;
  }> {
    try {
      const data = await this._postToExternalApi<any>(
        'validateOpenTill',
        {},
      );

      if (
        data &&
        data?.ok &&
        Number(data?.code) === 200 &&
        !data?.isOpen
      ) {
        return {
          errorCode: ErrorCode.NOT_FOUND,
          message:
            'Fuera del horario laboral, por favor intente más tarde',
          data: data.data,
        };
      }

      if (
        data &&
        data?.ok &&
        Number(data?.code) === 200 &&
        data?.isOpen
      ) {
        return {
          errorCode: ErrorCode.NONE,
          message: 'Dentro del horario laboral',
          data: data.data,
        };
      }

      return {
        errorCode: ErrorCode.NOT_FOUND,
        message:
          'No se logró verificar el horario laboral, por favor intente más tarde',
        data: null,
      };
    } catch (error: any) {
      this.logger.error(
        'Errro validateOpenTill ',
        error?.response?.status,
        error?.code,
        error?.message,
      );
      const status = error?.response?.status;
      const isTimeout =
        error?.code === 'ECONNABORTED' || error?.code === 'ETIMEDOUT';

      if (isTimeout) {
        this.logger.error(
          `Error validateOpenTill: timeout al conectar con el municipio`,
        );
        return {
          errorCode: ErrorCode.HTTP_ERROR_REINTENT,
          message:
            'No hay comunicación con el municipio, por favor intente más tarde',
          data: null,
        };
      }

      if (status === 401) {
        this.logger.error(
          `Error validateOpenTill: no autorizado (401)`,
        );
        return {
          errorCode: ErrorCode.HTTP_ERROR_REINTENT,
          message:
            'No se pudo verificar al usuario, por favor intente más tarde',
          data: null,
        };
      }

      if (status === 500) {
        this.logger.error(
          `Error validateOpenTill: error interno del municipio (500)`,
        );
        return {
          errorCode: ErrorCode.HTTP_ERROR_REINTENT,
          message:
            'Ocurrió un error al verificar el horario laboral del municipio, por favor intente más tarde',
          data: null,
        };
      }

      this.logger.error(`Error validateOpenTill: ${error?.message}`);
      return {
        errorCode: ErrorCode.HTTP_ERROR_REINTENT,
        message:
          'Ocurrió un error al verificar el horario laboral del municipio, por favor intente más tarde',
        data: null,
      };
    }
  }

  // GIM login to obtain a Keycloak access_token
  /**
   * Authenticates against GIM's Keycloak realm using the password grant and
   * returns the resulting token response.
   *
   * @returns Object with the error code, optional message and the Keycloak token response.
   */
  async loginGim(): Promise<{
    errorCode: number;
    data: KeycloakTokenResponse | null;
    message?: string;
  }> {
    try {
      const url = `${this.gimBaseUrlLogin}/realms/${this.gim2RealmMunicipio}/protocol/openid-connect/token`;

      // x-www-form-urlencoded (matches the Postman setup)
      const form = new URLSearchParams();
      form.append('grant_type', 'password');
      form.append('client_id', 'gim');
      form.append('username', process.env.GIM_USERNAME ?? 'simert_dev');
      form.append('password', process.env.GIM_PASSWORD ?? '');
      form.append('client_secret', process.env.GIM_CLIENT_SECRET ?? '');

      const { data } = await axios.post<KeycloakTokenResponse>(
        url,
        form.toString(),
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            Accept: '*/*',
          },
        },
      );

      // Keycloak responds directly (no "ok" / "data" envelope like other GIM endpoints)
      if (data?.access_token) {
        return { errorCode: ErrorCode.NONE, data };
      }

      return {
        errorCode: ErrorCode.NOT_FOUND,
        message: 'No se pudo obtener access_token desde Keycloak',
        data: null,
      };
    } catch (error: any) {
      const msg =
        error?.response?.data?.error_description ||
        error?.response?.data?.error ||
        error?.message ||
        'Error desconocido';

      this.logger.error(`Error loginGim: ${msg}`);
      this._logGimServerError(
        'loginGim',
        `${this.gimBaseUrlLogin}/realms/${this.gim2RealmMunicipio}/protocol/openid-connect/token`,
        error,
      );
      return { errorCode: ErrorCode.NOT_FOUND, message: msg, data: null };
    }
  }

  // Fetch the vehicle-type catalog from GIM
  /**
   * Fetches the GIM vehicle-type catalog via `findVehicleTypesForSimert` and
   * returns it sorted by id.
   *
   * @returns Object with the error code, optional message and the sorted vehicle types.
   */
  async findVehicleTypesForSimert(): Promise<{
    errorCode: number;
    data: any;
    message?: string;
  }> {
    try {
      const body = {}; // Empty body, as the endpoint requires

      const data = await this._postToExternalApi<VehicleTypesGimResponse>(
        'findVehicleTypesForSimert',
        body,
      );

      // Example response shape:
      // {
      //     "ok": true,
      //     "message": "Transacción exitosa",
      //     "code": "200",
      //     "validationErrors": [],
      //     "vehicleTypes": [ ... ]
      // }

      if (data && data.ok && +data.code === 200) {
        const sorted = data.types.sort((a, b) => a.id - b.id);

        return {
          errorCode: ErrorCode.NONE,
          data: sorted, // Returns vehicleTypes; adjust mapping if the contract changes
        };
      } else {
        return {
          errorCode: ErrorCode.NOT_FOUND,
          message: 'No se encontraron tipos de vehículos',
          data: null,
        };
      }
    } catch (error) {
      this.logger.error(
        `Error findVehicleTypesForSimert: ${error.message}`,
      );
      return {
        errorCode: ErrorCode.NOT_FOUND,
        message: error.message,
        data: null,
      };
    }
  }

  // Issue a credit-card title (simert card) in GIM
  /**
   * Issues a credit-card title (simert card) in GIM via `emitSimertCard`.
   *
   * @param emissionCreditCardDto DTO with the resident, description, reference, entry code and quantity.
   * @returns Object with the error code, optional message and the GIM emission response.
   */
  async emissionTitleCreditCard(
    emissionCreditCardDto: EmissionCreditCardDto,
  ): Promise<{ errorCode: number; data: any; message?: string }> {
    try {
      const body = {
        residentId: emissionCreditCardDto.residentId,
        description: emissionCreditCardDto.description,
        reference: emissionCreditCardDto.reference,
        entryCode: emissionCreditCardDto.entryCode,
        quantity: emissionCreditCardDto.quantity,
      };

      const data =
        await this._postToExternalApi<EmisionTitleCreditCardResponse>(
          'emitSimertCard',
          body,
        );

      if (data && data.ok && +data.code === 200) {
        return {
          errorCode: ErrorCode.NONE,
          data: data,
        };
      } else {
        return {
          errorCode: ErrorCode.NOT_FOUND,
          message: 'No se logró realizar la emisión de la tarjeta',
          data: null,
        };
      }
    } catch (error) {
      this.logger.error(
        `Error emisionTitleCreditCard: ${error.response?.data}`,
      );
      return {
        errorCode: ErrorCode.NOT_FOUND,
        message:
          error.response?.data?.message ||
          'No se logró emitir la tarjeta en el GIM, por favor intente más tarde',
        data: error.response?.data || null,
      };
    }
  }

  // Register a deposit in GIM
  /**
   * Registers a deposit in GIM via `registerDeposit`, coercing the amount to a
   * number before sending.
   *
   * @param registerDepositGimDto DTO with the deposit details, including the amount.
   * @returns Object with the error code, optional message and the GIM deposit response.
   */
  async registerDeposit(
    registerDepositGimDto: RegisterDepositGimDto,
  ): Promise<{ errorCode: number; data: any; message?: string }> {
    try {
      const body = {
        ...registerDepositGimDto,
        amount: Number(registerDepositGimDto.amount),
      };

      const data = await this._postToExternalApi<DepositResponse>(
        'registerDeposit',
        body,
      );

      if (data && data.ok && data.reference && data.total) {
        return {
          errorCode: ErrorCode.NONE,
          data: data,
        };
      } else {
        return {
          errorCode: ErrorCode.NOT_FOUND,
          message: 'No se logró realizar el depósito',
          data: data || null,
        };
      }
    } catch (error) {
      this.logger.error(`Error registerDeposit: ${error}`);
      this.logger.error(`Error registerDeposit: ${error.response?.data}`);
      return {
        errorCode: ErrorCode.NOT_FOUND,
        message:
          error.response?.data?.message ||
          'No se logró registrar el depósito en el GIM, por favor intente más tarde',
        data: error.response?.data || null,
      };
    }
  }

  // Look up a client's obligations
  /**
   * Retrieves a client's obligations (statement) from GIM via `findStatement`,
   * keyed by identification number.
   *
   * @param getClientGimDto DTO holding the client's identification number.
   * @returns Object with the error code, optional message and the obligations response.
   */
  async findObligations(
    getClientGimDto: GetClientGimDto,
  ): Promise<{ errorCode: number; data: any; message?: string }> {
    try {
      const body = {
        identificationNumber: getClientGimDto.identificationNumber,
      };

      const data =
        await this._postToExternalApi<ObligationsClientResponse>(
          'findStatement',
          body,
        );

      if (data && data.ok && data.bonds?.length > 0) {
        return {
          errorCode: ErrorCode.NONE,
          data: data,
        };
      } else {
        return {
          errorCode: ErrorCode.NOT_FOUND,
          message: 'No se lograron obtener las obligaciones',
          data: null,
        };
      }
    } catch (error) {
      this.logger.error(`Error findObligations: ${error.response?.data}`);
      // GIM server unavailable (down/timeout/5xx): tell the front the resource
      // failed and is retriable instead of a generic "not found".
      const serverError = this._gimServerErrorOrNull(error);
      if (serverError) return serverError;
      return {
        errorCode: ErrorCode.NOT_FOUND,
        message:
          error.response?.data?.message ||
          'No se lograron obtener las obligaciones del GIM, por favor intente más tarde',
        data: error.response?.data || null,
      };
    }
  }

  // Emit a traffic sanction in GIM
  /**
   * Emits a traffic sanction in GIM via the `emitSanction` endpoint.
   *
   * @param emissionSanctionDto DTO with the sanction details (entry code, resident, plate, dates, etc.).
   * @returns Object with the error code, optional message and the GIM sanction response.
   */
  async emitSanction(
    emissionSanctionDto: EmissionSanctionDto,
  ): Promise<{ errorCode: number; data: any; message?: string }> {
    try {
      const body = {
        entryCode: emissionSanctionDto.entryCode,
        residentId: emissionSanctionDto.residentId,
        description: emissionSanctionDto.description,
        reference: emissionSanctionDto.reference,
        infringementDate: emissionSanctionDto.infringementDate,
        numberPlate: emissionSanctionDto.numberPlate,
        notificationNumber: emissionSanctionDto.notificationNumber,
        vehicleType: emissionSanctionDto.vehicleType,
      };

      const data =
        await this._postToExternalApi<EmitInfractionSimertResponse>(
          'emitSanction',
          body,
        );

      if (data && data.ok && data.code === '200') {
        return {
          errorCode: ErrorCode.NONE,
          data: data,
        };
      } else {
        return {
          errorCode: ErrorCode.NOT_FOUND,
          message: 'No se logró realizar la emisión de la sanción',
          data: null,
        };
      }
    } catch (error) {
      this.logger.error(`Error emitSanction: ${error.response?.data}`);
      return {
        errorCode: ErrorCode.NOT_FOUND,
        message:
          error.response?.data?.message ||
          'No se logró emitir la sanción en el GIM, por favor intente más tarde',
        data: error.response?.data || null,
      };
    }
  }

  /**
   * Emits an infraction in GIM and updates the local incident with the
   * resulting obligation, without the prior ANT/resident resolution performed
   * by issueIncidentGim.
   *
   * @param createGimDto Incident data used to emit the infraction.
   * @param id Identifier of the local incident to update.
   * @param isTransacional Flag indicating whether the update runs within a transaction.
   * @returns Object with the error code, message and the resulting update DTO or error data.
   */
  async emitInfractionSimert(
    createGimDto: CreateGimDto,
    id: number,
    isTransacional: number,
  ) {
    try {
      // Issue the debt in GIM
      const responeEmit = await this.emitInfractionGim(createGimDto);

      if (responeEmit.errorCode !== ErrorCode.NONE) {
        return {
          errorCode: ErrorCode.NOT_FOUND,
          message: responeEmit.data?.message,
          data: responeEmit.data,
        };
      }

      const obligation = {
        obligationId: +responeEmit.data.bondId,
        obligationNumber: responeEmit.data.bondNumber.toString(),
      } as Obligation;
      const updateDto = this._buildAntDataResponse(
        obligation,
        IncidentStatus.SUPPLIED,
      );
      await this.incidentService.update(id, updateDto, isTransacional);

      return {
        errorCode: ErrorCode.NONE,
        message: 'Deuda emitida correctamente',
        data: updateDto,
      };
    } catch (error) {
      this.logger.error(`Error emitInfractionSimert: ${error.message}`);
      return {
        errorCode: ErrorCode.NOT_FOUND,
        message:
          'Error al generar la deuda en el GIM notificar al administrador',
        data: null,
      };
    }
  }
}
