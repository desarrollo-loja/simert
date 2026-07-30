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

/**
 * SIMERT concepts accepted by the GIM `simert/paid-obligations` resource.
 * Values are the literal strings the municipality expects in the `concept`
 * query param (memorando ML-DT-2026-0819-M).
 */
export enum ConceptPaidObligation {
    /** Credit titles issued for a SIMERT fine. */
    FINE = 'MULTA',
    /** Credit titles issued for a SIMERT card purchase. */
    CARD = 'TARJETA',
}

// Resource: paid credit titles for SIMERT concepts => simert/paid-obligations
// The municipality delivered this resource without its response contract (only
// the memorando ML-DT-2026-0819-M), so every field is optional and both the
// usual GIM envelope (`ok`/`code`/`obligations`) and a Spring `Page` wrapper
// (`content`/`totalElements`) are accepted. `GimService.findPaidObligations`
// normalizes whichever one arrives into `PaidObligationsPage`.
export interface PaidObligationsGimResponse {
    ok?: boolean;
    message?: string;
    code?: string | number;
    validationErrors?: unknown[] | null;
    /** GIM envelope payload key. */
    obligations?: PaidObligationGim[] | null;
    /** Spring `Page` payload key. */
    content?: PaidObligationGim[] | null;
    /** Alternative payload keys seen across GIM resources. */
    items?: PaidObligationGim[] | null;
    data?: PaidObligationGim[] | null;
    /** Spring `Page` totals. */
    totalElements?: number;
    totalPages?: number;
    number?: number;
    size?: number;
    /** Totals under alternative names. */
    total?: number;
    page?: number;
    last?: boolean;
}

/**
 * A paid credit title (obligation in status `PAGADA`) as returned by the GIM
 * `simert/paid-obligations` resource. Field names mirror {@link Obligation},
 * the contract GIM already uses for obligations, but all are optional because
 * the technical annex has not been delivered yet.
 */
export interface PaidObligationGim {
    taxpayer?: string;
    taxpayerId?: number;
    taxpayerNumber?: string;
    obligationId?: number;
    obligationNumber?: string | number;
    citation?: string;
    status?: string;
    concept?: string;
    description?: string;
    total?: number | string;
    /** Amount under alternative names used by GIM payment resources. */
    amount?: number | string;
    value?: number | string;
    emisionDate?: string; // YYYY-MM-DD
    liquidationDate?: string; // YYYY-MM-DD
    liquidationTime?: string; // HH:mm:ss.SSS
    infringementDate?: string; // YYYY-MM-DD
    /** Payment date under the names seen across GIM resources. */
    paymentDate?: string;
    payDate?: string;
    accountingAccountCode?: string;
    [key: string]: unknown;
}

/**
 * Normalized page of paid credit titles handed to the clients, independent of
 * the envelope GIM answered with.
 */
export interface PaidObligationsPage {
    /** Credit titles of the requested page. */
    items: PaidObligationGim[];
    /** Total credit titles matching the filter, ignoring pagination. */
    total: number;
    /** Applied 0-based page number (GIM pages from 0). */
    page: number;
    /** Applied page size. */
    size: number;
    /** Total number of pages for the current filter and page size. */
    totalPages: number;
    /** Sum of the `total` of every credit title in `items`. */
    totalAmount: number;
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
