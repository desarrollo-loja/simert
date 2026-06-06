import { StatusObligation } from 'src/common/glob/responses-gim';

// BUSCAR CONTRIBUYENTE o PERSONA NATURAL
export interface TaxPayer {
  id: number;
  identificationNumber: string;
  firstName: string;
  lastName: string;
  name: string;
  email: string;
  street: string;
  phoneNumber: string;
  birthDate: string; // formato YYYY-MM-DD
}

export interface FindTaxPayerResponse {
  ok: boolean;
  message: string;
  code: string;
  validationErrors: any[] | null;
  taxpayer: TaxPayer | null;
}

// CREAR PERSONA NATURAL
export interface CreateNaturalPersonResponse {
  ok: boolean;
  message: string;
  code: string;
  validationErrors: any[] | null;
  residentDTO: ResidentDTO | null;
}

// RESIDENTE
export interface ResidentDTO {
  id: number;
  name: string;
  identificationNumber: string;
  email: string;
  identificationType: IdentificationType;
  registerDate: Date | string;
  isEnabledForDeferredPayments: boolean;
  enabledIndividualPayment: boolean;
  enableSubscription: boolean;
  generateUniqueAccount: boolean;
  currentAddressAsString: string;
}

// TIPO DE IDENTIFICACION
export enum IdentificationType {
  DNI = 1,
  PASSPORT = 2,
  RUC = 3,
}

// Resource: Look up obligations by citation => findObligationsByCitation
export interface ObligationsResponse {
  ok: boolean;
  message: string;
  code: string;
  validationErrors: any[] | null;
  obligations: Obligation[] | null;
}

export interface Obligation {
  taxpayer: string;
  taxpayerId: number;
  taxpayerNumber: string;
  obligationId: number;
  obligationNumber: string;
  citation: string;
  status: StatusObligation; // enum "PAGADA", "PENDIENTE" + 17 estados mas
  description: string;
  total: number;
  emisionDate: string; // YYYY-MM-DD
  liquidationDate: string; // YYYY-MM-DD
  liquidationTime: string; // HH:mm:ss.SSS
  infringementDate: string; // YYYY-MM-DD
}

// RECURSO DE EMITIR LA INCIDENCIA AL GIM => emitInfractionSimert
export interface EmitInfractionSimertResponse {
  ok: boolean;
  message: string;
  code: string;
  validationErrors: unknown[];
  bondId?: number;
  bondNumber?: number; // = nroObligation o el numero de la obligacion
}

// LOGIN DEL GIM
// (Opcional) Tipado del response de Keycloak
// export interface KeycloakTokenResponse extends KeycloakTokenResponse {
//   access_token: string;
//   expires_in: number;
//   refresh_expires_in: number;
//   refresh_token: string;
//   token_type: string;
//   'not-before-policy': number;
//   session_state: string;
//   scope: string;
// }

// tipos de vehiculos del GIM
export interface VehicleTypesGimResponse {
  ok: boolean;
  message: string;
  code: string;
  types: VehicleTypeGim[];
}

export interface VehicleTypeGim {
  id: number;
  name: string;
}

export interface EmisionTitleCreditCardResponse {
  ok: boolean;
  message: string;
  code: string;
  bondId?: number;
  bondNumber?: number; // = nroObligation o el numero de la obligacion
}

export interface DepositResponse {
  ok: boolean;
  message: string;
  code: string;
  reference: string;
  residentName: string;
  residentIdentificaciton: string;
  total: number;
}

export interface ObligationsClientResponse {
  ok: boolean;
  message: string;
  code: string;
  taxpayer: TaxPayer | null;
  bonds: Bond[];
}

export interface Bond {
  id: number;
  number: number;
  account: string;
  serviceCode: string;
  serviceDate: string;
  expirationDate: string;
  total: number;
  interests: number;
  surcharges: number;
  taxes: number;
  discounts: number;
  description: string;
  bondsDetail: BondDetail[];
}

export interface BondDetail {
  bondId: number;
  subLineAccount: string;
  name: string;
  partialValue: number;
}
