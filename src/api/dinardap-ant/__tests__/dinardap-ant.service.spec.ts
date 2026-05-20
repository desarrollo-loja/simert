import { ErrorCode } from 'src/common/glob/error';

jest.mock('axios', () => ({
  __esModule: true,
  default: { request: jest.fn() },
}));
import axios from 'axios';

import { DinardapAntService } from '../dinardap-ant.service';

const buildConfigMock = (baseUrl?: string) => ({
  get: jest.fn().mockReturnValue(baseUrl),
});

const buildGimMock = (token: string | null = 'tok-123') => ({
  getTokenGim2: jest.fn().mockReturnValue(token),
});

const buildEntidad = (cols: Record<string, string>) => ({
  paquete: {
    entidades: {
      entidad: [
        {
          filas: {
            fila: [
              {
                columnas: {
                  columna: Object.entries(cols).map(([campo, valor]) => ({
                    campo,
                    valor,
                  })),
                },
              },
            ],
          },
        },
      ],
    },
  },
});

describe('DinardapAntService', () => {
  let service: DinardapAntService;
  let gim: ReturnType<typeof buildGimMock>;

  beforeEach(() => {
    gim = buildGimMock();
    service = new DinardapAntService(buildConfigMock('http://dinardap.test') as any, gim as any);
    (service as any).logger = { error: jest.fn(), warn: jest.fn() };
    (axios.request as jest.Mock).mockReset();
  });

  describe('getUserDataByPlateAnt', () => {
    it('returns SYSTEM_INACTIVE when base URL is missing', async () => {
      service = new DinardapAntService(buildConfigMock(undefined) as any, gim as any);
      (service as any).logger = { error: jest.fn() };

      const result = await service.getUserDataByPlateAnt('ABC');

      expect(result.errorCode).toBe(ErrorCode.SYSTEM_INACTIVE);
      expect(result.data).toBeNull();
      expect((result as any).message).toMatch(/fuera de servicio/i);
    });

    it('returns UNAUTHORIZED when token is unavailable', async () => {
      gim = buildGimMock(null);
      service = new DinardapAntService(buildConfigMock('http://dinardap.test') as any, gim as any);
      (service as any).logger = { error: jest.fn() };

      const result = await service.getUserDataByPlateAnt('ABC');

      expect(result.errorCode).toBe(ErrorCode.UNAUTHORIZED);
      expect((result as any).message).toMatch(/No autorizado/i);
    });

    it('URL-encodes the plate when calling DINARDAP', async () => {
      (axios.request as jest.Mock).mockResolvedValueOnce({ data: {} });

      await service.getUserDataByPlateAnt('a/b');

      const callArgs = (axios.request as jest.Mock).mock.calls[0][0];
      expect(callArgs.url).toContain('a%2Fb');
      expect(callArgs.url).not.toContain('a/b/registration');
    });

    it('returns NOT_FOUND when payload has no entidad', async () => {
      (axios.request as jest.Mock).mockResolvedValueOnce({ data: { paquete: {} } });

      const result = await service.getUserDataByPlateAnt('ABC');

      expect(result.errorCode).toBe(ErrorCode.NOT_FOUND);
    });

    it('returns NOT_FOUND when no meaningful fields in the response', async () => {
      (axios.request as jest.Mock).mockResolvedValueOnce({
        data: buildEntidad({ irrelevant: 'x' }),
      });

      const result = await service.getUserDataByPlateAnt('ABC');

      expect(result.errorCode).toBe(ErrorCode.NOT_FOUND);
    });

    it('returns mapped data when response contains owner+vehicle', async () => {
      (axios.request as jest.Mock).mockResolvedValueOnce({
        data: buildEntidad({
          nombres: 'JUAN',
          apellido1: 'PEREZ',
          apellido2: 'LOPEZ',
          propietario: 'PEREZ LOPEZ JUAN',
          docPropietario: '1104187768',
          correo: 'juan@example.com',
          telefono: ';0939700013',
          direccion: 'Av X',
          marca: 'CHEVROLET',
          modelo: 'SAIL',
          anio: '2018',
          color: 'BLANCO',
          chasis: 'CH-1',
          motor: 'M-1',
          tipoVehiculo: 'AUTOMOVIL',
          tipoServicio: 'PARTICULAR',
          combustible: 'GASOLINA',
          pasajeros: '5',
          anioMatriculado: '2024',
          fechaMatricula: '2024-01-15',
          fechaCaducidad: '2025-01-15',
        }),
      });

      const result = await service.getUserDataByPlateAnt('ABC');

      expect(result.errorCode).toBe(ErrorCode.NONE);
      const data: any = result.data;
      expect(data.fullName).toBe('PEREZ LOPEZ JUAN');
      expect(data.firstName).toBe('JUAN');
      expect(data.lastName).toBe('PEREZ LOPEZ');
      expect(data.identityCard).toBe('1104187768');
      expect(data.phone).toBe('0939700013'); // leading ';' stripped
      expect(data.brand).toBe('CHEVROLET');
      expect(data.passengers).toBe('5');
    });

    it('falls back to "lastName firstName" when propietario is missing', async () => {
      (axios.request as jest.Mock).mockResolvedValueOnce({
        data: buildEntidad({
          nombres: 'JUAN',
          apellido1: 'PEREZ',
          docPropietario: '1',
        }),
      });

      const result = await service.getUserDataByPlateAnt('ABC');
      const data: any = result.data;
      expect(data.fullName).toBe('PEREZ JUAN');
    });

    it('handles entidad as a single object rather than array', async () => {
      (axios.request as jest.Mock).mockResolvedValueOnce({
        data: {
          paquete: {
            entidades: {
              entidad: {
                filas: {
                  fila: {
                    columnas: {
                      columna: [{ campo: 'correo', valor: 'a@b.c' }],
                    },
                  },
                },
              },
            },
          },
        },
      });

      const result = await service.getUserDataByPlateAnt('ABC');
      expect(result.errorCode).toBe(ErrorCode.NONE);
    });

    it('maps 401 from axios to UNAUTHORIZED with a specific message', async () => {
      (axios.request as jest.Mock).mockRejectedValueOnce({
        response: { status: 401, data: { msg: 'unauth' } },
      });

      const result = await service.getUserDataByPlateAnt('ABC');

      expect(result.errorCode).toBe(ErrorCode.UNAUTHORIZED);
      expect((result as any).message).toMatch(/401/);
      expect((result as any).message).toMatch(/No autorizado/i);
    });

    it('maps 404 from axios to NOT_FOUND with a specific message', async () => {
      (axios.request as jest.Mock).mockRejectedValueOnce({
        response: { status: 404, data: { msg: 'missing' } },
      });

      const result = await service.getUserDataByPlateAnt('ABC');

      expect(result.errorCode).toBe(ErrorCode.NOT_FOUND);
      expect((result as any).message).toMatch(/404/);
    });

    it('maps 5xx from axios to SYSTEM_INACTIVE with the generic message', async () => {
      (axios.request as jest.Mock).mockRejectedValueOnce({
        response: { status: 503, data: { msg: 'down' } },
      });

      const result = await service.getUserDataByPlateAnt('ABC');

      expect(result.errorCode).toBe(ErrorCode.SYSTEM_INACTIVE);
      expect((result as any).message).toMatch(/fuera de servicio/i);
    });

    it('maps timeout (ECONNABORTED) to HTTP_ERROR_REINTENT', async () => {
      (axios.request as jest.Mock).mockRejectedValueOnce({ code: 'ECONNABORTED', message: 'timeout' });

      const result = await service.getUserDataByPlateAnt('ABC');

      expect(result.errorCode).toBe(ErrorCode.HTTP_ERROR_REINTENT);
      expect((result as any).message).toMatch(/Tiempo de espera/i);
    });

    it('falls back to SYSTEM_INACTIVE when axios throws without response payload', async () => {
      (axios.request as jest.Mock).mockRejectedValueOnce(new Error('net'));

      const result = await service.getUserDataByPlateAnt('ABC');

      expect(result.errorCode).toBe(ErrorCode.SYSTEM_INACTIVE);
      expect((result as any).message).toMatch(/fuera de servicio/i);
    });
  });
});
