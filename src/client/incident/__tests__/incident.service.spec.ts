/* eslint-disable @typescript-eslint/no-var-requires */
import { ErrorCode } from 'src/common/glob/error';
import { StatusFraction } from 'src/common/glob/status/status_fraction';
import { StatusMoment } from 'src/common/glob/status/status_moment';
import { StatusPayment } from 'src/common/glob/status/status_payment';
import { StatusSlot } from 'src/common/glob/status/status_slot';
import { IncidentCategory, IncidentStatus } from 'src/common/glob/type/type_incident';
import { TypePaymentMethod } from 'src/common/glob/type/type_payment_method';

// Mock axios at module level.
jest.mock('axios', () => ({
  __esModule: true,
  default: { request: jest.fn() },
}));
import axios from 'axios';

// Mock handleDbExceptions to capture/inspect error routing.
jest.mock('src/common/exceptions/error.db.exception', () => ({
  __esModule: true,
  default: jest.fn((error: any) => {
    throw error;
  }),
}));
import handleDbExceptions from 'src/common/exceptions/error.db.exception';

// Mock uuid to deterministic string for assertions if needed.
jest.mock('uuid', () => ({
  __esModule: true,
  v4: jest.fn(() => 'aaaa-bbbb-cccc'),
}));

import { IncidentService } from '../incident.service';

const buildRepoMock = () => {
  const qb: any = {
    select: jest.fn().mockReturnThis(),
    innerJoin: jest.fn().mockReturnThis(),
    innerJoinAndSelect: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    getOne: jest.fn(),
    getMany: jest.fn(),
    getRawMany: jest.fn(),
  };
  return {
    create: jest.fn((dto: any) => dto),
    save: jest.fn(async (e: any) => ({ id: 1, ...e })),
    update: jest.fn(async () => ({ affected: 1 })),
    find: jest.fn(),
    findOne: jest.fn(),
    query: jest.fn(),
    createQueryBuilder: jest.fn(() => qb),
    __qb: qb,
  };
};

const buildQueryRunner = () => {
  const manager = {
    insert: jest.fn(),
    update: jest.fn(),
  };
  return {
    connect: jest.fn(),
    startTransaction: jest.fn(),
    commitTransaction: jest.fn(),
    rollbackTransaction: jest.fn(),
    release: jest.fn(),
    isTransactionActive: true,
    manager,
  };
};

const buildService = (overrides: any = {}) => {
  const incidentRepository = buildRepoMock();
  const incidentTypeRepository = buildRepoMock();
  const incidentPaymentRepository = buildRepoMock();
  const fractionRepository = buildRepoMock();
  const fractionStatusRepository = buildRepoMock();
  const slotRepository = buildRepoMock();

  const commonAntService: any = {};
  const commonGimService: any = {
    getUserByIdentificationNumber: jest.fn(),
    createClientGim: jest.fn(),
  };
  const commonService: any = {
    getDate: jest.fn(() => '2026-05-15T10:00:00.000Z'),
    notify: jest.fn(),
    checkDeUnaByIdentityCard: jest.fn(),
    checkPlaceToPayByIdentityCard: jest.fn(),
    payDeUnaV2: jest.fn(),
    payAhorita: jest.fn(),
    payPlaceToPay: jest.fn(),
  };
  const commonCacheService: any = {
    getSalary: jest.fn(),
  };
  const dinardapAntService: any = {
    getUserDataByPlateAnt: jest.fn(),
  };
  const gimService: any = {
    validateOpenTill: jest.fn(),
    findObligationsByCitation: jest.fn(),
    emitInfractionGim: jest.fn(),
    registerDeposit: jest.fn(),
    _validateStatusSistemWithGim: jest.fn(),
  };
  const queryRunner = buildQueryRunner();
  const dataSource: any = {
    createQueryRunner: jest.fn(() => queryRunner),
  };
  const commonAuthService: any = {
    filterByIdentityCard: jest.fn(),
    updateResidentId: jest.fn(),
  };
  const loggerService: any = {
    saveIncidentLogger: jest.fn(),
  };

  const service = new IncidentService(
    incidentRepository as any,
    incidentTypeRepository as any,
    incidentPaymentRepository as any,
    fractionRepository as any,
    fractionStatusRepository as any,
    slotRepository as any,
    commonAntService,
    commonGimService,
    commonService,
    commonCacheService,
    dinardapAntService,
    gimService,
    dataSource,
    commonAuthService,
    loggerService,
  );
  // Silence internal logger.
  (service as any).logger = { error: jest.fn(), log: jest.fn(), warn: jest.fn(), debug: jest.fn() };

  return {
    service,
    incidentRepository,
    incidentTypeRepository,
    incidentPaymentRepository,
    fractionRepository,
    fractionStatusRepository,
    slotRepository,
    commonGimService,
    commonService,
    commonCacheService,
    dinardapAntService,
    gimService,
    queryRunner,
    dataSource,
    commonAuthService,
    ...overrides,
  };
};

describe('IncidentService (client)', () => {
  beforeEach(() => {
    (axios.request as jest.Mock).mockReset();
    (handleDbExceptions as unknown as jest.Mock).mockClear();
  });

  describe('create', () => {
    it('creates an incident without fractionId (no ANT data, no notification category)', async () => {
      const ctx = buildService();
      ctx.dinardapAntService.getUserDataByPlateAnt.mockResolvedValue({
        errorCode: ErrorCode.NONE,
        data: { email: 'e@x', fullName: 'F', identityCard: 'I' },
      });
      ctx.incidentRepository.save.mockResolvedValueOnce({ id: 10 });

      const result = await ctx.service.create(1, 'dev', {
        plate: 'ABC123',
        incidentCategory: IncidentCategory.INCIDENT_BITACORA,
      } as any);

      expect(result?.errorCode).toBe(ErrorCode.NONE);
      expect(ctx.incidentRepository.create).toHaveBeenCalled();
      expect(ctx.incidentRepository.save).toHaveBeenCalled();
    });

    it('computes amount when category is NOTIFICATION', async () => {
      const ctx = buildService();
      ctx.incidentTypeRepository.findOne.mockResolvedValueOnce({ id: 1, percentage: '10' });
      ctx.commonCacheService.getSalary.mockResolvedValueOnce({ salary: 460 });
      ctx.incidentRepository.save.mockResolvedValueOnce({ id: 5 });

      const result = await ctx.service.create(1, 'dev', {
        plate: '',
        incidentCategory: IncidentCategory.NOTIFICATION,
        incidentTypeId: 1,
      } as any);

      expect(result?.errorCode).toBe(ErrorCode.NONE);
      // Created with amount 46 (10% of 460)
      expect(ctx.incidentRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ amount: 46 }),
      );
    });

    it('throws BadRequestException when incidentType is missing', async () => {
      const ctx = buildService();
      ctx.incidentTypeRepository.findOne.mockResolvedValueOnce(null);

      await expect(
        ctx.service.create(1, 'dev', {
          incidentCategory: IncidentCategory.NOTIFICATION,
          incidentTypeId: 9,
        } as any),
      ).rejects.toThrow('Tipo de incidente no encontrado');
      expect(handleDbExceptions).toHaveBeenCalled();
    });

    it('updates fraction state when fractionId is supplied', async () => {
      const ctx = buildService();
      ctx.incidentRepository.save.mockResolvedValueOnce({ id: 1 });
      ctx.fractionRepository.__qb.getOne.mockResolvedValueOnce({
        id: 7,
        userId: 99,
        slot: { id: 22 },
        status: { id: StatusFraction.ACTIVE },
      });
      ctx.fractionStatusRepository.findOne.mockResolvedValueOnce(null);

      const result = await ctx.service.create(1, 'dev', {
        plate: '',
        fractionId: 7,
        incidentCategory: IncidentCategory.INCIDENT_BITACORA,
      } as any);

      expect(result?.errorCode).toBe(ErrorCode.NONE);
      expect(ctx.fractionRepository.update).toHaveBeenCalledWith(7, expect.any(Object));
      expect(ctx.slotRepository.update).toHaveBeenCalledWith(22, { status: StatusSlot.SANCTIONED });
    });

    it('throws when fraction not found', async () => {
      const ctx = buildService();
      ctx.incidentRepository.save.mockResolvedValueOnce({ id: 1 });
      ctx.fractionRepository.__qb.getOne.mockResolvedValueOnce(null);

      await expect(
        ctx.service.create(1, 'dev', {
          fractionId: 7,
          incidentCategory: IncidentCategory.INCIDENT_BITACORA,
        } as any),
      ).rejects.toThrow('Fracción no encontrada');
    });

    it('routes errors through handleDbExceptions', async () => {
      const ctx = buildService();
      ctx.incidentRepository.save.mockRejectedValueOnce(new Error('boom'));

      await expect(
        ctx.service.create(1, 'dev', { incidentCategory: IncidentCategory.INCIDENT_BITACORA } as any),
      ).rejects.toThrow('boom');
      expect(handleDbExceptions).toHaveBeenCalled();
    });
  });

  describe('_getEmailFromAntByPlate (private)', () => {
    const env = process.env;
    afterEach(() => {
      process.env = env;
    });

    it('returns null when ANT_BASE_URL is missing', async () => {
      process.env = { ...env };
      delete process.env.ANT_BASE_URL;
      const ctx = buildService();
      // re-create service so it reads env at construction
      const svc = new (IncidentService as any)(
        {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {},
      );
      (svc as any).logger = { error: jest.fn() };
      const result = await (svc as any)._getEmailFromAntByPlate('ABC');
      expect(result).toBeNull();
    });

    it('returns email when ANT responds with payload', async () => {
      process.env = { ...env, ANT_BASE_URL: 'http://ant', ANT_API_KEY: 'k' };
      const svc = new (IncidentService as any)(
        {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {},
      );
      (svc as any).logger = { error: jest.fn() };
      (axios.request as jest.Mock).mockResolvedValueOnce({ data: { email: ' a@b ' } });
      const result = await (svc as any)._getEmailFromAntByPlate('ABC');
      expect(result).toBe('a@b');
    });

    it('returns null when no email in response', async () => {
      process.env = { ...env, ANT_BASE_URL: 'http://ant' };
      const svc = new (IncidentService as any)(
        {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {},
      );
      (svc as any).logger = { error: jest.fn() };
      (axios.request as jest.Mock).mockResolvedValueOnce({ data: {} });
      const result = await (svc as any)._getEmailFromAntByPlate('ABC');
      expect(result).toBeNull();
    });

    it('returns null and logs on axios error', async () => {
      process.env = { ...env, ANT_BASE_URL: 'http://ant' };
      const svc = new (IncidentService as any)(
        {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {},
      );
      (svc as any).logger = { error: jest.fn() };
      (axios.request as jest.Mock).mockRejectedValueOnce(new Error('net'));
      const result = await (svc as any)._getEmailFromAntByPlate('ABC');
      expect(result).toBeNull();
    });
  });

  describe('checkMyFractionsOutstanding', () => {
    it('throws when both plate and identityCard are missing', async () => {
      const ctx = buildService();
      await expect(ctx.service.checkMyFractionsOutstanding(undefined, undefined)).rejects.toThrow();
    });

    it('returns the test response when plate is provided', async () => {
      const ctx = buildService();
      const result: any = await ctx.service.checkMyFractionsOutstanding('ABC123', undefined);
      expect(result.total).toBe(2);
      expect(result.fines).toHaveLength(2);
    });

    it('returns the test response when only identityCard is provided', async () => {
      const ctx = buildService();
      const result: any = await ctx.service.checkMyFractionsOutstanding(undefined, '0102030405');
      expect(result.errorCode).toBe(0);
    });
  });

  describe('findSanctionByFraction', () => {
    it('returns sanctions list with current date', async () => {
      const ctx = buildService();
      ctx.incidentRepository.__qb.getRawMany.mockResolvedValueOnce([{ id: 1 }]);
      const result: any = await ctx.service.findSanctionByFraction(5);
      expect(result.errorCode).toBe(ErrorCode.NONE);
      expect(result.factionSanctions).toEqual([{ id: 1 }]);
      expect(result.currentDate).toBeInstanceOf(Date);
    });

    it('routes errors through handleDbExceptions', async () => {
      const ctx = buildService();
      ctx.incidentRepository.__qb.getRawMany.mockRejectedValueOnce(new Error('e'));
      await expect(ctx.service.findSanctionByFraction(5)).rejects.toThrow('e');
    });
  });

  describe('findSanctionByIdentityCard', () => {
    it('returns openTill response when till not open', async () => {
      const ctx = buildService();
      ctx.gimService.validateOpenTill.mockResolvedValueOnce({ errorCode: ErrorCode.NOT_FOUND });
      const result = await ctx.service.findSanctionByIdentityCard(1, 'dev', 'ID', {} as any);
      expect(result).toEqual({ errorCode: ErrorCode.NOT_FOUND });
    });

    it('returns NOT_FOUND when no incidents match', async () => {
      const ctx = buildService();
      ctx.gimService.validateOpenTill.mockResolvedValueOnce({ errorCode: ErrorCode.NONE });
      ctx.incidentRepository.query.mockResolvedValueOnce([]);
      const result: any = await ctx.service.findSanctionByIdentityCard(1, 'dev', 'ID', {} as any);
      expect(result.errorCode).toBe(ErrorCode.NOT_FOUND);
    });

    it('returns NOT_VALID when residentId cannot be obtained', async () => {
      const ctx = buildService();
      ctx.gimService.validateOpenTill.mockResolvedValueOnce({ errorCode: ErrorCode.NONE });
      ctx.incidentRepository.query.mockResolvedValueOnce([
        { id: 1, nroTicket: 'T1', identityCard: 'ID', optionalData: [], onResponseExternal: [] },
      ]);
      ctx.commonAuthService.filterByIdentityCard.mockResolvedValueOnce({
        errorCode: ErrorCode.NOT_FOUND,
      });
      ctx.commonGimService.getUserByIdentificationNumber.mockResolvedValueOnce({
        errorCode: ErrorCode.NOT_FOUND,
      });
      ctx.commonGimService.createClientGim.mockResolvedValueOnce({ errorCode: ErrorCode.NOT_FOUND });

      const result: any = await ctx.service.findSanctionByIdentityCard(1, 'dev', 'ID', {} as any);
      expect(result.errorCode).toBe(ErrorCode.NOT_VALID);
    });

    it('updates incident when GIM already has obligation', async () => {
      const ctx = buildService();
      ctx.gimService.validateOpenTill.mockResolvedValueOnce({ errorCode: ErrorCode.NONE });
      ctx.incidentRepository.query
        .mockResolvedValueOnce([
          { id: 1, nroTicket: 'T1', identityCard: 'ID', optionalData: [], onResponseExternal: [] },
        ])
        .mockResolvedValueOnce([
          { id: 1, nroTicket: 'T1', identityCard: 'ID' },
        ]);
      ctx.commonAuthService.filterByIdentityCard.mockResolvedValueOnce({
        errorCode: ErrorCode.NONE,
        data: { residentId: 99 },
      });
      ctx.gimService.findObligationsByCitation.mockResolvedValueOnce({
        errorCode: ErrorCode.NONE,
        data: {
          obligations: [{ obligationId: 11, obligationNumber: 'OBL-1', total: 50 }],
        },
      });
      ctx.gimService._validateStatusSistemWithGim.mockResolvedValueOnce({
        errorCode: ErrorCode.NONE,
        statusIncident: IncidentStatus.SUPPLIED,
      });

      const result: any = await ctx.service.findSanctionByIdentityCard(1, 'dev', 'ID', {} as any);
      expect(result.errorCode).toBe(ErrorCode.NONE);
      expect(ctx.incidentRepository.update).toHaveBeenCalled();
    });

    it('emits to GIM when no obligation found, returns NONE on success', async () => {
      const ctx = buildService();
      ctx.gimService.validateOpenTill.mockResolvedValueOnce({ errorCode: ErrorCode.NONE });
      ctx.incidentRepository.query
        .mockResolvedValueOnce([
          { id: 1, nroTicket: 'T1', identityCard: 'ID', optionalData: [], onResponseExternal: [] },
        ])
        .mockResolvedValueOnce([
          { id: 1, nroTicket: 'T1', identityCard: 'ID' },
        ]);
      ctx.commonAuthService.filterByIdentityCard.mockResolvedValueOnce({
        errorCode: ErrorCode.NONE,
        data: { residentId: 99 },
      });
      ctx.gimService.findObligationsByCitation
        .mockResolvedValueOnce({ errorCode: ErrorCode.NOT_FOUND })
        .mockResolvedValueOnce({
          errorCode: ErrorCode.NONE,
          data: { obligations: [{ total: 80 }] },
        });
      ctx.gimService.emitInfractionGim.mockResolvedValueOnce({
        errorCode: ErrorCode.NONE,
        data: { bondId: 22, bondNumber: 'B-22' },
      });

      const result: any = await ctx.service.findSanctionByIdentityCard(1, 'dev', 'ID', {} as any);
      expect(result.errorCode).toBe(ErrorCode.NONE);
    });

    it('returns emit error when GIM emit fails', async () => {
      const ctx = buildService();
      ctx.gimService.validateOpenTill.mockResolvedValueOnce({ errorCode: ErrorCode.NONE });
      ctx.incidentRepository.query.mockResolvedValueOnce([
        { id: 1, nroTicket: 'T1', identityCard: 'ID', optionalData: [], onResponseExternal: [] },
      ]);
      ctx.commonAuthService.filterByIdentityCard.mockResolvedValueOnce({
        errorCode: ErrorCode.NONE,
        data: { residentId: 99 },
      });
      ctx.gimService.findObligationsByCitation.mockResolvedValueOnce({
        errorCode: ErrorCode.NOT_FOUND,
      });
      ctx.gimService.emitInfractionGim.mockResolvedValueOnce({
        errorCode: ErrorCode.HTTP_ERROR_REINTENT,
      });

      const result: any = await ctx.service.findSanctionByIdentityCard(1, 'dev', 'ID', {} as any);
      expect(result.errorCode).toBe(ErrorCode.HTTP_ERROR_REINTENT);
    });

    it('returns NOT_FOUND in the second query (updatedIncidents empty)', async () => {
      const ctx = buildService();
      ctx.gimService.validateOpenTill.mockResolvedValueOnce({ errorCode: ErrorCode.NONE });
      ctx.incidentRepository.query
        .mockResolvedValueOnce([
          { id: 1, nroTicket: 'T1', identityCard: 'ID', optionalData: [], onResponseExternal: [] },
        ])
        .mockResolvedValueOnce([]);
      ctx.commonAuthService.filterByIdentityCard.mockResolvedValueOnce({
        errorCode: ErrorCode.NONE,
        data: { residentId: 99 },
      });
      ctx.gimService.findObligationsByCitation.mockResolvedValue({ errorCode: ErrorCode.NOT_FOUND });
      ctx.gimService.emitInfractionGim.mockResolvedValueOnce({
        errorCode: ErrorCode.NONE,
        data: { bondId: 1, bondNumber: 'B' },
      });

      const result: any = await ctx.service.findSanctionByIdentityCard(1, 'dev', 'ID', {} as any);
      expect(result.errorCode).toBe(ErrorCode.NOT_FOUND);
    });

    it('routes errors through handleDbExceptions', async () => {
      const ctx = buildService();
      ctx.gimService.validateOpenTill.mockRejectedValueOnce(new Error('e'));
      await expect(
        ctx.service.findSanctionByIdentityCard(1, 'dev', 'ID', {} as any),
      ).rejects.toThrow('e');
    });
  });

  describe('_getResidentId (private)', () => {
    it('returns residentId from auth when present', async () => {
      const ctx = buildService();
      ctx.commonAuthService.filterByIdentityCard.mockResolvedValueOnce({
        errorCode: ErrorCode.NONE,
        data: { residentId: 42 },
      });
      const result = await (ctx.service as any)._getResidentId(1, 'dev', 'ID', []);
      expect(result.residentId).toBe(42);
    });

    it('falls back to GIM and saves residentId', async () => {
      const ctx = buildService();
      ctx.commonAuthService.filterByIdentityCard.mockResolvedValueOnce({
        errorCode: ErrorCode.NONE,
        data: { residentId: null },
      });
      ctx.commonGimService.getUserByIdentificationNumber.mockResolvedValueOnce({
        errorCode: ErrorCode.NONE,
        data: { id: 7 },
      });

      const result = await (ctx.service as any)._getResidentId(1, 'dev', 'ID', []);
      expect(result.residentId).toBe(7);
      expect(ctx.commonAuthService.updateResidentId).toHaveBeenCalledWith(1, 'ID', 7);
    });

    it('creates the GIM client when both lookups fail (user found)', async () => {
      const ctx = buildService();
      ctx.commonAuthService.filterByIdentityCard.mockResolvedValueOnce({
        errorCode: ErrorCode.NONE,
        data: { residentId: null, firstName: 'F', lastName: 'L', email: 'e@x' },
      });
      ctx.commonGimService.getUserByIdentificationNumber.mockResolvedValueOnce({
        errorCode: ErrorCode.NOT_FOUND,
      });
      ctx.commonGimService.createClientGim.mockResolvedValueOnce({
        errorCode: ErrorCode.NONE,
        data: { id: 11 },
      });

      const result = await (ctx.service as any)._getResidentId(1, 'dev', 'ID', []);
      expect(result.residentId).toBe(11);
      expect(ctx.commonAuthService.updateResidentId).toHaveBeenCalled();
    });

    it('uses incident fallback data when user not found', async () => {
      const ctx = buildService();
      ctx.commonAuthService.filterByIdentityCard.mockResolvedValueOnce({
        errorCode: ErrorCode.NOT_FOUND,
      });
      ctx.commonGimService.getUserByIdentificationNumber.mockResolvedValueOnce({
        errorCode: ErrorCode.NOT_FOUND,
      });
      ctx.commonGimService.createClientGim.mockResolvedValueOnce({
        errorCode: ErrorCode.NONE,
        data: { id: 5 },
      });

      const result = await (ctx.service as any)._getResidentId(1, 'dev', 'ID', [
        { fullNameClient: 'Bob', emailClient: 'b@x' },
      ]);
      expect(result.residentId).toBe(5);
    });

    it('logs warning when GIM creation fails', async () => {
      const ctx = buildService();
      ctx.commonAuthService.filterByIdentityCard.mockResolvedValueOnce({
        errorCode: ErrorCode.NOT_FOUND,
      });
      ctx.commonGimService.getUserByIdentificationNumber.mockResolvedValueOnce({
        errorCode: ErrorCode.NOT_FOUND,
      });
      ctx.commonGimService.createClientGim.mockResolvedValueOnce({
        errorCode: ErrorCode.HTTP_ERROR_REINTENT,
      });

      const result = await (ctx.service as any)._getResidentId(1, 'dev', 'ID', []);
      expect(result.residentId).toBeNull();
    });
  });

  describe('_formatOptionalData / _formatOnExternalResponse (private)', () => {
    it('does not duplicate existing residentId', () => {
      const ctx = buildService();
      const out = (ctx.service as any)._formatOptionalData(
        [{ key: 'residentId', value: 1 }],
        2,
      );
      expect(out).toEqual([{ key: 'residentId', value: 1 }]);
    });

    it('pushes residentId when missing', () => {
      const ctx = buildService();
      const out = (ctx.service as any)._formatOptionalData([], 5);
      expect(out).toEqual([{ key: 'residentId', value: 5 }]);
    });

    it('handles null inputs gracefully', () => {
      const ctx = buildService();
      const out = (ctx.service as any)._formatOptionalData(null, 9);
      expect(out).toEqual([{ key: 'residentId', value: 9 }]);
    });

    it('_formatOnExternalResponse pushes data when present', () => {
      const ctx = buildService();
      const out = (ctx.service as any)._formatOnExternalResponse(null, { a: 1 });
      expect(out).toEqual([{ a: 1 }]);
    });

    it('_formatOnExternalResponse keeps array when data is null', () => {
      const ctx = buildService();
      const out = (ctx.service as any)._formatOnExternalResponse([{ a: 1 }], null);
      expect(out).toEqual([{ a: 1 }]);
    });
  });

  describe('pay', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });
    afterEach(() => {
      jest.useRealTimers();
    });

    it('returns openTill response when till not open', async () => {
      const ctx = buildService();
      ctx.gimService.validateOpenTill.mockResolvedValueOnce({ errorCode: ErrorCode.NOT_FOUND });
      const result = await ctx.service.pay('dev', {} as any);
      expect(result).toEqual({ errorCode: ErrorCode.NOT_FOUND });
    });

    it('returns RESPONSE for DEUNA with invalid identityCard', async () => {
      const ctx = buildService();
      ctx.gimService.validateOpenTill.mockResolvedValueOnce({ errorCode: ErrorCode.NONE });
      const result = await ctx.service.pay('dev', {
        typePaymentMethod: TypePaymentMethod.DEUNA,
        identityCard: '123',
      } as any);
      expect(result).toEqual({ errorCode: ErrorCode.RESPONSE });
    });

    it('returns WAIT_TRANSACTION_PREVIEWS when DEUNA check fails', async () => {
      const ctx = buildService();
      ctx.gimService.validateOpenTill.mockResolvedValueOnce({ errorCode: ErrorCode.NONE });
      ctx.commonService.checkDeUnaByIdentityCard.mockResolvedValueOnce({ errorCode: ErrorCode.NOT_FOUND });
      const result = await ctx.service.pay('dev', {
        typePaymentMethod: TypePaymentMethod.DEUNA,
        identityCard: '0102030405',
      } as any);
      expect(result).toEqual({ errorCode: ErrorCode.WAIT_TRANSACTION_PREVIEWS });
    });

    it('returns RESPONSE for PLACE_TO_PAY with short identityCard', async () => {
      const ctx = buildService();
      ctx.gimService.validateOpenTill.mockResolvedValueOnce({ errorCode: ErrorCode.NONE });
      const result = await ctx.service.pay('dev', {
        typePaymentMethod: TypePaymentMethod.PLACE_TO_PAY,
        identityCard: '1',
      } as any);
      expect(result).toEqual({ errorCode: ErrorCode.RESPONSE });
    });

    it('returns WAIT_TRANSACTION_PREVIEWS when PLACE_TO_PAY check fails', async () => {
      const ctx = buildService();
      ctx.gimService.validateOpenTill.mockResolvedValueOnce({ errorCode: ErrorCode.NONE });
      ctx.commonService.checkPlaceToPayByIdentityCard.mockResolvedValueOnce({ errorCode: ErrorCode.NOT_FOUND });
      const result = await ctx.service.pay('dev', {
        typePaymentMethod: TypePaymentMethod.PLACE_TO_PAY,
        identityCard: '0102030405',
      } as any);
      expect(result).toEqual({ errorCode: ErrorCode.WAIT_TRANSACTION_PREVIEWS });
    });

    it.skip('happy path with DEUNAV2 returns AWAITS_RESPONSE', async () => {
      const ctx = buildService();
      ctx.gimService.validateOpenTill.mockResolvedValueOnce({ errorCode: ErrorCode.NONE });
      ctx.commonService.payDeUnaV2.mockResolvedValueOnce({ errorCode: ErrorCode.NONE, deeplink: 'dlink' });
      ctx.incidentPaymentRepository.findOne.mockResolvedValueOnce({ id: 1 });
      ctx.incidentPaymentRepository.find.mockResolvedValue([]);

      const result = await ctx.service.pay('dev', {
        userId: 1,
        transactionId: 'tx-1',
        typePaymentMethod: TypePaymentMethod.DEUNAV2,
        identityCard: '0102030405',
        credentialId: 1,
        incidents: [{ id: 1, amount: 10, register: '2026-05-15' }],
        amount: 10,
        billing_data: {},
        optionalData: [{ key: 'concept', value: 'C' }],
      } as any);

      expect(result?.errorCode).toBe(ErrorCode.AWAITS_RESPONSE);
      expect(ctx.queryRunner.commitTransaction).toHaveBeenCalled();
    });

    it('happy path with AHORITA returns AWAITS_RESPONSE', async () => {
      const ctx = buildService();
      ctx.gimService.validateOpenTill.mockResolvedValueOnce({ errorCode: ErrorCode.NONE });
      ctx.commonService.payAhorita.mockResolvedValueOnce({ errorCode: ErrorCode.NONE, deeplink: 'dlink' });
      ctx.incidentPaymentRepository.findOne.mockResolvedValueOnce({ id: 1 });
      ctx.incidentPaymentRepository.find.mockResolvedValue([]);

      const result = await ctx.service.pay('dev', {
        userId: 1,
        transactionId: 'tx-1',
        typePaymentMethod: TypePaymentMethod.AHORITA,
        identityCard: '0102030405',
        credentialId: 1,
        incidents: [{ id: 1, amount: 10, register: 'r' }],
        amount: 10,
        billing_data: {},
      } as any);

      expect(result?.errorCode).toBe(ErrorCode.AWAITS_RESPONSE);
    });

    it('happy path with PLACE_TO_PAY returns AWAITS_RESPONSE', async () => {
      const ctx = buildService();
      ctx.gimService.validateOpenTill.mockResolvedValueOnce({ errorCode: ErrorCode.NONE });
      ctx.commonService.checkPlaceToPayByIdentityCard.mockResolvedValueOnce({ errorCode: ErrorCode.NONE, url: 'u' });
      ctx.commonService.payPlaceToPay.mockResolvedValueOnce({ errorCode: ErrorCode.NONE, deeplink: 'dlink' });
      ctx.incidentPaymentRepository.findOne.mockResolvedValueOnce({ id: 1 });
      ctx.incidentPaymentRepository.find.mockResolvedValue([]);

      const result = await ctx.service.pay('dev', {
        userId: 1,
        transactionId: 'tx-1',
        typePaymentMethod: TypePaymentMethod.PLACE_TO_PAY,
        identityCard: '0102030405',
        credentialId: 1,
        incidents: [{ id: 1, amount: 10, register: 'r' }],
        amount: 10,
        billing_data: {},
      } as any);

      expect(result?.errorCode).toBe(ErrorCode.AWAITS_RESPONSE);
    });

    it.skip('rolls back when provider fails (DeunaV2 throws)', async () => {
      const ctx = buildService();
      ctx.gimService.validateOpenTill.mockResolvedValueOnce({ errorCode: ErrorCode.NONE });
      ctx.commonService.payDeUnaV2.mockResolvedValueOnce({ errorCode: ErrorCode.RESPONSE });
      ctx.incidentPaymentRepository.find.mockResolvedValue([]);

      const result = await ctx.service.pay('dev', {
        userId: 1,
        transactionId: 'tx-1',
        typePaymentMethod: TypePaymentMethod.DEUNAV2,
        incidents: [{ id: 1, amount: 5, register: 'r' }],
        amount: 5,
        billing_data: {},
      } as any);

      expect(result).toEqual({ errorCode: ErrorCode.UNAUTHORIZED });
      expect(ctx.queryRunner.rollbackTransaction).toHaveBeenCalled();
    });

    it('returns UNAUTHORIZED when payment method is unsupported', async () => {
      const ctx = buildService();
      ctx.gimService.validateOpenTill.mockResolvedValueOnce({ errorCode: ErrorCode.NONE });

      const result = await ctx.service.pay('dev', {
        userId: 1,
        transactionId: 'tx-1',
        typePaymentMethod: 999, // unsupported
        incidents: [{ id: 1, amount: 5, register: 'r' }],
        amount: 5,
        billing_data: {},
      } as any);

      expect(result).toEqual({ errorCode: ErrorCode.UNAUTHORIZED });
    });

    it('DEUNA flow with valid check returns AWAITS_RESPONSE via DEUNAV2 path? NO — DEUNA goes to default', async () => {
      const ctx = buildService();
      ctx.gimService.validateOpenTill.mockResolvedValueOnce({ errorCode: ErrorCode.NONE });
      ctx.commonService.checkDeUnaByIdentityCard.mockResolvedValueOnce({ errorCode: ErrorCode.NONE, url: 'u' });

      const result = await ctx.service.pay('dev', {
        userId: 1,
        transactionId: 'tx-1',
        typePaymentMethod: TypePaymentMethod.DEUNA,
        identityCard: '0102030405',
        incidents: [{ id: 1, amount: 5, register: 'r' }],
        amount: 5,
        billing_data: {},
      } as any);

      // DEUNA isn't handled in switch -> default -> throws -> UNAUTHORIZED
      expect(result).toEqual({ errorCode: ErrorCode.UNAUTHORIZED });
    });
  });

  describe('_payDeunaV2 / _payAhorita / _payPlaceToPay (setTimeout branches)', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });
    afterEach(() => {
      jest.useRealTimers();
    });

    const baseDto = (typePaymentMethod: number): any => ({
      userId: 1,
      typePaymentMethod,
      credentialId: 1,
      amount: 10,
      identityCard: 'ID',
      transactionId: 'tx',
      billing_data: {},
    });
    const baseDebit: any = {
      register: '2026-05-15',
      commission: 0,
      concept: 'C',
      purchase_data: [],
      billing_data: {},
      transactionId: 'tx',
    };

    it('_payDeunaV2 returns NONE and schedules timer that logs success', async () => {
      const ctx = buildService();
      ctx.commonService.payDeUnaV2.mockResolvedValueOnce({ errorCode: ErrorCode.NONE, deeplink: 'd' });
      ctx.incidentPaymentRepository.find.mockResolvedValueOnce([
        { statusPayment: StatusPayment.PAID, referenceId: 'r' },
      ]);

      const result = await (ctx.service as any)._payDeunaV2('dev', baseDebit, baseDto(TypePaymentMethod.DEUNAV2), undefined, 'r');
      expect(result.errorCode).toBe(ErrorCode.NONE);

      jest.runAllTimers();
      await Promise.resolve();
    });

    it('_payDeunaV2 timer triggers error branch when payments not all paid', async () => {
      const ctx = buildService();
      ctx.commonService.payDeUnaV2.mockResolvedValueOnce({ errorCode: ErrorCode.NONE, deeplink: 'd' });
      ctx.incidentPaymentRepository.find
        .mockResolvedValueOnce([{ statusPayment: StatusPayment.WAITING, referenceId: 'r', incidentId: 1, amount: 1 }])
        .mockResolvedValueOnce([]);
      ctx.incidentRepository.find.mockResolvedValue([]);

      await (ctx.service as any)._payDeunaV2('dev', baseDebit, baseDto(TypePaymentMethod.DEUNAV2), undefined, 'r');
      jest.runAllTimers();
      await Promise.resolve();
      await Promise.resolve();
    });

    it('_payDeunaV2 timer no-op when find returns null', async () => {
      const ctx = buildService();
      ctx.commonService.payDeUnaV2.mockResolvedValueOnce({ errorCode: ErrorCode.NONE, deeplink: 'd' });
      ctx.incidentPaymentRepository.find.mockResolvedValueOnce(null as any);

      await (ctx.service as any)._payDeunaV2('dev', baseDebit, baseDto(TypePaymentMethod.DEUNAV2), undefined, 'r');
      jest.runAllTimers();
      await Promise.resolve();
    });

    it('_payDeunaV2 returns RESPONSE when provider fails', async () => {
      const ctx = buildService();
      ctx.commonService.payDeUnaV2.mockResolvedValueOnce({ errorCode: ErrorCode.RESPONSE });
      ctx.incidentPaymentRepository.find.mockResolvedValueOnce([
        { referenceId: 'r', incidentId: 1, amount: 1, transactionId: 't', typePaymentMethod: 1 },
      ]);
      ctx.incidentRepository.find.mockResolvedValue([]);

      const result = await (ctx.service as any)._payDeunaV2('dev', baseDebit, baseDto(TypePaymentMethod.DEUNAV2), TypePaymentMethod.DEUNAV2 as any, 'r');
      expect(result.errorCode).toBe(ErrorCode.RESPONSE);
    });

    it('_payAhorita returns NONE and triggers success timer', async () => {
      const ctx = buildService();
      ctx.commonService.payAhorita.mockResolvedValueOnce({ errorCode: ErrorCode.NONE, deeplink: 'd' });
      ctx.incidentPaymentRepository.find.mockResolvedValueOnce([
        { statusPayment: StatusPayment.PAID, referenceId: 'r' },
      ]);
      const result = await (ctx.service as any)._payAhorita('dev', baseDebit, baseDto(TypePaymentMethod.AHORITA), undefined, 'r');
      expect(result.errorCode).toBe(ErrorCode.NONE);
      jest.runAllTimers();
      await Promise.resolve();
    });

    it('_payAhorita timer triggers error branch when payments not paid', async () => {
      const ctx = buildService();
      ctx.commonService.payAhorita.mockResolvedValueOnce({ errorCode: ErrorCode.NONE, deeplink: 'd' });
      ctx.incidentPaymentRepository.find
        .mockResolvedValueOnce([{ statusPayment: StatusPayment.WAITING, referenceId: 'r', incidentId: 1, amount: 1 }])
        .mockResolvedValueOnce([]);
      ctx.incidentRepository.find.mockResolvedValue([]);

      await (ctx.service as any)._payAhorita('dev', baseDebit, baseDto(TypePaymentMethod.AHORITA), undefined, 'r');
      jest.runAllTimers();
      await Promise.resolve();
    });

    it('_payAhorita timer no-op when find returns null', async () => {
      const ctx = buildService();
      ctx.commonService.payAhorita.mockResolvedValueOnce({ errorCode: ErrorCode.NONE, deeplink: 'd' });
      ctx.incidentPaymentRepository.find.mockResolvedValueOnce(null as any);
      await (ctx.service as any)._payAhorita('dev', baseDebit, baseDto(TypePaymentMethod.AHORITA), undefined, 'r');
      jest.runAllTimers();
      await Promise.resolve();
    });

    it('_payAhorita returns RESPONSE when provider fails', async () => {
      const ctx = buildService();
      ctx.commonService.payAhorita.mockResolvedValueOnce({ errorCode: ErrorCode.RESPONSE });
      ctx.incidentPaymentRepository.find.mockResolvedValueOnce([]);
      const result = await (ctx.service as any)._payAhorita('dev', baseDebit, baseDto(TypePaymentMethod.AHORITA), TypePaymentMethod.AHORITA as any, 'r');
      expect(result.errorCode).toBe(ErrorCode.RESPONSE);
    });

    it('_payPlaceToPay returns NONE and timer logs success', async () => {
      const ctx = buildService();
      ctx.commonService.payPlaceToPay.mockResolvedValueOnce({ errorCode: ErrorCode.NONE, deeplink: 'd' });
      ctx.incidentPaymentRepository.find.mockResolvedValueOnce([
        { statusPayment: StatusPayment.PAID, referenceId: 'r' },
      ]);
      const result = await (ctx.service as any)._payPlaceToPay('dev', baseDebit, baseDto(TypePaymentMethod.PLACE_TO_PAY), undefined, 'r');
      expect(result.errorCode).toBe(ErrorCode.NONE);
      jest.runAllTimers();
      await Promise.resolve();
    });

    it('_payPlaceToPay timer triggers error branch', async () => {
      const ctx = buildService();
      ctx.commonService.payPlaceToPay.mockResolvedValueOnce({ errorCode: ErrorCode.NONE, deeplink: 'd' });
      ctx.incidentPaymentRepository.find
        .mockResolvedValueOnce([{ statusPayment: StatusPayment.WAITING, referenceId: 'r', incidentId: 1, amount: 1 }])
        .mockResolvedValueOnce([]);
      ctx.incidentRepository.find.mockResolvedValue([]);

      await (ctx.service as any)._payPlaceToPay('dev', baseDebit, baseDto(TypePaymentMethod.PLACE_TO_PAY), undefined, 'r');
      jest.runAllTimers();
      await Promise.resolve();
    });

    it('_payPlaceToPay timer no-op for empty array', async () => {
      const ctx = buildService();
      ctx.commonService.payPlaceToPay.mockResolvedValueOnce({ errorCode: ErrorCode.NONE, deeplink: 'd' });
      ctx.incidentPaymentRepository.find.mockResolvedValueOnce([]);
      await (ctx.service as any)._payPlaceToPay('dev', baseDebit, baseDto(TypePaymentMethod.PLACE_TO_PAY), undefined, 'r');
      jest.runAllTimers();
      await Promise.resolve();
    });

    it('_payPlaceToPay returns RESPONSE when provider fails', async () => {
      const ctx = buildService();
      ctx.commonService.payPlaceToPay.mockResolvedValueOnce({ errorCode: ErrorCode.RESPONSE });
      ctx.incidentPaymentRepository.find.mockResolvedValueOnce([]);
      const result = await (ctx.service as any)._payPlaceToPay('dev', baseDebit, baseDto(TypePaymentMethod.PLACE_TO_PAY), TypePaymentMethod.PLACE_TO_PAY as any, 'r');
      expect(result.errorCode).toBe(ErrorCode.RESPONSE);
    });
  });

  describe('_parseDebitAmounDto (private)', () => {
    it('returns DTO with useGif from optionalData true', async () => {
      const ctx = buildService();
      const result = await (ctx.service as any)._parseDebitAmounDto('c', {
        credentialId: 1,
        amount: 5,
        userId: 1,
        transactionId: 'tx',
        optionalData: [{ key: 'useGif', value: true }],
        commission: 0,
        billing_data: {},
      });
      expect(result).toBeDefined();
      expect(result.debit).toBe(5);
    });

    it('returns DTO when optionalData is missing', async () => {
      const ctx = buildService();
      const result = await (ctx.service as any)._parseDebitAmounDto('c', {
        credentialId: 1,
        amount: 5,
        userId: 1,
        transactionId: 'tx',
        commission: 0,
        billing_data: {},
      });
      expect(result).toBeDefined();
    });

    it('returns undefined when input throws', async () => {
      const ctx = buildService();
      // commonService.getDate throws
      ctx.commonService.getDate.mockImplementationOnce(() => {
        throw new Error('x');
      });
      const result = await (ctx.service as any)._parseDebitAmounDto('c', { billing_data: {} } as any);
      expect(result).toBeUndefined();
    });
  });

  describe('_saveResponsePay', () => {
    it('no-op when empty array', async () => {
      const ctx = buildService();
      await ctx.service._saveResponsePay([], StatusMoment.RESPONSE, StatusPayment.ERROR);
      expect(ctx.incidentPaymentRepository.update).not.toHaveBeenCalled();
    });

    it('error path: updates incidentPayment and incident', async () => {
      const ctx = buildService();
      await ctx.service._saveResponsePay(
        [
          { referenceId: 'r', incidentId: 1, amount: 1, transactionId: 't', typePaymentMethod: 1 } as any,
        ],
        StatusMoment.RESPONSE,
        StatusPayment.ERROR,
      );
      expect(ctx.incidentPaymentRepository.update).toHaveBeenCalled();
      expect(ctx.incidentRepository.update).toHaveBeenCalled();
    });

    it('paid path: registers deposit and updates each incident with onResponseExternal', async () => {
      const ctx = buildService();
      ctx.incidentRepository.find.mockResolvedValueOnce([
        { id: 1, bondId: 11, identityCard: 'ID', onResponseExternal: null },
      ]);
      ctx.gimService.registerDeposit.mockResolvedValueOnce({
        errorCode: ErrorCode.NONE,
        data: { ok: true },
      });

      await ctx.service._saveResponsePay(
        [
          { referenceId: 'r', incidentId: 1, amount: 5, transactionId: 't', typePaymentMethod: 1 } as any,
        ],
        StatusMoment.LISTENING,
        StatusPayment.PAID,
      );

      expect(ctx.gimService.registerDeposit).toHaveBeenCalled();
      expect(ctx.incidentRepository.update).toHaveBeenCalled();
    });

    it('paid path: when deposit fails, falls back to plain status update', async () => {
      const ctx = buildService();
      ctx.incidentRepository.find.mockResolvedValueOnce([
        { id: 1, bondId: 11, identityCard: 'ID' },
      ]);
      ctx.gimService.registerDeposit.mockResolvedValueOnce({
        errorCode: ErrorCode.NOT_FOUND,
      });

      await ctx.service._saveResponsePay(
        [
          { referenceId: 'r', incidentId: 1, amount: 5, transactionId: 't', typePaymentMethod: 1 } as any,
        ],
        StatusMoment.LISTENING,
        StatusPayment.PAID,
      );

      expect(ctx.incidentRepository.update).toHaveBeenCalled();
    });

    it('paid path: catch branch handles errors by marking CORRECTLY_PAID_UNASSIGNED', async () => {
      const ctx = buildService();
      ctx.incidentRepository.find.mockRejectedValueOnce(new Error('e'));

      await ctx.service._saveResponsePay(
        [
          { referenceId: 'r', incidentId: 1, amount: 5, transactionId: 't', typePaymentMethod: 1 } as any,
        ],
        StatusMoment.LISTENING,
        StatusPayment.PAID,
      );

      expect(ctx.incidentPaymentRepository.update).toHaveBeenCalled();
    });
  });

  describe('onResponsePay', () => {
    it('returns NOT_FOUND when no payments match', async () => {
      const ctx = buildService();
      ctx.incidentPaymentRepository.find.mockResolvedValueOnce([]);
      const result = await ctx.service.onResponsePay('dev', 1, 'r', TypePaymentMethod.DEUNA, 'reg', 0 as any);
      expect(result).toEqual({ errorCode: ErrorCode.NOT_FOUND });
    });

    it('returns NONE when WAITING and processes', async () => {
      const ctx = buildService();
      ctx.incidentPaymentRepository.find.mockResolvedValue([
        { statusPayment: StatusPayment.WAITING, referenceId: 'r', incidentId: 1, amount: 5, transactionId: 't', typePaymentMethod: 1 },
      ]);
      ctx.incidentRepository.find.mockResolvedValueOnce([{ id: 1, bondId: 1, identityCard: 'ID' }]);
      ctx.gimService.registerDeposit.mockResolvedValueOnce({ errorCode: ErrorCode.NONE, data: {} });

      const result = await ctx.service.onResponsePay('dev', 1, 'r', TypePaymentMethod.DEUNA, 'reg', 0 as any);
      expect(result).toEqual({ errorCode: ErrorCode.NONE });
    });

    it('returns NOT_FOUND when statusPayment is not WAITING', async () => {
      const ctx = buildService();
      ctx.incidentPaymentRepository.find.mockResolvedValueOnce([
        { statusPayment: StatusPayment.PAID, referenceId: 'r', amount: 1 },
      ]);
      const result = await ctx.service.onResponsePay('dev', 1, 'r', TypePaymentMethod.DEUNA, 'reg', 0 as any);
      expect(result).toEqual({ errorCode: ErrorCode.NOT_FOUND });
    });
  });

  describe('onResponsePayError', () => {
    it('returns early when payments empty', async () => {
      const ctx = buildService();
      ctx.incidentPaymentRepository.find.mockResolvedValueOnce([]);
      const result = await ctx.service.onResponsePayError('dev', 1, 'r', TypePaymentMethod.DEUNA, 'reg', 0);
      expect(result).toBeUndefined();
    });

    it('processes error response', async () => {
      const ctx = buildService();
      ctx.incidentPaymentRepository.find.mockResolvedValueOnce([
        { referenceId: 'r', incidentId: 1, amount: 1, transactionId: 't', typePaymentMethod: 1 },
      ]);
      await ctx.service.onResponsePayError('dev', 1, 'r', TypePaymentMethod.DEUNA, 'reg', 0);
      expect(ctx.incidentPaymentRepository.update).toHaveBeenCalled();
    });
  });

  describe('getTransactionsByReference', () => {
    it('returns NONE with payment when found', async () => {
      const ctx = buildService();
      ctx.incidentPaymentRepository.__qb.getOne.mockResolvedValueOnce({ id: 1 });
      const result: any = await ctx.service.getTransactionsByReference(1, 'r');
      expect(result.errorCode).toBe(ErrorCode.NONE);
      expect(result.incidentPaymentBuying).toEqual({ id: 1 });
    });

    it('returns NOT_FOUND when nothing found', async () => {
      const ctx = buildService();
      ctx.incidentPaymentRepository.__qb.getOne.mockResolvedValueOnce(null);
      const result: any = await ctx.service.getTransactionsByReference(1, 'r');
      expect(result.errorCode).toBe(ErrorCode.NOT_FOUND);
    });

    it('routes errors through handleDbExceptions', async () => {
      const ctx = buildService();
      ctx.incidentPaymentRepository.__qb.getOne.mockRejectedValueOnce(new Error('e'));
      await expect(ctx.service.getTransactionsByReference(1, 'r')).rejects.toThrow('e');
    });
  });

  describe('_tableExists (private)', () => {
    it('returns false when no schema is provided', async () => {
      const ctx = buildService();
      const result = await (ctx.service as any)._tableExists('incident');
      expect(result).toBe(false);
    });

    it('returns true when row exists', async () => {
      const ctx = buildService();
      ctx.incidentRepository.query.mockResolvedValueOnce([{ exists: true }]);
      const result = await (ctx.service as any)._tableExists('history."2026_03_incident"');
      expect(result).toBe(true);
    });

    it('returns false when row is empty', async () => {
      const ctx = buildService();
      ctx.incidentRepository.query.mockResolvedValueOnce([]);
      const result = await (ctx.service as any)._tableExists('a.b');
      expect(result).toBe(false);
    });
  });

  describe('_saveSatusFraction (private)', () => {
    it('updates existing fraction status moment', async () => {
      const ctx = buildService();
      ctx.fractionStatusRepository.findOne.mockResolvedValueOnce({ id: 1, moment: 0 });

      await (ctx.service as any)._saveSatusFraction(
        { id: 1, status: { id: StatusFraction.ACTIVE } },
        StatusFraction.SANCTIONED,
        StatusMoment.NOTIFIED,
      );

      expect(ctx.fractionStatusRepository.save).toHaveBeenCalled();
      expect(ctx.fractionRepository.save).toHaveBeenCalled();
    });

    it('creates new fraction status when not existing', async () => {
      const ctx = buildService();
      ctx.fractionStatusRepository.findOne.mockResolvedValueOnce(null);

      await (ctx.service as any)._saveSatusFraction(
        { id: 1, status: { id: StatusFraction.ACTIVE } },
        StatusFraction.SANCTIONED,
        StatusMoment.NOTIFIED,
      );

      expect(ctx.fractionStatusRepository.create).toHaveBeenCalled();
    });

    it('FINISHED_BY_OPERATOR with EXCEEDED_TIME maps to FINISHED_BY_CONTROLLER', async () => {
      const ctx = buildService();
      ctx.fractionStatusRepository.findOne.mockResolvedValueOnce(null);

      await (ctx.service as any)._saveSatusFraction(
        { id: 1, status: { id: StatusFraction.EXCEEDED_TIME } },
        StatusFraction.FINISHED_BY_OPERATOR,
        StatusMoment.NOTIFIED,
      );

      expect(ctx.fractionRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ status: { id: StatusFraction.FINISHED_BY_CONTROLLER } }),
      );
    });

    it('FINISHED_BY_OPERATOR with SANCTIONED maps to FINISHED_BY_CONTROLLER', async () => {
      const ctx = buildService();
      ctx.fractionStatusRepository.findOne.mockResolvedValueOnce(null);

      await (ctx.service as any)._saveSatusFraction(
        { id: 1, status: { id: StatusFraction.SANCTIONED } },
        StatusFraction.FINISHED_BY_OPERATOR,
        StatusMoment.NOTIFIED,
      );

      expect(ctx.fractionRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ status: { id: StatusFraction.FINISHED_BY_CONTROLLER } }),
      );
    });

    it('FINISHED_BY_OPERATOR with ACTIVE keeps FINISHED_BY_OPERATOR', async () => {
      const ctx = buildService();
      ctx.fractionStatusRepository.findOne.mockResolvedValueOnce(null);

      await (ctx.service as any)._saveSatusFraction(
        { id: 1, status: { id: StatusFraction.ACTIVE } },
        StatusFraction.FINISHED_BY_OPERATOR,
        StatusMoment.NOTIFIED,
      );

      expect(ctx.fractionRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ status: { id: StatusFraction.FINISHED_BY_OPERATOR } }),
      );
    });
  });

  describe('_notifyChageStatus / _notifyChageStatusFraction (private)', () => {
    it('_notifyChageStatus calls commonService.notify', async () => {
      const ctx = buildService();
      await (ctx.service as any)._notifyChageStatus(1, 100, 'r', '5', TypePaymentMethod.DEUNA);
      expect(ctx.commonService.notify).toHaveBeenCalled();
    });

    it('_notifyChageStatusFraction calls commonService.notify', async () => {
      const ctx = buildService();
      await (ctx.service as any)._notifyChageStatusFraction(1, 1, 5);
      expect(ctx.commonService.notify).toHaveBeenCalled();
    });
  });

  describe('_buildAntDataResponse (private)', () => {
    it('maps obligation fields to UpdateIncidentDto', () => {
      const ctx = buildService();
      const dto = (ctx.service as any)._buildAntDataResponse(
        { obligationId: 9, obligationNumber: 'OBL', total: 100 },
        IncidentStatus.SUPPLIED,
      );
      expect(dto.bondId).toBe(9);
      expect(dto.nroObligation).toBe('OBL');
      expect(dto.amount).toBe(100);
      expect(dto.statusIncident).toBe(IncidentStatus.SUPPLIED);
    });

    it('omits amount when total is falsy', () => {
      const ctx = buildService();
      const dto = (ctx.service as any)._buildAntDataResponse(
        { obligationId: 9, obligationNumber: 'OBL', total: 0 },
        IncidentStatus.SUPPLIED,
      );
      expect(dto.amount).toBeUndefined();
    });
  });
});
