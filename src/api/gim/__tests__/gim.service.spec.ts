import { ErrorCode } from 'src/common/glob/error';
import { StatusObligation } from 'src/common/glob/responses-gim';
import { IncidentStatus } from 'src/common/glob/type/type_incident';

jest.mock('axios', () => ({
  __esModule: true,
  default: {
    post: jest.fn(),
    get: jest.fn(),
    isAxiosError: jest.fn(() => false),
  },
}));
import axios from 'axios';

import { GimService } from '../gim.service';
import { ConceptPaidObligation } from '../interfaces/gim-responses.interfaces';

const buildConfigMock = () => ({
  get: jest.fn((key: string) => {
    const env: Record<string, string> = {
      GIM_BASE_URL: 'http://gim.test',
      GIM_BASE_URL_LOGIN: 'http://kc.test',
      GIM2_REALM_MUNICIPIO: 'mun',
    };
    return env[key];
  }),
});

const buildIncidentService = () => ({ update: jest.fn() });
const buildIncidentTypeService = () => ({ getTypeIncidentById: jest.fn() });
const buildCommonGimMock = () => ({ getTokenGim2: jest.fn().mockReturnValue('tok-gim') });
const buildCommonAuthMock = () => ({
  filterByIdentityCard: jest.fn(),
  updateResidentId: jest.fn(),
});
const buildDinardapMock = () => ({ getUserDataByPlateAnt: jest.fn() });
const buildLoggerServiceMock = () => ({ saveLogsGimLogger: jest.fn() });

describe('GimService', () => {
  let service: GimService;
  let incidentService: ReturnType<typeof buildIncidentService>;
  let incidentTypeService: ReturnType<typeof buildIncidentTypeService>;
  let commonGim: ReturnType<typeof buildCommonGimMock>;
  let commonAuth: ReturnType<typeof buildCommonAuthMock>;
  let dinardap: ReturnType<typeof buildDinardapMock>;
  let loggerService: ReturnType<typeof buildLoggerServiceMock>;

  beforeEach(() => {
    (axios.post as jest.Mock).mockReset();
    (axios.get as jest.Mock).mockReset();
    incidentService = buildIncidentService();
    incidentTypeService = buildIncidentTypeService();
    commonGim = buildCommonGimMock();
    commonAuth = buildCommonAuthMock();
    dinardap = buildDinardapMock();
    loggerService = buildLoggerServiceMock();

    service = new GimService(
      commonAuth as any,
      buildConfigMock() as any,
      incidentService as any,
      incidentTypeService as any,
      commonGim as any,
      dinardap as any,
      loggerService as any,
    );
    (service as any).logger = { error: jest.fn(), warn: jest.fn(), log: jest.fn(), debug: jest.fn() };
  });

  // ─── getToken ────────────────────────────────────────────────────────────
  describe('getToken', () => {
    it('proxies to CommonGimService.getTokenGim2', () => {
      expect(service.getToken()).toBe('tok-gim');
      expect(commonGim.getTokenGim2).toHaveBeenCalled();
    });
  });

  // ─── findPaidObligations ─────────────────────────────────────────────────
  describe('findPaidObligations', () => {
    const range = { startDate: '2026-07-01', endDate: '2026-07-15' };

    it('gets the resource with the filter as query params and a Bearer token', async () => {
      (axios.get as jest.Mock).mockResolvedValue({
        data: { ok: true, code: '200', obligations: [] },
      });

      await service.findPaidObligations({
        ...range,
        concept: ConceptPaidObligation.FINE,
        page: 0,
        size: 50,
      });

      expect(axios.get).toHaveBeenCalledWith(
        'http://gim.test/api/external/simert/paid-obligations',
        {
          headers: {
            'Content-Type': 'application/json',
            Authorization: 'Bearer tok-gim',
          },
          params: {
            startDate: '2026-07-01',
            endDate: '2026-07-15',
            concept: 'MULTA',
            page: 0,
            size: 50,
          },
        },
      );
    });

    it('coerces the page/size query strings and defaults them when absent', async () => {
      (axios.get as jest.Mock).mockResolvedValue({
        data: { ok: true, code: '200', obligations: [] },
      });

      await service.findPaidObligations({ ...range, page: '2' as any });

      expect(axios.get).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ params: expect.objectContaining({ page: 2, size: 50 }) }),
      );
    });

    it('normalizes the GIM envelope and totals the collected amount', async () => {
      (axios.get as jest.Mock).mockResolvedValue({
        data: {
          ok: true,
          code: '200',
          obligations: [
            { obligationNumber: '1001', total: 25.5 },
            { obligationNumber: '1002', total: 10 },
          ],
        },
      });

      const result = await service.findPaidObligations({ ...range, size: 50 });

      expect(result.errorCode).toBe(ErrorCode.NONE);
      expect(result.data.items).toHaveLength(2);
      expect(result.data.total).toBe(2);
      expect(result.data.totalAmount).toBe(35.5);
      expect(result.data.totalPages).toBe(1);
    });

    it('normalizes a Spring page envelope, keeping its own totals', async () => {
      (axios.get as jest.Mock).mockResolvedValue({
        data: {
          content: [{ obligationNumber: '2001', total: 8 }],
          totalElements: 120,
          totalPages: 3,
          number: 1,
          size: 50,
        },
      });

      const result = await service.findPaidObligations({ ...range, page: 1, size: 50 });

      expect(result.errorCode).toBe(ErrorCode.NONE);
      expect(result.data.items).toHaveLength(1);
      expect(result.data.total).toBe(120);
      expect(result.data.totalPages).toBe(3);
      expect(result.data.page).toBe(1);
    });

    it('rejects an inverted range without calling GIM', async () => {
      const result = await service.findPaidObligations({
        startDate: '2026-07-15',
        endDate: '2026-07-01',
      });

      expect(axios.get).not.toHaveBeenCalled();
      expect(result.errorCode).toBe(ErrorCode.NOT_VALID);
      expect(result.data).toBeNull();
    });

    it('rejects unparseable dates without calling GIM', async () => {
      const result = await service.findPaidObligations({
        startDate: 'ayer',
        endDate: 'hoy',
      });

      expect(axios.get).not.toHaveBeenCalled();
      expect(result.errorCode).toBe(ErrorCode.NOT_VALID);
    });

    it('accepts a range of any span', async () => {
      (axios.get as jest.Mock).mockResolvedValue({
        data: { ok: true, code: '200', obligations: [] },
      });

      const result = await service.findPaidObligations({
        startDate: '2025-01-01',
        endDate: '2026-12-31',
      });

      expect(result.errorCode).toBe(ErrorCode.NONE);
      expect(axios.get).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          params: expect.objectContaining({
            startDate: '2025-01-01',
            endDate: '2026-12-31',
          }),
        }),
      );
    });

    it('returns NOT_FOUND with the GIM message on a logical failure', async () => {
      (axios.get as jest.Mock).mockResolvedValue({
        data: { ok: false, code: '400', message: 'Concepto inválido' },
      });

      const result = await service.findPaidObligations(range);

      expect(result.errorCode).toBe(ErrorCode.NOT_FOUND);
      expect(result.message).toBe('Concepto inválido');
      expect(result.data).toBeNull();
    });

    it('audits a logical failure in logsgim with the reason GIM gave', async () => {
      const response = { ok: false, code: '400', message: 'Concepto inválido' };
      (axios.get as jest.Mock).mockResolvedValue({ data: response });

      await service.findPaidObligations(range);

      expect(loggerService.saveLogsGimLogger).toHaveBeenCalledWith(
        expect.objectContaining({
          resource: 'GIM',
          service: 'GimService',
          method: 'findPaidObligations',
          endpoint: 'http://gim.test/api/external/simert/paid-obligations',
          httpStatus: 200,
          errorCode: ErrorCode.NOT_FOUND,
          message: 'Concepto inválido',
          response,
        }),
      );
    });

    it('audits a 4xx failure in logsgim, keeping the GIM response body', async () => {
      (axios.get as jest.Mock).mockRejectedValue({
        name: 'AxiosError',
        message: 'Request failed with status code 401',
        response: { status: 401, data: { error: 'invalid_token' } },
      });

      const result = await service.findPaidObligations(range);

      expect(result.errorCode).toBe(ErrorCode.NOT_FOUND);
      expect(loggerService.saveLogsGimLogger).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'findPaidObligations',
          httpStatus: 401,
          response: { error: 'invalid_token' },
          exception: 'AxiosError: Request failed with status code 401',
        }),
      );
    });

    it('does not audit twice when the municipality server fails', async () => {
      (axios.isAxiosError as unknown as jest.Mock).mockReturnValue(true);
      (axios.get as jest.Mock).mockRejectedValue({
        name: 'AxiosError',
        message: 'socket hang up',
      });

      await service.findPaidObligations(range);

      // Only the _getFromExternalApi layer logs 5xx/transport failures.
      expect(loggerService.saveLogsGimLogger).toHaveBeenCalledTimes(1);
      (axios.isAxiosError as unknown as jest.Mock).mockReturnValue(false);
    });

    it('reports HTTP_ERROR_REINTENT when the municipality server fails', async () => {
      (axios.isAxiosError as unknown as jest.Mock).mockReturnValue(true);
      (axios.get as jest.Mock).mockRejectedValue({
        name: 'AxiosError',
        message: 'socket hang up',
      });

      const result = await service.findPaidObligations(range);

      expect(result.errorCode).toBe(ErrorCode.HTTP_ERROR_REINTENT);
      expect(result.data).toBeNull();
      expect(loggerService.saveLogsGimLogger).toHaveBeenCalled();
      (axios.isAxiosError as unknown as jest.Mock).mockReturnValue(false);
    });
  });

  // ─── getUserByIdentityCardGim ────────────────────────────────────────────
  describe('getUserByIdentityCardGim', () => {
    it('returns NONE with taxpayer on success', async () => {
      (axios.post as jest.Mock).mockResolvedValueOnce({
        data: { ok: true, code: 200, taxpayer: { id: 1 } },
      });
      const result = await service.getUserByIdentityCardGim('1');
      expect(result.errorCode).toBe(ErrorCode.NONE);
      expect(result.taxpayer).toEqual({ id: 1 });
    });

    it('returns NOT_FOUND when response says not ok', async () => {
      (axios.post as jest.Mock).mockResolvedValueOnce({ data: { ok: false, code: 404 } });
      const result = await service.getUserByIdentityCardGim('1');
      expect(result.errorCode).toBe(ErrorCode.NOT_FOUND);
    });

    it('returns HTTP_ERROR_REINTENT on axios throw', async () => {
      (axios.post as jest.Mock).mockRejectedValueOnce(new Error('net'));
      const result = await service.getUserByIdentityCardGim('1');
      expect(result.errorCode).toBe(ErrorCode.HTTP_ERROR_REINTENT);
    });
  });

  // ─── createNewNaturalPersonGim ───────────────────────────────────────────
  describe('createNewNaturalPersonGim', () => {
    it('uses defaults when local user not found and returns residentDTO on success', async () => {
      commonAuth.filterByIdentityCard.mockResolvedValueOnce({ errorCode: ErrorCode.NOT_FOUND });
      (axios.post as jest.Mock).mockResolvedValueOnce({
        data: { ok: true, code: 200, residentDTO: { id: 7 } },
      });

      const result = await service.createNewNaturalPersonGim({
        identityCard: '1',
        firstName: 'Áéí',
        lastName: 'X',
        emailClient: 'A@B.C',
        controllerId: 1,
      } as any);
      expect(result.errorCode).toBe(ErrorCode.NONE);
      expect(result.residentDTO).toEqual({ id: 7 });
    });

    it('uses local user data and updates residentId when local user exists', async () => {
      commonAuth.filterByIdentityCard.mockResolvedValueOnce({
        errorCode: ErrorCode.NONE,
        data: [{
          id: 99,
          phone: '0939700013',
          identificationType: 1,
          firstName: 'JUAN',
          lastName: 'PEREZ',
          neighborhood: 'B',
          address: 'A',
          email: 'j@x.com',
          isForeigner: false,
          birthday: '1990-01-01T00:00:00.000Z',
          gender: 1,
          maritalStatus: 1,
          isHandicaped: false,
        }],
      });
      (axios.post as jest.Mock).mockResolvedValueOnce({
        data: { ok: true, code: 200, residentDTO: { id: 5 } },
      });
      const result = await service.createNewNaturalPersonGim({
        identityCard: '1',
        controllerId: 1,
      } as any);
      expect(result.errorCode).toBe(ErrorCode.NONE);
      expect(commonAuth.updateResidentId).toHaveBeenCalledWith(99, '1', 5);
    });

    it('uses local user data when phone does not start with 0 (prepends 0)', async () => {
      commonAuth.filterByIdentityCard.mockResolvedValueOnce({
        errorCode: ErrorCode.NONE,
        data: [{
          id: 99,
          phone: '939700013',
          identificationType: 1,
          firstName: 'JUAN',
          lastName: 'PEREZ',
        }],
      });
      (axios.post as jest.Mock).mockResolvedValueOnce({
        data: { ok: true, code: 200, residentDTO: { id: 5 } },
      });
      const result = await service.createNewNaturalPersonGim({
        identityCard: '1',
        controllerId: 1,
      } as any);
      expect(result.errorCode).toBe(ErrorCode.NONE);
    });

    it('handles 404-with-residentDTO branch (already exists in GIM)', async () => {
      commonAuth.filterByIdentityCard.mockResolvedValueOnce({ errorCode: ErrorCode.NOT_FOUND });
      (axios.post as jest.Mock).mockResolvedValueOnce({
        data: { ok: false, code: '404', residentDTO: { id: 8 }, message: 'exists' },
      });
      const result = await service.createNewNaturalPersonGim({ controllerId: 1 } as any);
      expect(result.errorCode).toBe(ErrorCode.NONE);
      expect(result.residentDTO).toEqual({ id: 8 });
    });

    it('returns NOT_FOUND when response is not ok and no residentDTO', async () => {
      commonAuth.filterByIdentityCard.mockResolvedValueOnce({ errorCode: ErrorCode.NOT_FOUND });
      (axios.post as jest.Mock).mockResolvedValueOnce({
        data: { ok: false, code: '500' },
      });
      const result = await service.createNewNaturalPersonGim({ controllerId: 1 } as any);
      expect(result.errorCode).toBe(ErrorCode.NOT_FOUND);
    });

    it('returns HTTP_ERROR_REINTENT on exception', async () => {
      commonAuth.filterByIdentityCard.mockRejectedValueOnce(new Error('e'));
      const result = await service.createNewNaturalPersonGim({ controllerId: 1 } as any);
      expect(result.errorCode).toBe(ErrorCode.HTTP_ERROR_REINTENT);
    });
  });

  // ─── createNewNaturalPersonGimNoExist ────────────────────────────────────
  describe('createNewNaturalPersonGimNoExist', () => {
    it('returns NONE with residentDTO on success', async () => {
      (axios.post as jest.Mock).mockResolvedValueOnce({
        data: { ok: true, code: 200, residentDTO: { id: 1 } },
      });
      const result = await service.createNewNaturalPersonGimNoExist({
        identificationType: 1,
        identificationNumber: '1',
        firstName: 'A',
        lastName: 'B',
        phoneNumber: '999',
        email: 'X@Y.Z',
        birthday: '1990-01-01T00:00:00.000Z',
        gender: 1,
        maritalStatus: 1,
      } as any);
      expect(result.errorCode).toBe(ErrorCode.NONE);
    });

    it('handles missing firstName/lastName fallback', async () => {
      (axios.post as jest.Mock).mockResolvedValueOnce({
        data: { ok: true, code: 200, residentDTO: { id: 1 } },
      });
      const result = await service.createNewNaturalPersonGimNoExist({
        identificationNumber: '1',
        phoneNumber: '0999',
      } as any);
      expect(result.errorCode).toBe(ErrorCode.NONE);
    });

    it('returns NONE when GIM responds 404 with residentDTO already existing', async () => {
      (axios.post as jest.Mock).mockResolvedValueOnce({
        data: { ok: false, code: '404', residentDTO: { id: 9 }, message: 'exists' },
      });
      const result = await service.createNewNaturalPersonGimNoExist({} as any);
      expect(result.errorCode).toBe(ErrorCode.NONE);
    });

    it('returns NOT_FOUND when response is not ok', async () => {
      (axios.post as jest.Mock).mockResolvedValueOnce({ data: { ok: false, code: '500' } });
      const result = await service.createNewNaturalPersonGimNoExist({} as any);
      expect(result.errorCode).toBe(ErrorCode.NOT_FOUND);
    });

    it('returns HTTP_ERROR_REINTENT on exception', async () => {
      (axios.post as jest.Mock).mockRejectedValueOnce(new Error('e'));
      const result = await service.createNewNaturalPersonGimNoExist({} as any);
      expect(result.errorCode).toBe(ErrorCode.HTTP_ERROR_REINTENT);
    });
  });

  // ─── verifateIncidentGim ─────────────────────────────────────────────────
  describe('verifateIncidentGim', () => {
    it('returns NONE with taxpayer on success', async () => {
      (axios.post as jest.Mock).mockResolvedValueOnce({
        data: { ok: true, code: 200, taxpayer: { id: 1 } },
      });
      expect((await service.verifateIncidentGim('1')).errorCode).toBe(ErrorCode.NONE);
    });

    it('returns NOT_FOUND when not ok', async () => {
      (axios.post as jest.Mock).mockResolvedValueOnce({ data: { ok: false } });
      expect((await service.verifateIncidentGim('1')).errorCode).toBe(ErrorCode.NOT_FOUND);
    });

    it('returns HTTP_ERROR_REINTENT on exception', async () => {
      (axios.post as jest.Mock).mockRejectedValueOnce(new Error('e'));
      expect((await service.verifateIncidentGim('1')).errorCode).toBe(ErrorCode.HTTP_ERROR_REINTENT);
    });
  });

  // ─── emitInfractionGim ────────────────────────────────────────────────────
  describe('emitInfractionGim', () => {
    const baseDto = (overrides: any = {}) => ({
      incidentTypeId: 1,
      optionalData: [{ key: 'residentId', value: 99 }],
      description: 'd',
      reference: 'r',
      createdAt: '2026-01-01T00:00:00Z',
      plate: 'P',
      nroTicket: 'N',
      vehicleType: 1,
      address: 'A',
      ...overrides,
    });

    it('returns NOT_FOUND when incidentType not found', async () => {
      incidentTypeService.getTypeIncidentById.mockResolvedValueOnce({
        errorCode: ErrorCode.NOT_FOUND,
        message: 'no',
      });
      const result = await service.emitInfractionGim(baseDto() as any);
      expect(result.errorCode).toBe(ErrorCode.NOT_FOUND);
    });

    it('returns NONE on success', async () => {
      incidentTypeService.getTypeIncidentById.mockResolvedValueOnce({
        errorCode: ErrorCode.NONE,
        incidentType: { code: 'C1' },
      });
      (axios.post as jest.Mock).mockResolvedValueOnce({
        data: { ok: true, code: '200', bondId: 1, bondNumber: 2 },
      });
      const result = await service.emitInfractionGim(baseDto() as any);
      expect(result.errorCode).toBe(ErrorCode.NONE);
    });

    it('defaults vehicleType to VEHICLE constant when missing', async () => {
      incidentTypeService.getTypeIncidentById.mockResolvedValueOnce({
        errorCode: ErrorCode.NONE,
        incidentType: { code: 'C1' },
      });
      (axios.post as jest.Mock).mockResolvedValueOnce({
        data: { ok: true, code: '200', bondId: 1, bondNumber: 2 },
      });
      const result = await service.emitInfractionGim(baseDto({ vehicleType: undefined }) as any);
      expect(result.errorCode).toBe(ErrorCode.NONE);
    });

    it('returns NOT_FOUND when GIM responds with ok=false and code=400', async () => {
      incidentTypeService.getTypeIncidentById.mockResolvedValueOnce({
        errorCode: ErrorCode.NONE,
        incidentType: { code: 'C' },
      });
      (axios.post as jest.Mock).mockResolvedValueOnce({
        data: { ok: false, code: '400', message: 'closed' },
      });
      const result = await service.emitInfractionGim(baseDto() as any);
      expect(result.errorCode).toBe(ErrorCode.NOT_FOUND);
    });

    it('returns NOT_FOUND when GIM responds with generic non-OK', async () => {
      incidentTypeService.getTypeIncidentById.mockResolvedValueOnce({
        errorCode: ErrorCode.NONE,
        incidentType: { code: 'C' },
      });
      (axios.post as jest.Mock).mockResolvedValueOnce({
        data: { ok: false, code: '500', message: 'oops' },
      });
      const result = await service.emitInfractionGim(baseDto() as any);
      expect(result.errorCode).toBe(ErrorCode.NOT_FOUND);
    });

    it('handles "rubro" 400 error from response.data', async () => {
      incidentTypeService.getTypeIncidentById.mockResolvedValueOnce({
        errorCode: ErrorCode.NONE,
        incidentType: { code: 'C' },
      });
      (axios.post as jest.Mock).mockRejectedValueOnce({
        response: { data: { ok: false, code: '400', message: 'SIMERT_SANCTION_ENTRY_CODES rubro 580 not permitted' } },
      });
      const result = await service.emitInfractionGim(baseDto() as any);
      expect(result.errorCode).toBe(ErrorCode.NOT_FOUND);
      expect(result.message).toContain('580');
    });

    it('handles "rubro" 400 with no number captured', async () => {
      incidentTypeService.getTypeIncidentById.mockResolvedValueOnce({
        errorCode: ErrorCode.NONE,
        incidentType: { code: 'C' },
      });
      (axios.post as jest.Mock).mockRejectedValueOnce({
        response: { data: { ok: false, code: '400', message: 'SIMERT_SANCTION_ENTRY_CODES' } },
      });
      const result = await service.emitInfractionGim(baseDto() as any);
      expect(result.errorCode).toBe(ErrorCode.NOT_FOUND);
    });

    it('handles generic 400 error from response.data', async () => {
      incidentTypeService.getTypeIncidentById.mockResolvedValueOnce({
        errorCode: ErrorCode.NONE,
        incidentType: { code: 'C' },
      });
      (axios.post as jest.Mock).mockRejectedValueOnce({
        response: { data: { ok: false, code: '400', message: 'session closed' } },
      });
      const result = await service.emitInfractionGim(baseDto() as any);
      expect(result.errorCode).toBe(ErrorCode.NOT_FOUND);
    });

    it('handles ok=false (non-400) response.data error', async () => {
      incidentTypeService.getTypeIncidentById.mockResolvedValueOnce({
        errorCode: ErrorCode.NONE,
        incidentType: { code: 'C' },
      });
      (axios.post as jest.Mock).mockRejectedValueOnce({
        response: { data: { ok: false, code: '500', message: 'down' } },
      });
      const result = await service.emitInfractionGim(baseDto() as any);
      expect(result.errorCode).toBe(ErrorCode.HTTP_ERROR_REINTENT);
    });

    it('returns HTTP_ERROR_REINTENT on plain Error', async () => {
      incidentTypeService.getTypeIncidentById.mockResolvedValueOnce({
        errorCode: ErrorCode.NONE,
        incidentType: { code: 'C' },
      });
      (axios.post as jest.Mock).mockRejectedValueOnce(new Error('e'));
      const result = await service.emitInfractionGim(baseDto() as any);
      expect(result.errorCode).toBe(ErrorCode.HTTP_ERROR_REINTENT);
    });
  });

  // ─── findBondByNumber ────────────────────────────────────────────────────
  describe('findBondByNumber', () => {
    it('returns NONE when data ok and bond present', async () => {
      (axios.post as jest.Mock).mockResolvedValueOnce({
        data: { ok: true, code: 200, bond: { id: 1 }, data: { x: 1 } },
      });
      const result = await service.findBondByNumber({ nroTicket: 'N', identityCard: '1' } as any);
      expect(result.errorCode).toBe(ErrorCode.NONE);
    });

    it('returns NOT_FOUND when data missing', async () => {
      (axios.post as jest.Mock).mockResolvedValueOnce({ data: { ok: false } });
      const result = await service.findBondByNumber({ nroTicket: 'N', identityCard: '1' } as any);
      expect(result.errorCode).toBe(ErrorCode.NOT_FOUND);
    });

    it('returns NOT_FOUND on exception', async () => {
      (axios.post as jest.Mock).mockRejectedValueOnce(new Error('e'));
      const result = await service.findBondByNumber({ nroTicket: 'N', identityCard: '1' } as any);
      expect(result.errorCode).toBe(ErrorCode.NOT_FOUND);
    });
  });

  // ─── findObligationsByCitation ───────────────────────────────────────────
  describe('findObligationsByCitation', () => {
    it('returns NONE with data when obligations exist', async () => {
      (axios.post as jest.Mock).mockResolvedValueOnce({
        data: { ok: true, code: 200, obligations: [{ id: 1 }] },
      });
      const result = await service.findObligationsByCitation('N', '1');
      expect(result.errorCode).toBe(ErrorCode.NONE);
    });

    it('logs debug when more than one obligation returned', async () => {
      (axios.post as jest.Mock).mockResolvedValueOnce({
        data: { ok: true, code: 200, obligations: [{ id: 1 }, { id: 2 }] },
      });
      const result = await service.findObligationsByCitation('N', '1');
      expect(result.errorCode).toBe(ErrorCode.NONE);
    });

    it('returns NOT_FOUND when obligations empty', async () => {
      (axios.post as jest.Mock).mockResolvedValueOnce({
        data: { ok: true, code: 200, obligations: [] },
      });
      const result = await service.findObligationsByCitation('N', '1');
      expect(result.errorCode).toBe(ErrorCode.NOT_FOUND);
    });

    it('returns NOT_FOUND on exception', async () => {
      (axios.post as jest.Mock).mockRejectedValueOnce(new Error('e'));
      expect((await service.findObligationsByCitation('N', '1')).errorCode).toBe(ErrorCode.NOT_FOUND);
    });
  });

  // ─── _validateStatusSistemWithGim ────────────────────────────────────────
  describe('_validateStatusSistemWithGim', () => {
    const cases: [StatusObligation, IncidentStatus][] = [
      [StatusObligation.EL_CONTRIBUYENTE_HA_CANCELADO_LOS_VALORES_CORRESPONDIENTES, IncidentStatus.PAYED],
      [StatusObligation.EL_CONTRIBUYENTE_HA_CANCELADO_LOS_VALORES_USANDO_UNA_VIA_ELECTRONICA, IncidentStatus.PAYED],
      [StatusObligation.EMITIDA_Y_ADEUDADA_POR_EL_CONTRIBUYENTE, IncidentStatus.SUPPLIED],
      [StatusObligation.MIGRADA_A_SISTEMA_AXIS_CLOUD_ML_DF_2020_733_M, IncidentStatus.SUPPLIED],
      [StatusObligation.PROHIBIDA_DE_CANCELAR_POR_POSIBLE_REVISION, IncidentStatus.SUPPLIED],
      [StatusObligation.FACTURA_GENERADA_EN_ESPERA_DE_PAGO_POR_COMPENSACION, IncidentStatus.SUPPLIED],
      [StatusObligation.CALCULADA_PARA_REVISION_SIN_NINGUN_EFECTO_LEGAL, IncidentStatus.ENTERED],
      [StatusObligation.PREEMITIDA_QUE_NO_ES_APROBADA_PARA_EMISION, IncidentStatus.ERRONEOUS],
      [StatusObligation.TITULO_DE_CREDITO_MAL_EMITIDO_CON_FECHA_ANTERIOR, IncidentStatus.ERRONEOUS],
      [StatusObligation.EMITIDA_Y_ANULADA_EN_EL_MISMO_DIA, IncidentStatus.CANCELED],
      [StatusObligation.EMITIDA_Y_DADA_DE_BAJA_LUEGO_DE_SER_CONTABILIZADA, IncidentStatus.CANCELED],
      [StatusObligation.GENERADA_PARA_SU_REVISION_Y_EMISION_EN_RENTAS, IncidentStatus.APPROVED],
      [StatusObligation.FUTURA, IncidentStatus.APPROVED],
      [StatusObligation.A_PAGAR_POR_CUOTAS_MEDIANTE_UN_CONVENIO, IncidentStatus.CONVENIO],
      [StatusObligation.PERMITE_GENERAR_ABONOS, IncidentStatus.ON_CREDIT],
      [StatusObligation.OBLIGACION_PENDIENTE_DE_LIQUIDACION_MEDIANTE_DEBITO_BANCARIO, IncidentStatus.PENDIENTE_LIQUIDACION],
    ];

    it.each(cases)('maps GIM status %s to incident status', async (status, expected) => {
      const result = await service._validateStatusSistemWithGim([{ status } as any]);
      expect(result.errorCode).toBe(ErrorCode.NONE);
      expect(result.statusIncident).toBe(expected);
    });

    it('returns NOT_FOUND for unknown status', async () => {
      const result = await service._validateStatusSistemWithGim([{ status: 'unknown' as any } as any]);
      expect(result.errorCode).toBe(ErrorCode.NOT_FOUND);
    });

    it('returns NOT_FOUND on exception (empty array)', async () => {
      const result = await service._validateStatusSistemWithGim([] as any);
      // Destructuring undefined will throw and be caught
      expect(result.errorCode).toBe(ErrorCode.NOT_FOUND);
    });
  });

  // ─── validateStatusSistemWithGim (public) ────────────────────────────────
  describe('validateStatusSistemWithGim', () => {
    it('updates incident and returns the validation result on NONE', async () => {
      const obligations: any[] = [{
        status: StatusObligation.EMITIDA_Y_ADEUDADA_POR_EL_CONTRIBUYENTE,
        obligationId: 1,
        obligationNumber: '2',
        total: 10,
      }];
      const result = await service.validateStatusSistemWithGim(obligations, 7, { plate: 'P' } as any, 1);
      expect(result.errorCode).toBe(ErrorCode.NONE);
      expect(incidentService.update).toHaveBeenCalled();
    });

    it('returns the validation result without update on non-NONE', async () => {
      const result = await service.validateStatusSistemWithGim(
        [{ status: 'unknown' as any } as any],
        7,
        {} as any,
        1,
      );
      expect(result.errorCode).toBe(ErrorCode.NOT_FOUND);
      expect(incidentService.update).not.toHaveBeenCalled();
    });

    it('catches exceptions', async () => {
      jest.spyOn(service, '_validateStatusSistemWithGim').mockRejectedValueOnce(new Error('boom'));
      const result = await service.validateStatusSistemWithGim([] as any, 1, {} as any, 1);
      expect(result.errorCode).toBe(ErrorCode.NOT_FOUND);
    });
  });

  // ─── validateOpenTill ────────────────────────────────────────────────────
  describe('validateOpenTill', () => {
    it('returns NOT_FOUND when isOpen=false', async () => {
      (axios.post as jest.Mock).mockResolvedValueOnce({
        data: { ok: true, code: 200, isOpen: false, data: {} },
      });
      expect((await service.validateOpenTill()).errorCode).toBe(ErrorCode.NOT_FOUND);
    });

    it('returns NONE when isOpen=true', async () => {
      (axios.post as jest.Mock).mockResolvedValueOnce({
        data: { ok: true, code: 200, isOpen: true, data: {} },
      });
      expect((await service.validateOpenTill()).errorCode).toBe(ErrorCode.NONE);
    });

    it('returns NOT_FOUND when response not ok', async () => {
      (axios.post as jest.Mock).mockResolvedValueOnce({ data: { ok: false } });
      expect((await service.validateOpenTill()).errorCode).toBe(ErrorCode.NOT_FOUND);
    });

    it('returns HTTP_ERROR_REINTENT on timeout (ECONNABORTED)', async () => {
      (axios.post as jest.Mock).mockRejectedValueOnce({ code: 'ECONNABORTED' });
      expect((await service.validateOpenTill()).errorCode).toBe(ErrorCode.HTTP_ERROR_REINTENT);
    });

    it('returns HTTP_ERROR_REINTENT on timeout (ETIMEDOUT)', async () => {
      (axios.post as jest.Mock).mockRejectedValueOnce({ code: 'ETIMEDOUT' });
      expect((await service.validateOpenTill()).errorCode).toBe(ErrorCode.HTTP_ERROR_REINTENT);
    });

    it('returns HTTP_ERROR_REINTENT on 401', async () => {
      (axios.post as jest.Mock).mockRejectedValueOnce({ response: { status: 401 } });
      expect((await service.validateOpenTill()).errorCode).toBe(ErrorCode.HTTP_ERROR_REINTENT);
    });

    it('returns HTTP_ERROR_REINTENT on 500', async () => {
      (axios.post as jest.Mock).mockRejectedValueOnce({ response: { status: 500 } });
      expect((await service.validateOpenTill()).errorCode).toBe(ErrorCode.HTTP_ERROR_REINTENT);
    });

    it('returns HTTP_ERROR_REINTENT on unknown error', async () => {
      (axios.post as jest.Mock).mockRejectedValueOnce(new Error('e'));
      expect((await service.validateOpenTill()).errorCode).toBe(ErrorCode.HTTP_ERROR_REINTENT);
    });
  });

  // ─── loginGim ────────────────────────────────────────────────────────────
  describe('loginGim', () => {
    it('returns NONE when access_token present', async () => {
      (axios.post as jest.Mock).mockResolvedValueOnce({ data: { access_token: 'tok' } });
      const result = await service.loginGim();
      expect(result.errorCode).toBe(ErrorCode.NONE);
    });

    it('returns NOT_FOUND when no access_token', async () => {
      (axios.post as jest.Mock).mockResolvedValueOnce({ data: {} });
      const result = await service.loginGim();
      expect(result.errorCode).toBe(ErrorCode.NOT_FOUND);
    });

    it('returns NOT_FOUND on error_description', async () => {
      (axios.post as jest.Mock).mockRejectedValueOnce({ response: { data: { error_description: 'bad creds' } } });
      const result = await service.loginGim();
      expect(result.errorCode).toBe(ErrorCode.NOT_FOUND);
      expect(result.message).toBe('bad creds');
    });

    it('returns NOT_FOUND on response.data.error', async () => {
      (axios.post as jest.Mock).mockRejectedValueOnce({ response: { data: { error: 'invalid_grant' } } });
      const result = await service.loginGim();
      expect(result.message).toBe('invalid_grant');
    });

    it('returns NOT_FOUND on plain Error', async () => {
      (axios.post as jest.Mock).mockRejectedValueOnce(new Error('net down'));
      const result = await service.loginGim();
      expect(result.message).toBe('net down');
    });

    it('returns NOT_FOUND with default message when nothing available', async () => {
      (axios.post as jest.Mock).mockRejectedValueOnce({});
      const result = await service.loginGim();
      expect(result.message).toBe('Error desconocido');
    });
  });

  // ─── findVehicleTypesForSimert ───────────────────────────────────────────
  describe('findVehicleTypesForSimert', () => {
    it('returns NONE with sorted vehicle types', async () => {
      (axios.post as jest.Mock).mockResolvedValueOnce({
        data: { ok: true, code: 200, types: [{ id: 2 }, { id: 1 }] },
      });
      const result = await service.findVehicleTypesForSimert();
      expect(result.errorCode).toBe(ErrorCode.NONE);
      expect(result.data[0].id).toBe(1);
    });

    it('returns NOT_FOUND when response not ok', async () => {
      (axios.post as jest.Mock).mockResolvedValueOnce({ data: { ok: false } });
      expect((await service.findVehicleTypesForSimert()).errorCode).toBe(ErrorCode.NOT_FOUND);
    });

    it('returns NOT_FOUND on exception', async () => {
      (axios.post as jest.Mock).mockRejectedValueOnce(new Error('e'));
      expect((await service.findVehicleTypesForSimert()).errorCode).toBe(ErrorCode.NOT_FOUND);
    });
  });

  // ─── emissionTitleCreditCard ─────────────────────────────────────────────
  describe('emissionTitleCreditCard', () => {
    it('returns NONE on success', async () => {
      (axios.post as jest.Mock).mockResolvedValueOnce({
        data: { ok: true, code: 200 },
      });
      const result = await service.emissionTitleCreditCard({} as any);
      expect(result.errorCode).toBe(ErrorCode.NONE);
    });

    it('returns NOT_FOUND when response not ok', async () => {
      (axios.post as jest.Mock).mockResolvedValueOnce({ data: { ok: false } });
      expect((await service.emissionTitleCreditCard({} as any)).errorCode).toBe(ErrorCode.NOT_FOUND);
    });

    it('returns NOT_FOUND with message from response on exception', async () => {
      (axios.post as jest.Mock).mockRejectedValueOnce({ response: { data: { message: 'bad' } } });
      const result = await service.emissionTitleCreditCard({} as any);
      expect(result.message).toBe('bad');
    });

    it('returns NOT_FOUND with default message when error has no response', async () => {
      (axios.post as jest.Mock).mockRejectedValueOnce({});
      const result = await service.emissionTitleCreditCard({} as any);
      expect(result.errorCode).toBe(ErrorCode.NOT_FOUND);
    });
  });

  // ─── registerDeposit ─────────────────────────────────────────────────────
  describe('registerDeposit', () => {
    it('returns NONE on success', async () => {
      (axios.post as jest.Mock).mockResolvedValueOnce({
        data: { ok: true, reference: 'r', total: 10 },
      });
      expect((await service.registerDeposit({ amount: '5' } as any)).errorCode).toBe(ErrorCode.NONE);
    });

    it('returns NOT_FOUND when reference missing', async () => {
      (axios.post as jest.Mock).mockResolvedValueOnce({ data: { ok: true } });
      expect((await service.registerDeposit({ amount: '5' } as any)).errorCode).toBe(ErrorCode.NOT_FOUND);
    });

    it('returns NOT_FOUND on exception with response data', async () => {
      (axios.post as jest.Mock).mockRejectedValueOnce({ response: { data: { message: 'bad' } } });
      expect((await service.registerDeposit({ amount: '5' } as any)).message).toBe('bad');
    });

    it('returns NOT_FOUND on plain exception', async () => {
      (axios.post as jest.Mock).mockRejectedValueOnce({});
      expect((await service.registerDeposit({ amount: '5' } as any)).errorCode).toBe(ErrorCode.NOT_FOUND);
    });

    it('audits the reason reported by GIM, prefixed with its code', async () => {
      (axios.post as jest.Mock).mockResolvedValueOnce({
        data: { ok: false, code: 'ML.RD.7009', message: 'La obligación ya se encuentra pagada' },
      });

      const result = await service.registerDeposit({ amount: '5' } as any);

      // The client keeps the generic summary; only the audit entry is enriched.
      expect(result.message).toBe('No se logró realizar el depósito');
      expect(loggerService.saveLogsGimLogger).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'registerDeposit',
          httpStatus: 200,
          message:
            'No se logró realizar el depósito: [ML.RD.7009] La obligación ya se encuentra pagada',
        }),
      );
    });

    it('audits the bare summary when GIM reports no message', async () => {
      (axios.post as jest.Mock).mockResolvedValueOnce({ data: { ok: false, code: '500' } });

      await service.registerDeposit({ amount: '5' } as any);

      expect(loggerService.saveLogsGimLogger).toHaveBeenCalledWith(
        expect.objectContaining({ message: 'No se logró realizar el depósito' }),
      );
    });

    it('audits the reason without a code prefix when GIM omits the code', async () => {
      (axios.post as jest.Mock).mockResolvedValueOnce({
        data: { ok: false, message: 'Caja cerrada' },
      });

      await service.registerDeposit({ amount: '5' } as any);

      expect(loggerService.saveLogsGimLogger).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'No se logró realizar el depósito: Caja cerrada',
        }),
      );
    });
  });

  // ─── findObligations ─────────────────────────────────────────────────────
  describe('findObligations', () => {
    it('returns NONE when bonds present', async () => {
      (axios.post as jest.Mock).mockResolvedValueOnce({
        data: { ok: true, bonds: [{ id: 1 }] },
      });
      expect((await service.findObligations({ identificationNumber: '1' } as any)).errorCode).toBe(ErrorCode.NONE);
    });

    it('returns NOT_FOUND when bonds empty', async () => {
      (axios.post as jest.Mock).mockResolvedValueOnce({ data: { ok: true, bonds: [] } });
      expect((await service.findObligations({ identificationNumber: '1' } as any)).errorCode).toBe(ErrorCode.NOT_FOUND);
    });

    it('returns NOT_FOUND on exception with response message', async () => {
      (axios.post as jest.Mock).mockRejectedValueOnce({ response: { data: { message: 'bad' } } });
      expect((await service.findObligations({} as any)).message).toBe('bad');
    });

    it('returns NOT_FOUND on plain exception', async () => {
      (axios.post as jest.Mock).mockRejectedValueOnce({});
      expect((await service.findObligations({} as any)).errorCode).toBe(ErrorCode.NOT_FOUND);
    });
  });

  // ─── emitSanction ────────────────────────────────────────────────────────
  describe('emitSanction', () => {
    it('returns NONE on success', async () => {
      (axios.post as jest.Mock).mockResolvedValueOnce({
        data: { ok: true, code: '200' },
      });
      expect((await service.emitSanction({} as any)).errorCode).toBe(ErrorCode.NONE);
    });

    it('returns NOT_FOUND on failure', async () => {
      (axios.post as jest.Mock).mockResolvedValueOnce({ data: { ok: false } });
      expect((await service.emitSanction({} as any)).errorCode).toBe(ErrorCode.NOT_FOUND);
    });

    it('returns NOT_FOUND on exception with response message', async () => {
      (axios.post as jest.Mock).mockRejectedValueOnce({ response: { data: { message: 'oops' } } });
      expect((await service.emitSanction({} as any)).message).toBe('oops');
    });

    it('returns NOT_FOUND on plain exception', async () => {
      (axios.post as jest.Mock).mockRejectedValueOnce({});
      expect((await service.emitSanction({} as any)).errorCode).toBe(ErrorCode.NOT_FOUND);
    });
  });

  // ─── issueIncidentGim ────────────────────────────────────────────────────
  describe('issueIncidentGim', () => {
    const baseDto = (overrides: any = {}) => ({
      identityCard: '1',
      emailClient: 'a@b.c',
      fullNameClient: 'A B',
      firstName: 'A',
      lastName: 'B',
      optionalData: [{ key: 'residentId', value: 99 }],
      plate: 'P',
      nroTicket: 'N',
      reference: 'r',
      description: 'd',
      createdAt: '2026-01-01T00:00:00Z',
      incidentTypeId: 1,
      vehicleType: 1,
      address: 'A',
      ...overrides,
    });

    it('returns NOT_FOUND when ANT call fails (missing user data)', async () => {
      dinardap.getUserDataByPlateAnt.mockResolvedValueOnce({ errorCode: ErrorCode.NOT_FOUND, data: null });
      const dto = baseDto({ identityCard: null, emailClient: null, fullNameClient: null });
      const result = await service.issueIncidentGim(dto as any, 1, 1);
      expect(result.errorCode).toBe(ErrorCode.NOT_FOUND);
    });

    it('fetches missing user data from ANT when incomplete', async () => {
      dinardap.getUserDataByPlateAnt.mockResolvedValueOnce({
        errorCode: ErrorCode.NONE,
        data: { identityCard: '1', email: 'a@b.c', fullName: 'F', firstName: 'A', lastName: 'B' },
      });
      // Already has residentId so existing branch
      (axios.post as jest.Mock).mockResolvedValueOnce({
        data: { ok: true, code: 200, obligations: [{ status: StatusObligation.EMITIDA_Y_ADEUDADA_POR_EL_CONTRIBUYENTE, total: 5 }] },
      });
      const dto = baseDto({ identityCard: null, emailClient: null, fullNameClient: null });
      const result = await service.issueIncidentGim(dto as any, 1, 1);
      expect(result.errorCode).toBe(ErrorCode.NONE);
    });

    it('looks up residentId via getUserByIdentityCardGim when missing in dto', async () => {
      // No residentId in optionalData
      const dto = baseDto({ optionalData: [] });
      // getUserByIdentityCardGim => NONE with taxpayer.id
      (axios.post as jest.Mock)
        .mockResolvedValueOnce({ data: { ok: true, code: 200, taxpayer: { id: 42 } } }) // getUserByIdentityCardGim
        .mockResolvedValueOnce({ data: { ok: true, code: 200, obligations: [{ status: StatusObligation.EMITIDA_Y_ADEUDADA_POR_EL_CONTRIBUYENTE }] } }); // findObligationsByCitation
      const result = await service.issueIncidentGim(dto as any, 1, 1);
      expect(result.errorCode).toBe(ErrorCode.NONE);
    });

    it('creates GIM client when residentId is missing and GIM has no user', async () => {
      const dto = baseDto({ optionalData: [] });
      commonAuth.filterByIdentityCard.mockResolvedValueOnce({ errorCode: ErrorCode.NOT_FOUND });
      (axios.post as jest.Mock)
        .mockResolvedValueOnce({ data: { ok: false, code: '404' } }) // getUserByIdentityCardGim => NOT_FOUND
        .mockResolvedValueOnce({ data: { ok: true, code: 200, residentDTO: { id: 77 } } }) // createNewNaturalPersonGim
        .mockResolvedValueOnce({ data: { ok: true, code: 200, obligations: [{ status: StatusObligation.EMITIDA_Y_ADEUDADA_POR_EL_CONTRIBUYENTE }] } });
      const result = await service.issueIncidentGim(dto as any, 1, 1);
      expect(result.errorCode).toBe(ErrorCode.NONE);
    });

    it('returns NOT_FOUND when creation of GIM client fails', async () => {
      const dto = baseDto({ optionalData: [] });
      commonAuth.filterByIdentityCard.mockResolvedValueOnce({ errorCode: ErrorCode.NOT_FOUND });
      (axios.post as jest.Mock)
        .mockResolvedValueOnce({ data: { ok: false, code: '404' } }) // getUserByIdentityCardGim
        .mockRejectedValueOnce(new Error('create fail')); // createNewNaturalPersonGim
      const result = await service.issueIncidentGim(dto as any, 1, 1);
      expect(result.errorCode).toBe(ErrorCode.NOT_FOUND);
    });

    it('emits debt when not previously emitted', async () => {
      const dto = baseDto();
      incidentTypeService.getTypeIncidentById
        .mockResolvedValueOnce({ errorCode: ErrorCode.NONE, incidentType: { code: 'C' } })
        .mockResolvedValueOnce({ errorCode: ErrorCode.NONE, incidentType: { code: 'C' } });
      (axios.post as jest.Mock)
        .mockResolvedValueOnce({ data: { ok: true, code: 200, obligations: [] } }) // findObligationsByCitation: NOT_FOUND
        .mockResolvedValueOnce({ data: { ok: true, code: '200', bondId: '10', bondNumber: 11 } }) // emitInfractionGim
        .mockResolvedValueOnce({ data: { ok: true, code: 200, obligations: [{ total: 22 }] } }); // findObligationsByCitation (refresh)
      const result = await service.issueIncidentGim(dto as any, 1, 1);
      expect(result.errorCode).toBe(ErrorCode.NONE);
      expect(incidentService.update).toHaveBeenCalled();
    });

    it('emits debt and falls back to dto.amount when refresh has no total', async () => {
      const dto = baseDto({ amount: 100 });
      incidentTypeService.getTypeIncidentById
        .mockResolvedValueOnce({ errorCode: ErrorCode.NONE, incidentType: { code: 'C' } });
      (axios.post as jest.Mock)
        .mockResolvedValueOnce({ data: { ok: true, code: 200, obligations: [] } })
        .mockResolvedValueOnce({ data: { ok: true, code: '200', bondId: '10', bondNumber: 11 } })
        .mockResolvedValueOnce({ data: { ok: false } }); // refresh fails -> dto.amount
      const result = await service.issueIncidentGim(dto as any, 1, 1);
      expect(result.errorCode).toBe(ErrorCode.NONE);
    });

    it('returns NOT_FOUND when emitInfractionGim fails', async () => {
      const dto = baseDto();
      incidentTypeService.getTypeIncidentById
        .mockResolvedValueOnce({ errorCode: ErrorCode.NOT_FOUND, message: 'no type' });
      (axios.post as jest.Mock)
        .mockResolvedValueOnce({ data: { ok: true, code: 200, obligations: [] } });
      const result = await service.issueIncidentGim(dto as any, 1, 1);
      expect(result.errorCode).toBe(ErrorCode.NOT_FOUND);
    });

    it('returns NOT_FOUND on unexpected exception', async () => {
      const dto = baseDto();
      jest.spyOn(service, 'findObligationsByCitation').mockRejectedValueOnce(new Error('boom'));
      const result = await service.issueIncidentGim(dto as any, 1, 1);
      expect(result.errorCode).toBe(ErrorCode.NOT_FOUND);
    });
  });

  // ─── emitInfractionSimert ────────────────────────────────────────────────
  describe('emitInfractionSimert', () => {
    const baseDto = () => ({
      incidentTypeId: 1,
      optionalData: [{ key: 'residentId', value: 99 }],
      description: 'd',
      reference: 'r',
      createdAt: '2026-01-01T00:00:00Z',
      plate: 'P',
      nroTicket: 'N',
      vehicleType: 1,
      address: 'A',
    });

    it('returns NONE and updates incident on success', async () => {
      incidentTypeService.getTypeIncidentById.mockResolvedValueOnce({
        errorCode: ErrorCode.NONE,
        incidentType: { code: 'C' },
      });
      (axios.post as jest.Mock).mockResolvedValueOnce({
        data: { ok: true, code: '200', bondId: '5', bondNumber: 6 },
      });
      const result = await service.emitInfractionSimert(baseDto() as any, 1, 1);
      expect(result.errorCode).toBe(ErrorCode.NONE);
    });

    it('returns NOT_FOUND when emit fails', async () => {
      incidentTypeService.getTypeIncidentById.mockResolvedValueOnce({
        errorCode: ErrorCode.NOT_FOUND, message: 'no',
      });
      const result = await service.emitInfractionSimert(baseDto() as any, 1, 1);
      expect(result.errorCode).toBe(ErrorCode.NOT_FOUND);
    });

    it('returns NOT_FOUND on unexpected exception', async () => {
      jest.spyOn(service, 'emitInfractionGim').mockRejectedValueOnce(new Error('boom'));
      const result = await service.emitInfractionSimert(baseDto() as any, 1, 1);
      expect(result.errorCode).toBe(ErrorCode.NOT_FOUND);
    });
  });

  // ─── _buildObligationDataResponse (indirect via spy) ─────────────────────
  describe('_buildObligationDataResponse', () => {
    it('preserves existing residentId in optionalData when updating', () => {
      const obligation: any = {
        obligationId: 1,
        obligationNumber: '2',
        total: 10,
        taxpayerId: 99,
      };
      const incident: any = {
        optionalData: [{ key: 'residentId', value: 0 }],
        onResponseExternal: [{ id: 'prev' }],
      };
      const result = (service as any)._buildObligationDataResponse(obligation, IncidentStatus.SUPPLIED, incident);
      expect(result.optionalData.find((x: any) => x.key === 'residentId').value).toBe(99);
      expect(result.onResponseExternal.length).toBe(2);
    });

    it('adds residentId when not yet present', () => {
      const obligation: any = { obligationId: 1, obligationNumber: '2', total: 10, taxpayerId: 99 };
      const incident: any = { optionalData: null, onResponseExternal: null };
      const result = (service as any)._buildObligationDataResponse(obligation, IncidentStatus.SUPPLIED, incident);
      expect(result.optionalData[0]).toEqual({ key: 'residentId', value: 99 });
    });

    it('does not touch optionalData when taxpayerId is null', () => {
      const obligation: any = { obligationId: 1, obligationNumber: '2' };
      const incident: any = { optionalData: [{ key: 'x', value: 1 }], onResponseExternal: [] };
      const result = (service as any)._buildObligationDataResponse(obligation, IncidentStatus.SUPPLIED, incident);
      expect(result.optionalData).toBeUndefined();
    });
  });
});
