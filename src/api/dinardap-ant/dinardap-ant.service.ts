import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosRequestConfig } from 'axios';
import { CommonGimService } from 'src/common/common.gim.service';
import { ErrorCode } from 'src/common/glob/error';
import { AntResponse } from 'src/common/intefaces/ant_response.interface';
import { LoggerService } from 'src/common/logger.service.ts';

type AntLookupResult =
    | { errorCode: ErrorCode.NONE; data: AntResponse; message: string }
    | {
          errorCode: Exclude<ErrorCode, ErrorCode.NONE>;
          data: null;
          message?: string;
      };

/**
 * Service that queries the DINARDAP–ANT gateway to resolve vehicle owner
 * data by plate. Obtains a GIM Keycloak token via {@link CommonGimService}
 * and validates plate format before dispatching the HTTP request.
 */
@Injectable()
export class DinardapAntService {
    private readonly logger = new Logger('AntService');
    private readonly dinardapAntBaseUrl: string;
    private token: string;
    // Single in-flight GIM 2 re-login shared by every request that got a 401 at
    // the same time, so a burst of expired-token calls triggers one login
    // instead of one per request.
    private tokenRefresh: Promise<string | null> | null = null;

    /**
     * @param configService Provides access to environment configuration values.
     * @param commonGimService Supplies the GIM Keycloak token used to authenticate requests.
     * @param loggerService Audit logger used to record ANT integration failures.
     */
    constructor(
        private readonly configService: ConfigService,
        private readonly commonGimService: CommonGimService,
        private readonly loggerService: LoggerService,
    ) {
        this.dinardapAntBaseUrl = this.configService.get<string>(
            'DINARDAP_ANT_BASE_URL',
        );
    }

    /**
     * Forces a GIM 2 re-login and returns the resulting token. Concurrent
     * callers share the same in-flight login, so a burst of expired-token
     * lookups does not hammer Keycloak with one login each.
     *
     * @returns The freshly issued token, or `null` when the re-login failed.
     */
    private async _refreshToken(): Promise<string | null> {
        if (!this.tokenRefresh) {
            this.tokenRefresh = this.commonGimService
                .refreshToken()
                .then(() => this.commonGimService.getTokenGim2() ?? null)
                // `refreshToken` already logs its own failure and resolves, but
                // a transport error must not leave the shared promise rejected
                // for every waiter.
                .catch(() => null)
                .finally(() => {
                    this.tokenRefresh = null;
                });
        }

        return this.tokenRefresh;
    }

    /**
     * Runs the ANT lookup and, when the gateway answers 401 because the GIM 2
     * token expired, re-logs in and replays the very same request once with the
     * new token.
     *
     * The retry is skipped when the re-login could not issue a *different*
     * token: that means the credentials — not the expiry — are the problem, and
     * replaying would only produce a second 401.
     *
     * @typeParam T Result type of the wrapped call.
     * @param token Token used by the first attempt.
     * @param run Performs the request with the token it receives; invoked at most twice.
     * @returns The result of the call, from the first attempt or the replay.
     */
    private async _retryOn401<T>(
        token: string,
        run: (token: string) => Promise<T>,
    ): Promise<T> {
        try {
            return await run(token);
        } catch (error: any) {
            if (error?.response?.status !== 401) throw error;

            const freshToken = await this._refreshToken();
            if (!freshToken || freshToken === token) throw error;

            this.logger.warn(
                'Token GIM 2 caducado (401) en getUserDataByPlateAnt: token renovado, reintentando la petición',
            );

            return run(freshToken);
        }
    }

    /**
     * Resolves vehicle owner data for a given plate by validating its format and
     * querying the DINARDAP–ANT gateway.
     * @param plate Vehicle plate to look up.
     * @returns Promise resolving to the lookup result with owner data or an error code.
     */
    async getUserDataByPlateAnt(plate: string): Promise<AntLookupResult> {
        const normalizedPlate = (plate ?? '').trim().toUpperCase();
        if (!this._isValidPlate(normalizedPlate)) {
            this.logger.warn(`Invalid plate received: "${plate}"`);
            return {
                errorCode: ErrorCode.NOT_VALID,
                data: null,
                message:
                    'La placa ingresada no es válida, verifica el formato e inténtalo nuevamente',
            };
        }

        const { data, errorCode, message } =
            await this._getAntDataByPlate(normalizedPlate);

        if (errorCode !== ErrorCode.NONE || !data) {
            return {
                errorCode:
                    errorCode === ErrorCode.NONE
                        ? ErrorCode.NOT_FOUND
                        : errorCode,
                data: null,
                message: message || 'No se encontró información del vehículo',
            };
        }

        return {
            errorCode: ErrorCode.NONE,
            data,
            message: 'Información del vehículo obtenida correctamente',
        };
    }

    /**
     * Checks whether a plate matches the expected alphanumeric format (5 to 8 characters).
     * @param plate Normalized plate string to validate.
     * @returns `true` when the plate format is valid, otherwise `false`.
     */
    private _isValidPlate(plate: string): boolean {
        return /^[A-Z0-9]{5,8}$/.test(plate);
    }

    /**
     * Translates an axios error raised while consuming the DINARDAP/ANT resource
     * into a client-readable message. When the error carries a known HTTP status it
     * returns a specific message (401, 403, 404, 5xx…); otherwise it falls back to
     * the generic service-offline message.
     * @param error Axios error captured during the request.
     * @returns Object containing the mapped error code and message.
     */
    private _buildAntErrorMessage(error: any): {
        errorCode: ErrorCode;
        message: string;
    } {
        const fallback = {
            errorCode: ErrorCode.SYSTEM_INACTIVE,
            message:
                'El sistema de la ANT se encuentra fuera de servicio, por favor inténtalo más tarde',
        };

        const status: number | undefined = error?.response?.status;
        const code: string | undefined = error?.code;

        if (status === 400) {
            return {
                errorCode: ErrorCode.UNKNOWN,
                message: '400 Solicitud incorrecta hacia el servicio de la ANT',
            };
        }
        if (status === 401) {
            return {
                errorCode: ErrorCode.UNAUTHORIZED,
                message: '401 No autorizado para consumir el recurso de la ANT',
            };
        }
        if (status === 403) {
            return {
                errorCode: ErrorCode.UNAUTHORIZED,
                message: '403 Acceso prohibido al recurso de la ANT',
            };
        }
        if (status === 404) {
            return {
                errorCode: ErrorCode.NOT_FOUND,
                message: '404 Recurso no encontrado en la ANT',
            };
        }
        if (status === 408 || code === 'ECONNABORTED' || code === 'ETIMEDOUT') {
            return {
                errorCode: ErrorCode.HTTP_ERROR_REINTENT,
                message:
                    'No se pudo establecer comunicación con la ANT, inténtalo más tarde',
            };
        }
        if (status === 429) {
            return {
                errorCode: ErrorCode.UNKNOWN,
                message:
                    '429 Demasiadas solicitudes a la ANT, inténtalo más tarde',
            };
        }
        if (status && status >= 500) {
            return fallback;
        }

        return fallback;
    }

    /**
     * Converts the column array [{campo, valor}] into a flat object { campo: valor }
     * to simplify data access, e.g. cols['apellido1'], cols['correo'], etc.
     * @param columnasArray Array of column entries with `campo` and `valor` fields.
     * @returns Flat record mapping each column name to its value.
     */
    private _parseCols(
        columnasArray: { campo: string; valor: string }[],
    ): Record<string, string> {
        const result: Record<string, string> = {};
        for (const col of columnasArray ?? []) {
            result[col.campo] = col.valor ?? '';
        }
        return result;
    }

    /**
     * Performs the authenticated HTTP request to the DINARDAP–ANT gateway and maps
     * the response into a normalized owner/vehicle/registration data object.
     * @param plate Normalized vehicle plate to query.
     * @returns Promise resolving to the parsed data, an error code, and a message.
     */
    private async _getAntDataByPlate(plate: string): Promise<{
        data: AntResponse | null;
        errorCode: ErrorCode;
        message: string;
    }> {
        if (!this.dinardapAntBaseUrl) {
            this.logger.error('DINARDAP_ANT_BASE_URL not configured');
            this.loggerService.saveLogsAntLogger({
                resource: 'DINARDAP_ANT',
                service: 'DinardapAntService',
                method: 'getUserDataByPlateAnt',
                endpoint: 'GET /api/dinardap/vehicles/{plate}/registration',
                params: { plate },
                errorCode: ErrorCode.SYSTEM_INACTIVE,
                message: 'DINARDAP_ANT_BASE_URL not configured',
            });

            return {
                data: null,
                errorCode: ErrorCode.SYSTEM_INACTIVE,
                message:
                    'Enlace del sistema de la ANT no configurado, por favor comuníquese con soporte técnico',
            };
        }

        this.token = this.commonGimService.getTokenGim2();
        const accessToken = this.token;

        if (!accessToken) {
            this.logger.error('GIM2 token not available for DINARDAP ANT');
            this.loggerService.saveLogsAntLogger({
                resource: 'DINARDAP_ANT',
                service: 'DinardapAntService',
                method: 'getUserDataByPlateAnt',
                endpoint: 'GET /api/dinardap/vehicles/{plate}/registration',
                params: { plate },
                errorCode: ErrorCode.UNAUTHORIZED,
                message: 'GIM2 token not available for DINARDAP ANT',
            });

            return {
                data: null,
                errorCode: ErrorCode.UNAUTHORIZED,
                message: 'No autorizado para consumir el recurso de la ANT',
            };
        }

        // URL-encode plate to prevent path traversal / URL injection if a caller
        // supplies non-alphanumeric input. Legitimate plates are alphanumeric so
        // encoding is a no-op for them.
        const url = `${this.dinardapAntBaseUrl}/api/dinardap/vehicles/${encodeURIComponent(plate)}/registration`;

        const buildConfig = (token: string): AxiosRequestConfig => ({
            method: 'GET',
            url,
            timeout: 20000,
            headers: {
                Authorization: `Bearer ${token}`,
                Accept: 'application/json',
            },
        });

        try {
            const { data } = await this._retryOn401(accessToken, (tk) =>
                axios.request<any>(buildConfig(tk)),
            );

            // Structure: paquete.entidades.entidad[0].filas.fila[0].columnas.columna[]
            const entidadRaw =
                data?.paquete?.entidades?.entidad?.[0] ??
                data?.paquete?.entidades?.entidad ??
                null;

            if (!entidadRaw) {
                this.logger.warn(`No entity found for plate ${plate}`);
                return {
                    data: null,
                    errorCode: ErrorCode.NOT_FOUND,
                    message:
                        'No se encontró información del vehículo en el sistema de la ANT',
                };
            }

            // Extract the first row and flatten columns into a plain object { campo: valor }
            const filaRaw =
                entidadRaw?.filas?.fila?.[0] ?? entidadRaw?.filas?.fila ?? null;
            const cols: Record<string, string> = filaRaw?.columnas?.columna
                ? this._parseCols(filaRaw.columnas.columna)
                : {};

            // ── Person ──────────────────────────────────────────────────────────────
            const firstName = String(cols['nombres'] || '').trim();
            const apellido1 = String(cols['apellido1'] || '').trim();
            const apellido2 = String(cols['apellido2'] || '').trim();
            const lastName = [apellido1, apellido2]
                .filter(Boolean)
                .join(' ')
                .trim();
            const fullName = String(
                cols['propietario'] || `${lastName} ${firstName}`,
            ).trim();
            const identityCard = String(cols['docPropietario'] || '').trim();
            const email = String(cols['correo'] || '').trim();
            // Phone may arrive with a leading ";" (e.g. ";0939700013") — strip it
            const phone = String(cols['telefono'] || '')
                .replace(/^;+/, '')
                .trim();
            const address = String(cols['direccion'] || '').trim();

            // ── Vehicle ───────────────────────────────────────────────────────────────
            const brand = String(cols['marca'] || '').trim();
            const model = String(cols['modelo'] || '').trim();
            const year = String(cols['anio'] || '').trim();
            const color = String(cols['color'] || '').trim();
            const chassis = String(cols['chasis'] || '').trim();
            const motor = String(cols['motor'] || '').trim();
            const vehicleType = String(cols['tipoVehiculo'] || '').trim();
            const serviceType = String(cols['tipoServicio'] || '').trim();
            const fuelType = String(cols['combustible'] || '').trim();
            const passengers = String(cols['pasajeros'] || '').trim();

            // ── Registration ──────────────────────────────────────────────────────────
            const matriculaYear = String(cols['anioMatriculado'] || '').trim();
            const matriculaDate = String(cols['fechaMatricula'] || '').trim();
            const expirationDate = String(cols['fechaCaducidad'] || '').trim();

            if (!fullName && !identityCard && !email) {
                this.logger.warn(
                    `The response contained no useful data for plate ${plate}`,
                );
                return {
                    data: null,
                    errorCode: ErrorCode.NOT_FOUND,
                    message:
                        'La respuesta del sistema ANT no contiene datos útiles para esta placa',
                };
            }

            return {
                data: {
                    fullName,
                    firstName,
                    lastName,
                    identityCard,
                    email,
                    phone,
                    address,
                    brand,
                    model,
                    year,
                    color,
                    chassis,
                    motor,
                    vehicleType,
                    serviceType,
                    fuelType,
                    passengers,
                    matriculaYear,
                    matriculaDate,
                    expirationDate,
                },
                errorCode: ErrorCode.NONE,
                message: '',
            };
        } catch (error: any) {
            this.logger.error(
                `DINARDAP ANT lookup failed plate=${plate}: ${error?.response?.data ? JSON.stringify(error.response.data) : (error?.message ?? error)}`,
            );
            const mapped = this._buildAntErrorMessage(error);
            this.loggerService.saveLogsAntLogger({
                resource: 'DINARDAP_ANT',
                service: 'DinardapAntService',
                method: 'getUserDataByPlateAnt',
                endpoint: url,
                params: { plate },
                httpStatus: error?.response?.status,
                errorCode: mapped.errorCode,
                message: mapped.message,
                response: error?.response?.data,
                exception: error?.name
                    ? `${error.name}: ${error.message}`
                    : String(error),
            });

            return {
                data: null,
                errorCode: mapped.errorCode,
                message: mapped.message,
            };
        }
    }
}
