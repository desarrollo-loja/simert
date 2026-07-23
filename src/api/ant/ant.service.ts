import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosRequestConfig } from 'axios';
import { XMLParser } from 'fast-xml-parser';
import { ErrorCode } from 'src/common/glob/error';

import { AntDataByPlateResponse } from './interfaces/ant-responses.interfaces';

export interface AntDataResponse {
    fullName: string;
    identityCard: string;
    email: string;
    firstName: string;
    lastName: string;
}

type AntLookupResult =
    | { errorCode: ErrorCode.NONE; data: AntDataResponse }
    | {
          errorCode: Exclude<ErrorCode, ErrorCode.NONE>;
          data: null;
          message?: string;
      };

/**
 * Service that integrates with the ANT (Agencia Nacional de Tránsito) SOAP
 * web service to look up vehicle and owner data by plate number. Parses the
 * XML response and normalises it to {@link AntDataResponse}.
 */
@Injectable()
export class AntService {
    private readonly logger = new Logger('AntService');
    private readonly antBaseUrl: string;
    // private readonly antApiKey: string;

    private readonly xmlParser = new XMLParser({
        ignoreAttributes: false,
        removeNSPrefix: true, // strips soapenv:, ns2:, etc. prefixes
        parseTagValue: true,
        trimValues: true,
    });

    /**
     * Creates the ANT service and resolves the ANT base URL from configuration.
     *
     * @param configService Configuration service used to read ANT connection settings.
     */
    constructor(private readonly configService: ConfigService) {
        this.antBaseUrl = this.configService.get<string>('ANT_BASE_URL');
        // this.antApiKey = this.configService.get<string>('ANT_API_KEY');
    }

    /**
     * Returns a stubbed list of ANT records used for local development.
     *
     * @returns Promise resolving to an object with the error code and the stubbed ANT data.
     */
    async findAll() {
        try {
            // Stubbed ANT data for local development
            const data = [
                { id: 1, name: 'Simulación ANT 1', status: 'Active' },
                { id: 2, name: 'Simulación ANT 2', status: 'Inactive' },
            ];
            return { errorCode: ErrorCode.NONE, data };
        } catch (error) {
            this.logger.error(`Error in AntService: ${error.message}`);
            return { errorCode: ErrorCode.UNKNOWN, data: [] };
        }
    }

    /**
     * Looks up vehicle owner data by plate number through the ANT service.
     *
     * @param plate Vehicle plate number to query.
     * @returns Promise resolving to the lookup result with owner data or a not-found error.
     */
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

    // SOAP protocol resource named consultarVehiculo
    /**
     * Calls the ANT SOAP `consultarVehiculo` operation and parses the XML response.
     *
     * @param plate Vehicle plate number to query.
     * @returns Promise resolving to the normalised owner data, or `null` when not found or on error.
     */
    private async _getAntDataByPlate(
        plate: string,
    ): Promise<AntDataResponse | null> {
        if (!this.antBaseUrl) {
            this.logger.error('ANT_BASE_URL not configured');

            return null;
        }

        const url = `${this.antBaseUrl}/middleApp-1.0-SNAPSHOT/InfractionWSV2`;

        const xmlBody = `
      <soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:mid="http://middleapp.loja.gob.ec/">
        <soapenv:Header/>
        <soapenv:Body>
          <mid:consultarVehiculo>
            <placa>${plate}</placa>
          </mid:consultarVehiculo>
        </soapenv:Body>
      </soapenv:Envelope>
    `.trim();

        const config: AxiosRequestConfig = {
            method: 'POST', // SOAP always uses POST
            // Base URL is the provided IP without the ?wsdl suffix
            url,
            data: xmlBody,
            timeout: 15000,
            headers: {
                'Content-Type': 'text/xml; charset=UTF-8',
                Accept: 'text/xml',
                SOAPAction: '', // empty in the WSDL, but included for compatibility
                username: process.env.ANT_USERNAME ?? '',
                password: process.env.ANT_PASSWORD ?? '',
            },
            responseType: 'text', // IMPORTANT: we want the raw XML
        };

        try {
            const { data: xml } = await axios.request<string>(config);

            // 1) Parse XML into an object
            const parsed = this.xmlParser.parse(xml);

            // 2) Navigate envelope/body/response/return/vehicle
            const body =
                parsed?.Envelope?.Body ??
                parsed?.Envelope?.body ??
                parsed?.envelope?.body;

            const response =
                body?.consultarVehiculoResponse ??
                body?.consultarVehiculoResponse?.return;

            // In RPC literal it sometimes comes as:
            // Body.consultarVehiculoResponse.return.vehicle
            const payload = body?.consultarVehiculoResponse?.return ?? response;

            // WSDL final return shape: responseVehiculo { code, message, vehicle }
            const code = Number(payload?.code ?? payload?.Code ?? 0);
            const vehicle = payload?.vehicle;

            if (!vehicle) return null;

            // Non-zero / non-200 code means failure — adjust condition if the service uses 200.
            if (code && code !== 200) {
                this.logger.warn(
                    `ANT responded code=${code} message=${payload?.message ?? ''}`,
                );
                // Could also return null here depending on desired behavior.
            }

            return this._buildAntDataResponse(vehicle);
        } catch (error: any) {
            this.logger.error(
                `ANT lookup failed plate=${plate}: ${error?.message ?? error}`,
            );
            return null;
        }
    }

    /**
     * Builds a normalised {@link AntDataResponse} from a raw ANT vehicle payload.
     *
     * @param vehicle Raw vehicle object returned by the ANT SOAP service.
     * @returns Promise resolving to the normalised owner data, or `null` when no relevant data is present.
     */
    private async _buildAntDataResponse(
        vehicle: AntDataByPlateResponse | any,
    ): Promise<AntDataResponse | null> {
        // const fullName = responseData?.vehicle?.nombrePotencialProp + responseData?.vehicle?.apellido1 + responseData?.vehicle?.apellido2;
        const firstName = vehicle?.nombrePropAnterior ?? '';
        const lastName =
            `${vehicle?.apellido1 ?? ''} ${vehicle?.apellido2 ?? ''}`.trim();
        const fullName = `${firstName} ${lastName}`.trim();

        const identityCard = vehicle?.cedulaPropAnterior ?? '';
        const email = vehicle?.correo ?? '';

        if (!fullName && !identityCard && !email) {
            // If we got nothing relevant.
            return null;
        }

        return {
            fullName: String(fullName || '').trim(),
            identityCard: String(identityCard || '').trim(),
            email: String(email || '').trim(),
            firstName: String(firstName || '').trim(),
            lastName: String(lastName || '').trim(),
        };
    }
}
