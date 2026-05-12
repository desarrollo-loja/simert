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
import { ResponseCodeGim, StatusObligation } from 'src/common/glob/responses-gim';
import { getMaritalStatusName } from 'src/common/glob/status/status_marital';
import { getGenreNameById, TypeGenre } from 'src/common/glob/type/type_genre';
import { mapIdentificationTypeToGim } from 'src/common/glob/type/type_identifycard';
import { IncidentStatus } from 'src/common/glob/type/type_incident';
import { TypeMaritalStatus } from 'src/common/glob/type/type_maritalStatus';
import { TypeSizeVehicle } from 'src/common/glob/type/type_size_vehicle';
import { KeycloakTokenResponse } from 'src/common/intefaces/gim-responses.interfaces';

import { DinardapAntService } from '../dinardap-ant/dinardap-ant.service';
// import { CreateClientDto } from './dto/create-client.dto';
import { CreateGimDto } from './dto/create-gim.dto';
import FindBondNumberDto from './dto/find-bond-number';
import { GetClientGimDto } from './dto/get-client-gim.dto';
import { consts } from './helpers/consts.enum';
import { CreateNaturalPersonResponse, DepositResponse, EmisionTitleCreditCardResponse, EmitInfractionSimertResponse, FindTaxPayerResponse, IdentificationType, Obligation, ObligationsClientResponse, ObligationsResponse, VehicleTypesGimResponse } from './interfaces/gim-responses.interfaces';

@Injectable()
export class GimService {
  private readonly logger = new Logger('GimService');
  private readonly gimBaseUrl: string;
  private readonly gimBaseUrlLogin: string;
  private readonly gim2RealmMunicipio: string;
  private token: string;

  constructor(
    private readonly commonAuthService: CommonAuthService,
    private readonly configService: ConfigService,
    private readonly incidentService: IncidentService,
    private readonly incidentTypeService: IncidentTypeService,
    private readonly commonGimService: CommonGimService,
    private readonly dinardapAntService: DinardapAntService,
  ) {
    this.gimBaseUrl = this.configService.get<string>('GIM_BASE_URL'); // Default or Env
    this.gimBaseUrlLogin = this.configService.get<string>('GIM_BASE_URL_LOGIN'); // Default or Env
    this.gim2RealmMunicipio = this.configService.get<string>('GIM2_REALM_MUNICIPIO'); // Default or Env
    // this.token = this.configService.get<string>('GIM_TOKEN'); // YA NO SE USA
  }

  public getToken(): string {
    this.token = this.commonGimService.getTokenGim2();
    return this.token;
  }

  async issueIncidentGim(createGimDto: CreateGimDto, incidentId: number, isTransacional: number): Promise<{ errorCode: number, data: CreateGimDto | null | any, message?: string }> {
    try {

      // VERIFICAR SI TENGO CEDULA, EMAIL, NOMBRE Y RECIDENTID EN OBTIONAL DATA
      let dataUserComplete = false;
      if (createGimDto.identityCard && createGimDto.emailClient && createGimDto.fullNameClient) {
        dataUserComplete = true;
      }

      if (!dataUserComplete) {
        // OBTENER DATOS DESDE LA ANT (cedula, nombre, apellido, correo y mail)
        const antData = await this.dinardapAntService.getUserDataByPlateAnt(createGimDto.plate);

        if (antData.errorCode !== ErrorCode.NONE) {
          return {
            errorCode: ErrorCode.NOT_FOUND,
            message: 'Error al obtener la cedula desde la ANT',
            data: antData
          };
        }
        createGimDto.identityCard = antData.data.identityCard;
        createGimDto.emailClient = antData.data.email;
        createGimDto.fullNameClient = antData.data.fullName;
        createGimDto.firstName = antData.data.firstName;
        createGimDto.lastName = antData.data.lastName;
      }

      let residentIdComplete = false;
      if (createGimDto.optionalData.find((item) => item.key === 'residentId')?.value) {
        residentIdComplete = true;
      }

      if (!residentIdComplete) {
        // OBTENER EL CLIENTE DESDE EL GIM CON LA CEDULA Y SACAR EL RESIDENT ID
        const dataUserGim = await this.getUserByIdentityCardGim(createGimDto.identityCard);
        console.log('dataUserGim', dataUserGim)

        if (dataUserGim.errorCode !== ErrorCode.NONE) {
          //CREAR EL CLIETE EN EL GIM SI NO EXISTE VERIFICAR SIE S RUC O PERSONA FINAL 
          const createClientGimDto = new CreateClientGimDto();
          createClientGimDto.identityCard = createGimDto.identityCard;
          createClientGimDto.emailClient = createGimDto.emailClient;
          createClientGimDto.firstName = createGimDto.firstName;
          createClientGimDto.lastName = createGimDto.lastName;
          createClientGimDto.controllerId = createGimDto.controllerId;

          const createClientGim = await this.createNewNaturalPersonGim(createClientGimDto);
          console.log('createClientGim')
          console.log(createClientGim)

          if (createClientGim.errorCode !== ErrorCode.NONE) {
            return {
              errorCode: ErrorCode.NOT_FOUND,
              message: 'Error al crear el cliente en el GIM',
              data: createClientGim
            };
          }
          // AGREGAR EL RESIDENT ID AL DTO PARA GUARDARLO EN NUESTRA BASE DE DATOS
          createGimDto.optionalData = createGimDto.optionalData || [];
          createGimDto.optionalData.push({ key: 'residentId', value: createClientGim.residentDTO.id });
        } else {
          // AGREGAR EL RESIDENT ID AL DTO PARA GUARDARLO EN NUESTRA BASE DE DATOS
          createGimDto.optionalData = createGimDto.optionalData || [];
          createGimDto.optionalData.push({ key: 'residentId', value: dataUserGim.taxpayer.id });
        }
      }

      // VERIFICAMOS SI LA DEUDA YA FUE EMITIDA en el gim
      const debtData = await this.findObligationsByCitation(createGimDto.nroTicket, createGimDto.identityCard);
      console.log('debtData')
      console.log(debtData)

      if (debtData.errorCode === ErrorCode.NONE) {
        const validateStatus = await this._validateStatusSistemWithGim(debtData.data.obligations);
        console.log('validateStatus')
        console.log(validateStatus)
        if (validateStatus.errorCode === ErrorCode.NONE) {
          createGimDto.statusIncident = validateStatus.statusIncident;
          const updateDto = this._buildAntDataResponse(debtData.data.obligations[0], validateStatus.statusIncident);
          await this.incidentService.update(incidentId, updateDto, isTransacional);
        }
        return validateStatus;
      }

      // MANDAMOS A  EMITIR LA DEUDA EN EL GIM
      const responeEmit = await this.emitInfractionGim(createGimDto);
      console.log('responeEmit')
      console.log(responeEmit)

      if (responeEmit.errorCode !== ErrorCode.NONE) {
        return {
          errorCode: ErrorCode.NOT_FOUND,
          message: responeEmit.data?.message,
          data: responeEmit.data
        };
      }

      const obligation = {
        obligationId: +responeEmit.data.bondId,
        obligationNumber: responeEmit.data.bondNumber.toString()
      } as Obligation

      //llamamos otra ves para actualizar el valor a pagar, solo se ejecuta cuando se emtite la primera vez
      const findObligation = await this.findObligationsByCitation(createGimDto.nroTicket, createGimDto.identityCard);
      if (findObligation.errorCode === ErrorCode.NONE) {
        obligation.total = findObligation.data?.obligations?.[0]?.total || createGimDto.amount;
      }

      const updateDto = this._buildAntDataResponse(obligation, IncidentStatus.SUPPLIED);
      await this.incidentService.update(incidentId, updateDto, isTransacional);

      return {
        errorCode: ErrorCode.NONE,
        message: 'Deuda emitida correctamente',
        data: updateDto
      };

    } catch (error) {
      this.logger.error(`Error emitirIncidenteGim: ${error.message}`);
      return {
        errorCode: ErrorCode.NOT_FOUND,
        message: 'Error al generar la deuda en el GIM notificar al administrador',
        data: null
      };
    }
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

  private _buildObligationDataResponse(obligation: Obligation, statusIncident: IncidentStatus, incident: Incident): UpdateIncidentDto {
    const updateDto = new UpdateIncidentDto();
    updateDto.bondId = obligation.obligationId;
    updateDto.nroObligation = obligation.obligationNumber;
    updateDto.statusIncident = statusIncident;
    if (obligation.total)
      updateDto.amount = obligation.total;

    let currentOptionalData = incident.optionalData;
    let currentOnResponseExternal = incident.onResponseExternal;

    if (obligation.taxpayerId != null) {
      const optionalData = [...(currentOptionalData ?? [])];
      const idx = optionalData.findIndex(item => item.key === 'residentId');
      if (idx >= 0) {
        optionalData[idx] = { ...optionalData[idx], value: obligation.taxpayerId };
      } else {
        optionalData.push({ key: 'residentId', value: obligation.taxpayerId });
      }
      updateDto.optionalData = optionalData;
    }

    // onResponseExternal: push obligation al array existente
    updateDto.onResponseExternal = [...(currentOnResponseExternal ?? []), obligation];

    return updateDto;
  }

  async getUserByIdentityCardGim(identificationNumber: string): Promise<{ errorCode: number } & Partial<FindTaxPayerResponse>> {
    try {
      const url = `${this.gimBaseUrl}/api/external/findTaxPayer`;

      const body = {
        identificationNumber: identificationNumber,
      };

      const { data } = await axios.post<FindTaxPayerResponse>(url, body, {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.getToken()}`,
        },
      });

      console.log('data del usaurio')
      console.log(data)

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
      this.logger.error(`Error getUserByIdentityCardGim: ${error.message}`);

      return {
        errorCode: ErrorCode.HTTP_ERROR_REINTENT,
        taxpayer: null,
      };
    }
  }

  async createNewNaturalPersonGim(createClientGimDto: CreateClientGimDto): Promise<{ errorCode: number, data?: any } & Partial<CreateNaturalPersonResponse>> {
    try {
      const url = `${this.gimBaseUrl}/api/external/createNewNaturalPerson`;

      // PARA PRUEBAS DE DESARROLLO 
      // createGimDto.identityCard = '1104187768';

      //verificamos al usuario en nuestro sistema
      const user = await this.commonAuthService.filterByIdentityCard(createClientGimDto.controllerId, createClientGimDto.identityCard);

      console.log('crenado usurio')
      console.log(user)
      let body = null;

      const removeAccents = (text: string = '') =>
        text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();

      if (user.errorCode !== ErrorCode.NONE) {

        body = {
          identificationType: mapIdentificationTypeToGim(IdentificationType.DNI),
          identificationNumber: createClientGimDto.identityCard?.trim(),
          firstName: removeAccents(createClientGimDto.firstName || 'Usuario'),
          lastName: removeAccents(createClientGimDto.firstName || 'Usuario'),
          country: consts.COUNTRY_GIM,
          city: consts.CITY_GIM,
          neighborhood: '',
          address: consts.CITY_GIM,
          email: createClientGimDto.emailClient?.trim().toLowerCase() || '',
          phoneNumber: '',
          isForeigner: false,
          birthday: new Date().toISOString().split('T')[0], // fecha actual UTC en formato YYYY-MM-DD
          gender: getGenreNameById(TypeGenre.UNDEFINED), // ya devuelve string correcto
          maritalStatus: getMaritalStatusName(TypeMaritalStatus.SINGLE), // ya devuelve string correcto

          isDead: false,
          isHandicaped: false
        };

        // return {
        //   errorCode: ErrorCode.NOT_FOUND,
        //   message: 'Error al obtener los datos del cliente en nuestro sistema Simert',
        //   data: null
        // };
      } else {

        const phoneRaw = String(user.data[0].phone || '').replace(/\D/g, '');
        const phoneNumber = phoneRaw.startsWith('0')
          ? phoneRaw
          : '0' + phoneRaw;

        body = {
          identificationType: mapIdentificationTypeToGim(user.data[0].identificationType),
          identificationNumber: createClientGimDto.identityCard?.trim(),
          firstName: removeAccents(user.data[0].firstName),
          lastName: removeAccents(user.data[0].lastName),
          country: consts.COUNTRY_GIM,
          city: consts.CITY_GIM,
          neighborhood: removeAccents(user.data[0].neighborhood),
          address: removeAccents(user.data[0].address),
          email: user.data[0].email?.trim().toLowerCase(),
          phoneNumber,
          isForeigner: !!user.data[0].isForeigner,
          birthday: user.data[0].birthday?.split('T')[0], // por si viene con hora
          gender: getGenreNameById(user.data[0].gender), // ya devuelve string correcto
          maritalStatus: getMaritalStatusName(user.data[0].maritalStatus), // ya devuelve string correcto
          isDead: false,
          isHandicaped: !!user.data[0].isHandicaped,
        };
      }

      const { data } = await axios.post<CreateNaturalPersonResponse>(url, body, {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.getToken()}`,
        },
      });

      if (user && user.errorCode === ErrorCode.NONE)
        this.commonAuthService.updateResidentId(user.data[0].id, createClientGimDto.identityCard, data.residentDTO.id);

      if (data.ok && +data.code === 200) {
        return {
          errorCode: ErrorCode.NONE,
          residentDTO: data.residentDTO,
        };
      } else {
        // EN CASO DE QUE YA EXISTA EL CLIENTE EN EL GIM Y NO HAYA SIDO ENCONTRADO ANTES (pUEDE QUE LO REGISTRARON DESPUES DE LA BUSQUEDA)
        if (data.code === '404' && data.residentDTO) {
          return {
            errorCode: ErrorCode.NONE,
            residentDTO: data.residentDTO,
            message: data.message,
          };
        }
      }

      return {
        errorCode: ErrorCode.NOT_FOUND,
        residentDTO: null,
      };

    } catch (error: any) {
      this.logger.error(` ${error}`);
      this.logger.error(`Error createClientGim: ${error.message}`);

      return {
        errorCode: ErrorCode.HTTP_ERROR_REINTENT,
        residentDTO: null,
      };
    }
  }

  async createNewNaturalPersonGimNoExist(createClientGimNotExistDto: CreateClientGimNotExistDto): Promise<{ errorCode: number, data?: any } & Partial<CreateNaturalPersonResponse>> {
    try {
      const url = `${this.gimBaseUrl}/api/external/createNewNaturalPerson`;

      const phoneRaw = String(createClientGimNotExistDto.phoneNumber || '').replace(/\D/g, '');
      const phoneNumber = phoneRaw.startsWith('0')
        ? phoneRaw
        : '0' + phoneRaw;

      const removeAccents = (text: string = '') =>
        text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();

      const body = {
        identificationType: mapIdentificationTypeToGim(createClientGimNotExistDto.identificationType),
        identificationNumber: createClientGimNotExistDto.identificationNumber?.trim(),
        firstName: removeAccents(createClientGimNotExistDto.firstName || 'Usuario'),
        lastName: removeAccents(createClientGimNotExistDto.lastName || createClientGimNotExistDto.firstName || 'Usuario'),
        country: consts.COUNTRY_GIM,
        city: consts.CITY_GIM,
        neighborhood: removeAccents(createClientGimNotExistDto.neighborhood),
        address: removeAccents(createClientGimNotExistDto.address || consts.CITY_GIM),
        email: createClientGimNotExistDto.email?.trim().toLowerCase(),
        phoneNumber,
        isForeigner: !!createClientGimNotExistDto.isForeigner,
        birthday: createClientGimNotExistDto.birthday?.split('T')[0], // por si viene con hora
        gender: getGenreNameById(createClientGimNotExistDto.gender), // ya devuelve string correcto
        maritalStatus: getMaritalStatusName(createClientGimNotExistDto.maritalStatus), // ya devuelve string correcto
        isDead: false,
        isHandicaped: !!createClientGimNotExistDto.isHandicaped,
      };

      const { data } = await axios.post<CreateNaturalPersonResponse>(url, body, {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.getToken()}`,
        },
      });

      if (data.ok && +data.code === 200) {
        return {
          errorCode: ErrorCode.NONE,
          residentDTO: data.residentDTO,
        };
      } else {
        // EN CASO DE QUE YA EXISTA EL CLIENTE EN EL GIM Y NO HAYA SIDO ENCONTRADO ANTES (pUEDE QUE LO REGISTRARON DESPUES DE LA BUSQUEDA)
        if (data.code === '404' && data.residentDTO) {
          return {
            errorCode: ErrorCode.NONE,
            residentDTO: data.residentDTO,
            message: data.message,
          };
        }
      }

      return {
        errorCode: ErrorCode.NOT_FOUND,
        residentDTO: null,
      };

    } catch (error: any) {
      this.logger.error(` ${error}`);
      this.logger.error(`Error createClientGim: ${error.message}`);

      return {
        errorCode: ErrorCode.HTTP_ERROR_REINTENT,
        residentDTO: null,
      };
    }
  }

  async verifateIncidentGim(id: string): Promise<{ errorCode: number } & Partial<FindTaxPayerResponse>> {
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

      return {
        errorCode: ErrorCode.HTTP_ERROR_REINTENT,
        taxpayer: null,
      };
    }
  }

  // emitimos directamente la deuda al GIM
  async emitInfractionGim(createGimDto: CreateGimDto): Promise<{ errorCode: number, data: EmitInfractionSimertResponse | null, message?: string }> {

    try {
      // OBTENER EL TIPO DE INCIDENTE
      const typeIncident = await this.incidentTypeService.getTypeIncidentById(createGimDto.incidentTypeId);

      if (typeIncident.errorCode !== ErrorCode.NONE) {
        return {
          errorCode: ErrorCode.NOT_FOUND,
          message: typeIncident.message,
          data: null
        };
      }

      //   `residentId` | Long | **Sí** | ID del infractor en el sistema GIM. |
      // | `entryCode` | String | **Sí** | Código de la infracción (ej: `"580"`, `"582"`). |
      // | `description`| String | **Sí** | Detalle de la sanción. |
      // | `reference` | String | **Sí** | Número de boleta de citación o referencia legal. |
      // | `infringementDate`| String| **Sí** | Fecha de infracción en formato **YYYY-MM-DD**. |
      // | `numberPlate` | String | No | Placa del vehículo infractor. |
      // | `notificationNumber`| String| No | Número de serie/notificación de la boleta impresa. |
      // | `vehicleType` | Long | No | ID del tipo de vehículo (según catálogo GIM). |
      // | `address` | String | No | Ubicación donde ocurrió la infracción. |
      //console.log('createGimDto.createdAt.split("T")[0]', createGimDto.createdAt.split(' ')[0]);
      const residentId = createGimDto.optionalData.find((item: any) => item.key === 'residentId')?.value;
      const body = {
        residentId: Number(residentId), // Default or map
        entryCode: typeIncident.incidentType.code,
        description: createGimDto.description,
        reference: createGimDto.reference, // Placeholder as per user example, ideally map from address/coords
        infringementDate: new Date(createGimDto.createdAt).toISOString().split('T')[0],
        numberPlate: createGimDto.plate,
        notificationNumber: createGimDto.nroTicket,
        vehicleType: createGimDto.vehicleType ? Number(createGimDto.vehicleType) : TypeSizeVehicle.VEHICLE,
        address: createGimDto.address, // Placeholder
      };

      // TODO: Use the correct URL from config
      // const url = `${this.gimBaseUrl}/api/external/emitInfractionGim`;
      const url = `${this.gimBaseUrl}/api/external/emitSimertSanction`;

      const { data } = await axios.post<EmitInfractionSimertResponse>(
        url,
        body,
        {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.getToken()}`,
          },
        }
      );

      if (data && data.ok && +data.code === ResponseCodeGim.SUCCESS) {
        return { errorCode: ErrorCode.NONE, data };
      }

      if (!data.ok && data.code === '400') {
        return {
          errorCode: ErrorCode.NOT_FOUND,
          message: 'Fuera del horario, jornada no aperturada, comuniquese con el administrador',
          data
        };
      }

      return { errorCode: ErrorCode.NOT_FOUND, message: data.message, data };

    } catch (error) {
      const responseData = error?.response?.data;

      if (responseData) {
        if (!responseData.ok && responseData.code === '400') {
          this.logger.warn(`emitInfractionGim catch jornada cerrada: ${responseData.message}`);
          return {
            errorCode: ErrorCode.NOT_FOUND,
            message: 'Fuera del horario, jornada no aperturada en el municipio, comuniquese con el administrador',
            data: responseData
          };
        }

        if (!responseData.ok) {
          return {
            errorCode: ErrorCode.HTTP_ERROR_REINTENT,
            message: responseData.message,
            data: responseData
          };
        }
      }

      return {
        errorCode: ErrorCode.HTTP_ERROR_REINTENT,
        message: 'Error interno del municipio al generar la deuda, por favor intente más tarde',
        data: null
      };
    }
  }

  // Buscar Obligación por Número de boleta
  async findBondByNumber(findBondNumberDto: FindBondNumberDto): Promise<{ errorCode: number, data: any, message?: string }> {
    try {
      const url = `${this.gimBaseUrl}/api/external/findBondByNumber`;
      const body = {
        bondNumber: findBondNumberDto.nroTicket,
        identificationNumber: findBondNumberDto.identityCard
      };
      const { data } = await axios.post(url, body);
      if (data && data.ok && +data.code === ResponseCodeGim.SUCCESS && data.bond) {
        return {
          errorCode: ErrorCode.NONE,
          data: data.data
        };
      } else {
        return {
          errorCode: ErrorCode.NOT_FOUND,
          message: 'No se encontro la deuda',
          data: null
        };
      }
    } catch (error) {
      this.logger.error(`Error findBondByNumber: ${error.message}`);
      return {
        errorCode: ErrorCode.NOT_FOUND,
        message: error.message,
        data: null
      };
    }
  }

  // Buscar Obligación por Número de boleta y cedula (este recurso devuelve todas las deudas de la persona, es decir de todos los estados)
  async findObligationsByCitation(number: string, identityCard: string): Promise<{ errorCode: number, data: ObligationsResponse, message?: string }> {
    try {
      const url = `${this.gimBaseUrl}/api/external/findObligationsByCitation`;
      const body = {
        citationNumber: number, // Número de boleta
        identificationNumber: identityCard // Cédula
      };
      const { data } = await axios.post<ObligationsResponse>(url, body, {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.getToken()}`,
        },
      });
      // si me viene sin obligacioens significa que no esta emitida 
      if (data && data.ok && +data.code === ResponseCodeGim.SUCCESS && data.obligations && data.obligations.length > 0) {

        if (data.obligations.length > 1)
          this.logger.debug('El número de obligaciones por citación es de: ', data.obligations.length);

        return {
          errorCode: ErrorCode.NONE,
          data: data
        };
      } else {
        return {
          errorCode: ErrorCode.NOT_FOUND,
          message: 'No se encontro la deuda',
          data: null
        };
      }
    } catch (error) {
      this.logger.error(`Error findObligationsByCitation: ${error.message}`);
      return {
        errorCode: ErrorCode.NOT_FOUND,
        message: error.message,
        data: null
      };
    }
  }

  public async validateStatusSistemWithGim(debtDataObligations: Obligation[], incidentId: number, createGimDto: CreateGimDto, isTransacional: number) {
    try {

      const validateStatus = await this._validateStatusSistemWithGim(debtDataObligations);
      if (validateStatus.errorCode === ErrorCode.NONE) {
        createGimDto.statusIncident = validateStatus.statusIncident;
        const updateDto = this._buildAntDataResponse(debtDataObligations[0], validateStatus.statusIncident);
        await this.incidentService.update(incidentId, updateDto, isTransacional);
      }
      return validateStatus;

    } catch (error) {
      this.logger.error(`Error validateStatusSistemWithGim: ${error.message}`);
      return {
        errorCode: ErrorCode.NOT_FOUND,
        message: error.message,
        data: null
      };
    }
  }

  // VALIDAMOS CADA ESTADO DEL GIM CON LO QUE TENEMOS EN NUESTRO SISTEMA
  public async _validateStatusSistemWithGim(debtDataObligations: Obligation[]): Promise<{ errorCode: number, data: any, statusIncident: IncidentStatus | null, message?: string }> {
    try {
      const obligation = debtDataObligations[0];
      const { status } = obligation;
      // LAS AGRUPACIONES DE ESTADOS ESTAN EN COMENTRIOS EN EL ENUM IncidentStatus

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
            message: 'Error al validar el estado de la deuda en el GIM',
            data: debtDataObligations,
            statusIncident: null
          };
      }
      return { errorCode: ErrorCode.NONE, message, statusIncident, data: debtDataObligations };

    } catch (error) {
      this.logger.error(`Error validateStatusSistemWithGim: ${error.message}`);
      return {
        errorCode: ErrorCode.NOT_FOUND,
        message: error?.message,
        data: null,
        statusIncident: null
      };
    }
  }

  // Validar Open Till
  async validateOpenTill(): Promise<{ errorCode: number; data: any; message?: string }> {
    try {
      const url = `${this.gimBaseUrl}/api/external/validateOpenTill`;

      const { data } = await axios.post(
        url,
        {},
        {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.getToken()}`,
          },
          //timeout: 10000,
        },
      );

      if (data && data?.ok && Number(data?.code) === 200 && !data?.isOpen) {
        return {
          errorCode: ErrorCode.NOT_FOUND,
          message: 'Fuera del horario laboral, por favor intente más tarde',
          data: data.data
        };
      }

      if (data && data?.ok && Number(data?.code) === 200 && data?.isOpen) {
        return {
          errorCode: ErrorCode.NONE,
          message: 'Dentro del horario laboral',
          data: data.data
        };
      }

      return {
        errorCode: ErrorCode.NOT_FOUND,
        message: 'No se logró verificar el horario laboral, por favor intente más tarde',
        data: null,
      };
    } catch (error: any) {

      this.logger.error('Errro validateOpenTill ', error?.response?.status, error?.code, error?.message)
      const status = error?.response?.status;
      const isTimeout = error?.code === 'ECONNABORTED' || error?.code === 'ETIMEDOUT';

      if (isTimeout) {
        this.logger.error(`Error validateOpenTill: timeout al conectar con el municipio`);
        return {
          errorCode: ErrorCode.HTTP_ERROR_REINTENT,
          message: 'No hay comunicación con el municipio, por favor intente más tarde',
          data: null,
        };
      }

      if (status === 401) {
        this.logger.error(`Error validateOpenTill: no autorizado (401)`);
        return {
          errorCode: ErrorCode.HTTP_ERROR_REINTENT,
          message: 'No se pudo verificar al usuario, por favor intente más tarde',
          data: null,
        };
      }

      if (status === 500) {
        this.logger.error(`Error validateOpenTill: error interno del municipio (500)`);
        return {
          errorCode: ErrorCode.HTTP_ERROR_REINTENT,
          message: 'Ocurrió un error al verificar el horario laboral del municipio, por favor intente más tarde',
          data: null,
        };
      }

      this.logger.error(`Error validateOpenTill: ${error?.message}`);
      return {
        errorCode: ErrorCode.HTTP_ERROR_REINTENT,
        message: 'Ocurrió un error al verificar el horario laboral del municipio, por favor intente más tarde',
        data: null,
      };
    }
  }

  // Login de gim para sacar el keycloak 
  async loginGim(): Promise<{ errorCode: number; data: KeycloakTokenResponse | null; message?: string }> {
    try {
      const url = `${this.gimBaseUrlLogin}/realms/${this.gim2RealmMunicipio}/protocol/openid-connect/token`;

      // x-www-form-urlencoded (igual que Postman)
      const form = new URLSearchParams();
      form.append('grant_type', 'password');
      form.append('client_id', 'gim');
      form.append('username', process.env.GIM_USERNAME ?? 'simert_dev');
      form.append('password', process.env.GIM_PASSWORD ?? '');
      form.append('client_secret', process.env.GIM_CLIENT_SECRET ?? '');

      const { data } = await axios.post<KeycloakTokenResponse>(url, form.toString(), {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Accept: '*/*',
        },
      });

      // Keycloak responde directo (NO viene con "ok", "data", etc.)
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
      return { errorCode: ErrorCode.NOT_FOUND, message: msg, data: null };
    }
  }

  // OBTENER LOS TIPOS DE VEHICULOS DESDE EL GIM
  async findVehicleTypesForSimert(): Promise<{ errorCode: number, data: any, message?: string }> {
    try {
      const url = `${this.gimBaseUrl}/api/external/findVehicleTypesForSimert`;
      const body = {}; // Body vacio segun requerimiento

      const { data } = await axios.post<VehicleTypesGimResponse>(url, body, {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.getToken()}`,
        },
      });

      // RESPONSE EJEMPLO
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
          data: sorted // Asumo que devuelve vehicleTypes, ajustare si es necesario
        };
      } else {
        return {
          errorCode: ErrorCode.NOT_FOUND,
          message: 'No se encontraron tipos de vehículos',
          data: null
        };
      }
    } catch (error) {
      this.logger.error(`Error findVehicleTypesForSimert: ${error.message}`);
      return {
        errorCode: ErrorCode.NOT_FOUND,
        message: error.message,
        data: null
      };
    }
  }

  // OBTENER LOS TIPOS DE VEHICULOS DESDE EL GIM
  async emissionTitleCreditCard(emissionCreditCardDto: EmissionCreditCardDto): Promise<{ errorCode: number, data: any, message?: string }> {
    try {
      const url = `${this.gimBaseUrl}/api/external/emitSimertCard`;
      const body = {
        residentId: emissionCreditCardDto.residentId,
        description: emissionCreditCardDto.description,
        reference: emissionCreditCardDto.reference,
        entryCode: emissionCreditCardDto.entryCode,
        quantity: emissionCreditCardDto.quantity,
      };

      const { data } = await axios.post<EmisionTitleCreditCardResponse>(url, body, {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.getToken()}`,
        },
      });

      if (data && data.ok && +data.code === 200) {
        return {
          errorCode: ErrorCode.NONE,
          data: data
        };
      } else {
        return {
          errorCode: ErrorCode.NOT_FOUND,
          message: 'No se logró realizar la emisión de la tarjeta',
          data: null
        };
      }
    } catch (error) {
      this.logger.error(`Error emisionTitleCreditCard: ${error.response?.data}`);
      return {
        errorCode: ErrorCode.NOT_FOUND,
        message: error.response?.data?.message || 'error de catch de emitSimertCard',
        data: error.response?.data || null
      };
    }
  }

  // DEPÓSITO EN EL GIM
  async registerDeposit(registerDepositGimDto: RegisterDepositGimDto): Promise<{ errorCode: number, data: any, message?: string }> {
    try {
      const url = `${this.gimBaseUrl}/api/external/registerDeposit`;
      const body = { ...registerDepositGimDto, amount: Number(registerDepositGimDto.amount) }

      const { data } = await axios.post<DepositResponse>(url, body, {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.getToken()}`,
        },
      });

      if (data && data.ok && data.reference && data.total) {
        return {
          errorCode: ErrorCode.NONE,
          data: data
        };
      } else {
        return {
          errorCode: ErrorCode.NOT_FOUND,
          message: 'No se logró realizar el depósito',
          data: data || null
        };
      }
    } catch (error) {
      this.logger.error(`Error registerDeposit: ${error}`);
      this.logger.error(`Error registerDeposit: ${error.response?.data}`);
      return {
        errorCode: ErrorCode.NOT_FOUND,
        message: error.response?.data?.message || 'error de catch de registerDeposit',
        data: error.response?.data || null
      };
    }
  }

  // Buscar obligaciones cliente
  async findObligations(getClientGimDto: GetClientGimDto): Promise<{ errorCode: number, data: any, message?: string }> {
    try {
      const url = `${this.gimBaseUrl}/api/external/findStatement`;
      const body = { identificationNumber: getClientGimDto.identificationNumber };

      const { data } = await axios.post<ObligationsClientResponse>(url, body, {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.getToken()}`,
        },
      });

      if (data && data.ok && data.bonds?.length > 0) {
        return {
          errorCode: ErrorCode.NONE,
          data: data
        };
      } else {
        return {
          errorCode: ErrorCode.NOT_FOUND,
          message: 'No se lograron obtener las obligaciones',
          data: null
        };
      }
    } catch (error) {
      this.logger.error(`Error findObligations: ${error.response?.data}`);
      return {
        errorCode: ErrorCode.NOT_FOUND,
        message: error.response?.data?.message || 'error de catch de findObligations',
        data: error.response?.data || null
      };
    }
  }

  // Emitir sanción gim
  async emitSanction(emissionSanctionDto: EmissionSanctionDto): Promise<{ errorCode: number, data: any, message?: string }> {
    try {
      const url = `${this.gimBaseUrl}/api/external/emitSanction`;
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

      const { data } = await axios.post<EmitInfractionSimertResponse>(url, body, {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.getToken()}`,
        },
      });

      if (data && data.ok && data.code === '200') {
        return {
          errorCode: ErrorCode.NONE,
          data: data
        };
      } else {
        return {
          errorCode: ErrorCode.NOT_FOUND,
          message: 'No se logró realizar la emisión de la sanción',
          data: null
        };
      }
    } catch (error) {
      this.logger.error(`Error emitSanction: ${error.response?.data}`);
      return {
        errorCode: ErrorCode.NOT_FOUND,
        message: error.response?.data?.message || 'error de catch de emitSanction',
        data: error.response?.data || null
      };
    }
  }

  async emitInfractionSimert(createGimDto: CreateGimDto, id: number, isTransacional: number) {

    try {

      // MANDAMOS A  EMITIR LA DEUDA EN EL GIM
      const responeEmit = await this.emitInfractionGim(createGimDto);

      if (responeEmit.errorCode !== ErrorCode.NONE) {
        return {
          errorCode: ErrorCode.NOT_FOUND,
          message: responeEmit.data?.message,
          data: responeEmit.data
        };
      }

      const obligation = {
        obligationId: +responeEmit.data.bondId,
        obligationNumber: responeEmit.data.bondNumber.toString()
      } as Obligation
      const updateDto = this._buildAntDataResponse(obligation, IncidentStatus.SUPPLIED);
      await this.incidentService.update(id, updateDto, isTransacional);

      return {
        errorCode: ErrorCode.NONE,
        message: 'Deuda emitida correctamente',
        data: updateDto
      };

    } catch (error) {

      this.logger.error(`Error emitInfractionSimert: ${error.message}`);
      return {
        errorCode: ErrorCode.NOT_FOUND,
        message: 'Error al generar la deuda en el GIM notificar al administrador',
        data: null
      };

    }

  }

}
