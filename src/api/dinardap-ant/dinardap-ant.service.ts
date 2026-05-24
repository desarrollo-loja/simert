import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosRequestConfig } from 'axios';
import { CommonGimService } from 'src/common/common.gim.service';
import { ErrorCode } from 'src/common/glob/error';
import { AntResponse } from 'src/common/intefaces/ant_response.interface';

type AntLookupResult =
  | { errorCode: ErrorCode.NONE; data: AntResponse }
  | { errorCode: Exclude<ErrorCode, ErrorCode.NONE>; data: null; message?: string };

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

  constructor(
    private readonly configService: ConfigService,
    private readonly commonGimService: CommonGimService,
  ) {
    this.dinardapAntBaseUrl = this.configService.get<string>('DINARDAP_ANT_BASE_URL');
  }

  async getUserDataByPlateAnt(plate: string): Promise<AntLookupResult> {
    const normalizedPlate = (plate ?? '').trim().toUpperCase();
    if (!this._isValidPlate(normalizedPlate)) {
      this.logger.warn(`Placa inválida recibida: "${plate}"`);
      return {
        errorCode: ErrorCode.NOT_VALID,
        data: null,
        message: 'La placa ingresada no es válida, verifica el formato e inténtalo nuevamente',
      };
    }

    const { data, errorCode, message } = await this._getAntDataByPlate(normalizedPlate);

    if (errorCode !== ErrorCode.NONE || !data) {
      return {
        errorCode: errorCode === ErrorCode.NONE ? ErrorCode.NOT_FOUND : errorCode,
        data: null,
        message: message || 'No se encontró información del vehículo',
      };
    }

    return { errorCode: ErrorCode.NONE, data };
  }

  private _isValidPlate(plate: string): boolean {
    return /^[A-Z0-9]{5,8}$/.test(plate);
  }

  /**
   * Traduce un error de axios al consumir el recurso DINARDAP/ANT a un
   * mensaje legible para el cliente. Si el error trae status HTTP conocido
   * devuelve un mensaje específico (401, 403, 404, 5xx…); caso contrario
   * cae al mensaje genérico de servicio fuera de línea.
   */
  private _buildAntErrorMessage(error: any): { errorCode: ErrorCode; message: string } {
    const fallback = {
      errorCode: ErrorCode.SYSTEM_INACTIVE,
      message: 'El sistema de la ANT se encuentra fuera de servicio, por favor inténtalo más tarde',
    };

    const status: number | undefined = error?.response?.status;
    const code: string | undefined = error?.code;

    if (status === 400) {
      return { errorCode: ErrorCode.UNKNOWN, message: '400 Solicitud incorrecta hacia el servicio de la ANT' };
    }
    if (status === 401) {
      return { errorCode: ErrorCode.UNAUTHORIZED, message: '401 No autorizado para consumir el recurso de la ANT' };
    }
    if (status === 403) {
      return { errorCode: ErrorCode.UNAUTHORIZED, message: '403 Acceso prohibido al recurso de la ANT' };
    }
    if (status === 404) {
      return { errorCode: ErrorCode.NOT_FOUND, message: '404 Recurso no encontrado en la ANT' };
    }
    if (status === 408 || code === 'ECONNABORTED' || code === 'ETIMEDOUT') {
      return { errorCode: ErrorCode.HTTP_ERROR_REINTENT, message: 'No se pudo establecer comunicación con la ANT, inténtalo más tarde' };
    }
    if (status === 429) {
      return { errorCode: ErrorCode.UNKNOWN, message: '429 Demasiadas solicitudes a la ANT, inténtalo más tarde' };
    }
    if (status && status >= 500) {
      return fallback;
    }

    return fallback;
  }

  /**
   * Convierte el array de columnas [{campo, valor}] en un objeto plano { campo: valor }
   * para facilitar el acceso a los datos: cols['apellido1'], cols['correo'], etc.
   */
  private _parseCols(columnasArray: { campo: string; valor: string }[]): Record<string, string> {
    const result: Record<string, string> = {};
    for (const col of (columnasArray ?? [])) {
      result[col.campo] = col.valor ?? '';
    }
    return result;
  }

  private async _getAntDataByPlate(plate: string): Promise<{
    data: AntResponse | null;
    errorCode: ErrorCode;
    message: string;
  }> {
    if (!this.dinardapAntBaseUrl) {
      this.logger.error('DINARDAP_ANT_BASE_URL no configurado');
      return {
        data: null,
        errorCode: ErrorCode.SYSTEM_INACTIVE,
        message: 'Enlace del sistema de la ANT no configurado, por favor comuníquese con soporte técnico',
      };
    }

    this.token = this.commonGimService.getTokenGim2();
    const accessToken = this.token;

    if (!accessToken) {
      this.logger.error('Token GIM2 no disponible para DINARDAP ANT');
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

    const config: AxiosRequestConfig = {
      method: 'GET',
      url,
      timeout: 20000,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/json',
      },
    };

    try {
      const { data } = await axios.request<any>(config);

      // Estructura: paquete.entidades.entidad[0].filas.fila[0].columnas.columna[]
      const entidadRaw =
        data?.paquete?.entidades?.entidad?.[0] ??
        data?.paquete?.entidades?.entidad ??
        null;

      if (!entidadRaw) {
        this.logger.warn(`No se encontró entidad para la placa ${plate}`);
        return {
          data: null,
          errorCode: ErrorCode.NOT_FOUND,
          message: 'No se encontró información del vehículo en el sistema de la ANT',
        };
      }

      // Extraer primera fila y aplanar columnas a objeto plano { campo: valor }
      const filaRaw = entidadRaw?.filas?.fila?.[0] ?? entidadRaw?.filas?.fila ?? null;
      const cols: Record<string, string> = filaRaw?.columnas?.columna ? this._parseCols(filaRaw.columnas.columna) : {};

      // ── Persona ──────────────────────────────────────────────────────────────
      const firstName    = String(cols['nombres']        || '').trim();
      const apellido1    = String(cols['apellido1']      || '').trim();
      const apellido2    = String(cols['apellido2']      || '').trim();
      const lastName     = [apellido1, apellido2].filter(Boolean).join(' ').trim();
      const fullName     = String(cols['propietario']    || `${lastName} ${firstName}`).trim();
      const identityCard = String(cols['docPropietario'] || '').trim();
      const email        = String(cols['correo']         || '').trim();
      // Phone may arrive with a leading ";" (e.g. ";0939700013") — strip it
      const phone        = String(cols['telefono']       || '').replace(/^;+/, '').trim();
      const address      = String(cols['direccion']      || '').trim();

      // ── Vehicle ───────────────────────────────────────────────────────────────
      const brand       = String(cols['marca']        || '').trim();
      const model       = String(cols['modelo']       || '').trim();
      const year        = String(cols['anio']         || '').trim();
      const color       = String(cols['color']        || '').trim();
      const chassis     = String(cols['chasis']       || '').trim();
      const motor       = String(cols['motor']        || '').trim();
      const vehicleType = String(cols['tipoVehiculo'] || '').trim();
      const serviceType = String(cols['tipoServicio'] || '').trim();
      const fuelType    = String(cols['combustible']  || '').trim();
      const passengers  = String(cols['pasajeros']    || '').trim();

      // ── Registration ──────────────────────────────────────────────────────────
      const matriculaYear  = String(cols['anioMatriculado'] || '').trim();
      const matriculaDate  = String(cols['fechaMatricula']  || '').trim();
      const expirationDate = String(cols['fechaCaducidad']  || '').trim();

      if (!fullName && !identityCard && !email) {
        this.logger.warn(`La respuesta vino sin datos útiles para la placa ${plate}`);
        return {
          data: null,
          errorCode: ErrorCode.NOT_FOUND,
          message: 'La respuesta del sistema ANT no contiene datos útiles para esta placa',
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
        `DINARDAP ANT lookup failed plate=${plate}: ${error?.response?.data ? JSON.stringify(error.response.data) : error?.message ?? error}`,
      );
      const mapped = this._buildAntErrorMessage(error);
      return {
        data: null,
        errorCode: mapped.errorCode,
        message: mapped.message,
      };
    }
  }

}
