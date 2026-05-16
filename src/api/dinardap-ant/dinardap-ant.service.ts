import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosRequestConfig } from 'axios';
import { CommonGimService } from 'src/common/common.gim.service';
import { ErrorCode } from 'src/common/glob/error';
import { AntResponse } from 'src/common/intefaces/ant_response.interface';

type AntLookupResult =
  | { errorCode: ErrorCode.NONE; data: AntResponse }
  | { errorCode: Exclude<ErrorCode, ErrorCode.NONE>; data: null; message?: string };

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
    const antData = await this._getAntDataByPlate(plate);

    if (!antData) {
      return {
        errorCode: ErrorCode.NOT_FOUND,
        data: null,
        message: 'No se encontró información del vehículo',
      };
    }

    return { errorCode: ErrorCode.NONE, data: antData };
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

  private async _getAntDataByPlate(plate: string): Promise<AntResponse | null> {
    if (!this.dinardapAntBaseUrl) {
      this.logger.error('DINARDAP_ANT_BASE_URL no configurado');
      return null;
    }

    this.token = this.commonGimService.getTokenGim2();
    const accessToken = this.token;

    if (!accessToken) {
      this.logger.error('Token GIM2 no disponible para DINARDAP ANT');
      return null;
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
        return null;
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
      // El teléfono a veces viene con ";" al inicio (ej: ";0939700013"), se limpia
      const phone        = String(cols['telefono']       || '').replace(/^;+/, '').trim();
      const address      = String(cols['direccion']      || '').trim();

      // ── Vehículo ──────────────────────────────────────────────────────────────
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

      // ── Matrícula ─────────────────────────────────────────────────────────────
      const matriculaYear  = String(cols['anioMatriculado'] || '').trim();
      const matriculaDate  = String(cols['fechaMatricula']  || '').trim();
      const expirationDate = String(cols['fechaCaducidad']  || '').trim();

      if (!fullName && !identityCard && !email) {
        this.logger.warn(`La respuesta vino sin datos útiles para la placa ${plate}`);
        return null;
      }

      return {
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
      };
    } catch (error: any) {
      this.logger.error(
        `DINARDAP ANT lookup failed plate=${plate}: ${error?.response?.data ? JSON.stringify(error.response.data) : error?.message ?? error}`,
      );
      return null;
    }
  }

}
