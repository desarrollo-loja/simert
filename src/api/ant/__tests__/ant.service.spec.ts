import { ErrorCode } from 'src/common/glob/error';

jest.mock('axios', () => ({
  __esModule: true,
  default: { request: jest.fn() },
}));
import axios from 'axios';

import { AntService } from '../ant.service';

const buildConfigMock = (baseUrl: string | undefined = 'http://ant.test') => ({
  get: jest.fn().mockReturnValue(baseUrl),
});

const buildLoggerServiceMock = () => ({ saveLogsAntLogger: jest.fn() });

describe('AntService', () => {
  let service: AntService;
  let loggerService: ReturnType<typeof buildLoggerServiceMock>;

  beforeEach(() => {
    loggerService = buildLoggerServiceMock();
    service = new AntService(buildConfigMock() as any, loggerService as any);
    (service as any).logger = { error: jest.fn(), warn: jest.fn() };
    (axios.request as jest.Mock).mockReset();
  });

  describe('findAll', () => {
    it('returns the simulated ANT entries with NONE error code', async () => {
      const result = await service.findAll();
      expect(result.errorCode).toBe(ErrorCode.NONE);
      expect(Array.isArray(result.data)).toBe(true);
      expect((result.data as any[]).length).toBe(2);
    });
  });

  describe('getUserDataByPlateAnt', () => {
    it('returns NOT_FOUND when ANT_BASE_URL is missing', async () => {
      service = new AntService(
        buildConfigMock(undefined) as any,
        loggerService as any,
      );
      (service as any).logger = { error: jest.fn() };

      const result = await service.getUserDataByPlateAnt('ABC');

      expect(result.errorCode).toBe(ErrorCode.NOT_FOUND);
      expect(result.data).toBeNull();
    });

    it('returns NOT_FOUND when SOAP response has no vehicle node', async () => {
      (axios.request as jest.Mock).mockResolvedValueOnce({
        data: `<?xml version="1.0"?>
          <soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/">
            <soapenv:Body>
              <consultarVehiculoResponse>
                <return><code>200</code></return>
              </consultarVehiculoResponse>
            </soapenv:Body>
          </soapenv:Envelope>`,
      });

      const result = await service.getUserDataByPlateAnt('ABC');

      expect(result.errorCode).toBe(ErrorCode.NOT_FOUND);
    });

    it('returns mapped data when SOAP response contains vehicle info', async () => {
      (axios.request as jest.Mock).mockResolvedValueOnce({
        data: `<?xml version="1.0"?>
          <soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/">
            <soapenv:Body>
              <consultarVehiculoResponse>
                <return>
                  <code>200</code>
                  <vehicle>
                    <nombrePropAnterior>JUAN</nombrePropAnterior>
                    <apellido1>PEREZ</apellido1>
                    <apellido2>LOPEZ</apellido2>
                    <cedulaPropAnterior>1104187768</cedulaPropAnterior>
                    <correo>juan@example.com</correo>
                  </vehicle>
                </return>
              </consultarVehiculoResponse>
            </soapenv:Body>
          </soapenv:Envelope>`,
      });

      const result = await service.getUserDataByPlateAnt('ABC');

      expect(result.errorCode).toBe(ErrorCode.NONE);
      expect(result.data).toEqual({
        fullName: 'JUAN PEREZ LOPEZ',
        identityCard: '1104187768',
        email: 'juan@example.com',
        firstName: 'JUAN',
        lastName: 'PEREZ LOPEZ',
      });
    });

    it('returns NOT_FOUND when vehicle has no meaningful fields', async () => {
      (axios.request as jest.Mock).mockResolvedValueOnce({
        data: `<?xml version="1.0"?>
          <Envelope><Body>
            <consultarVehiculoResponse><return>
              <code>200</code>
              <vehicle></vehicle>
            </return></consultarVehiculoResponse>
          </Body></Envelope>`,
      });

      const result = await service.getUserDataByPlateAnt('ABC');

      expect(result.errorCode).toBe(ErrorCode.NOT_FOUND);
    });

    it('warns when SOAP returns a non-200 code but vehicle present', async () => {
      (axios.request as jest.Mock).mockResolvedValueOnce({
        data: `<?xml version="1.0"?>
          <Envelope><Body>
            <consultarVehiculoResponse><return>
              <code>500</code>
              <message>fail</message>
              <vehicle>
                <nombrePropAnterior>X</nombrePropAnterior>
              </vehicle>
            </return></consultarVehiculoResponse>
          </Body></Envelope>`,
      });

      const result = await service.getUserDataByPlateAnt('ABC');

      expect((service as any).logger.warn).toHaveBeenCalled();
      expect(result.errorCode).toBe(ErrorCode.NONE);
    });

    it('returns NOT_FOUND when axios throws', async () => {
      (axios.request as jest.Mock).mockRejectedValueOnce(new Error('network'));

      const result = await service.getUserDataByPlateAnt('ABC');

      expect(result.errorCode).toBe(ErrorCode.NOT_FOUND);
    });
  });
});
