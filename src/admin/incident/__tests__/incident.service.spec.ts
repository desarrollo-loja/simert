/* eslint-disable @typescript-eslint/no-var-requires */
import { ErrorCode } from 'src/common/glob/error';
import { IncidentStatus } from 'src/common/glob/type/type_incident';
import { InternalStateIncident } from 'src/common/glob/type/type_internal_state_incident';
import { TypeRol } from 'src/common/glob/type/type_rol';

// Mock axios at module level (used inside Alfresco helpers).
jest.mock('axios', () => ({
  __esModule: true,
  default: { request: jest.fn() },
}));
import axios from 'axios';

// Mock form-data (loaded via require() inside uploadToAlfresco).
jest.mock(
  'form-data',
  () =>
    function FormDataMock() {
      const calls: any[] = [];
      return {
        append: jest.fn((...args: any[]) => calls.push(args)),
        getHeaders: jest.fn(() => ({ 'content-type': 'multipart/form-data' })),
        _calls: calls,
      };
    },
  { virtual: true },
);

// Spy on default-exported `handleDbExceptions` so we can assert behavior on
// thrown errors without exercising the real Nest exception classes.
jest.mock('src/common/exceptions/error.db.exception', () => ({
  __esModule: true,
  default: jest.fn((error: any) => {
    throw error;
  }),
}));
import handleDbExceptions from 'src/common/exceptions/error.db.exception';

import { IncidentService } from '../incident.service';

const buildRepoMock = () => {
  const qb: any = {
    update: jest.fn().mockReturnThis(),
    set: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    returning: jest.fn().mockReturnThis(),
    execute: jest.fn(),
  };
  return {
    create: jest.fn((dto: any) => dto),
    save: jest.fn(async (e: any) => e),
    findOne: jest.fn(),
    preload: jest.fn(),
    query: jest.fn(),
    createQueryBuilder: jest.fn(() => qb),
    __qb: qb,
  };
};

const buildGimMock = () => ({
  findObligationsByCitation: jest.fn(),
  validateStatusWithGim: jest.fn(),
});

describe('IncidentService', () => {
  let service: IncidentService;
  let repo: ReturnType<typeof buildRepoMock>;
  let logger: any;
  let gim: ReturnType<typeof buildGimMock>;

  beforeEach(() => {
    repo = buildRepoMock();
    logger = { error: jest.fn(), log: jest.fn(), warn: jest.fn(), debug: jest.fn() };
    gim = buildGimMock();
    service = new IncidentService(repo as any, logger as any, gim as any);
    // Silence the internal Logger so test output stays clean.
    (service as any).logger = { error: jest.fn(), log: jest.fn(), warn: jest.fn(), debug: jest.fn() };

    (axios.request as jest.Mock).mockReset();
    (handleDbExceptions as unknown as jest.Mock).mockClear();
  });

  describe('create', () => {
    it('persists the incident and returns NONE error code', async () => {
      const dto: any = { plate: 'P-1' };
      repo.save.mockResolvedValueOnce({ id: 1, ...dto });

      const result = await service.create(dto);

      expect(repo.create).toHaveBeenCalledWith({ ...dto });
      expect(repo.save).toHaveBeenCalled();
      expect(result).toEqual({ incident: { id: 1, ...dto }, errorCode: ErrorCode.NONE });
    });

    it('routes errors through handleDbExceptions', async () => {
      repo.save.mockRejectedValueOnce(new Error('boom'));

      await expect(service.create({} as any)).rejects.toThrow('boom');
      expect(handleDbExceptions).toHaveBeenCalled();
    });
  });

  describe('_isValidYearMonth (private)', () => {
    const fn = (y: any, m: any) => (IncidentService.prototype as any)._isValidYearMonth.call({}, y, m);

    it('accepts valid year/month', () => {
      expect(fn(2026, 5)).toBe(true);
      expect(fn(2000, 1)).toBe(true);
      expect(fn(2100, 12)).toBe(true);
    });

    it('rejects out-of-range or non-integer values', () => {
      expect(fn(1999, 5)).toBe(false);
      expect(fn(2101, 5)).toBe(false);
      expect(fn(2026, 0)).toBe(false);
      expect(fn(2026, 13)).toBe(false);
      expect(fn(2026.5, 5)).toBe(false);
      expect(fn('abc', 5)).toBe(false);
      expect(fn(2026, '5; DROP TABLE x')).toBe(false);
    });
  });

  describe('findAll', () => {
    const user: any = { roles: [TypeRol.ADMIN] };

    it('queries main table and applies parameterized LIMIT/OFFSET', async () => {
      repo.query.mockResolvedValueOnce([{ id: 1 }]);

      const result = await service.findAll(
        { search: 'foo', incidentTypeId: 2, limit: 5, offset: 10 } as any,
        user,
      );

      expect(result).toEqual({ incidents: [{ id: 1 }], errorCode: ErrorCode.NONE });
      const [sql, params] = repo.query.mock.calls[0];
      expect(sql).toContain('FROM public.incident i');
      expect(sql).toMatch(/LIMIT \$\d+/);
      expect(sql).toMatch(/OFFSET \$\d+/);
      // Last two params should be the safe limit and offset values.
      expect(params[params.length - 2]).toBe(5);
      expect(params[params.length - 1]).toBe(10);
    });

    it('skips LIMIT/OFFSET when filter values are invalid (defense-in-depth)', async () => {
      repo.query.mockResolvedValueOnce([]);

      await service.findAll(
        { limit: -1, offset: -1 } as any,
        user,
      );

      const [sql] = repo.query.mock.calls[0];
      expect(sql).not.toMatch(/LIMIT/);
      expect(sql).not.toMatch(/OFFSET/);
    });

    it('falls back to public.incident when year/month are invalid', async () => {
      // Mirrors the resolution pattern of findAllFractionSanction: invalid
      // year/month should not abort the query, just default to public.incident.
      repo.query.mockResolvedValueOnce([]);

      const result = await service.findAll(
        { year: 1700, month: 5 } as any,
        user,
      );

      expect(result).toEqual({ incidents: [], errorCode: ErrorCode.NONE });
      // _tableExists is NOT called because validation fails before that step.
      expect(repo.query).toHaveBeenCalledTimes(1);
      expect(repo.query.mock.calls[0][0]).toContain('FROM public.incident i');
    });

    it('queries historical table when it exists', async () => {
      // First call: _tableExists -> true. Second call: actual incident query.
      repo.query
        .mockResolvedValueOnce([{ exists: true }])
        .mockResolvedValueOnce([{ id: 9 }]);

      const result = await service.findAll(
        { year: 2026, month: 3 } as any,
        user,
      );

      expect(result.incidents).toEqual([{ id: 9 }]);
      expect(repo.query.mock.calls[1][0]).toContain('history."2026_03_incident"');
    });

    it('falls back to public.incident when historical table does not exist', async () => {
      // First call: _tableExists -> false. Second call: query against public.
      repo.query
        .mockResolvedValueOnce([{ exists: false }])
        .mockResolvedValueOnce([{ id: 7 }]);

      const result = await service.findAll(
        { year: 2026, month: 3 } as any,
        user,
      );

      expect(result).toEqual({ incidents: [{ id: 7 }], errorCode: ErrorCode.NONE });
      expect(repo.query.mock.calls[1][0]).toContain('FROM public.incident i');
      expect(repo.query.mock.calls[1][0]).not.toContain('history."2026_03_incident"');
    });

    it('adds IN clause when roles map to internal states', async () => {
      repo.query.mockResolvedValueOnce([]);

      await service.findAll({} as any, {
        roles: [TypeRol.SIMERT_ADMINISTRATION, TypeRol.TRAFFIC_POLICE_STATION],
      } as any);

      const [sql, params] = repo.query.mock.calls[0];
      expect(sql).toContain('i."internalState" IN');
      expect(params).toContain(InternalStateIncident.SIMERT_ADMINISTRATION);
      expect(params).toContain(InternalStateIncident.TRAFFIC_POLICE_STATION);
    });

    it('propagates DB errors through handleDbExceptions', async () => {
      repo.query.mockRejectedValueOnce(new Error('db fail'));

      await expect(service.findAll({} as any, user)).rejects.toThrow('db fail');
      expect(handleDbExceptions).toHaveBeenCalled();
    });
  });

  describe('findAllTotal', () => {
    it('returns total count as number', async () => {
      repo.query.mockResolvedValueOnce([{ total: '42' }]);

      const result = await service.findAllTotal({ search: 'x' } as any, { roles: [] } as any);

      expect(result).toEqual({ total: 42, errorCode: ErrorCode.NONE });
    });

    it('returns 0 when query returns nothing', async () => {
      repo.query.mockResolvedValueOnce([]);

      const result = await service.findAllTotal({} as any, { roles: [] } as any);

      expect(result).toEqual({ total: 0, errorCode: ErrorCode.NONE });
    });

    it('handles DB errors', async () => {
      repo.query.mockRejectedValueOnce(new Error('x'));
      await expect(service.findAllTotal({} as any, { roles: [] } as any)).rejects.toThrow('x');
    });
  });

  describe('findOne', () => {
    it('returns the incident wrapped with NONE error code', async () => {
      repo.findOne.mockResolvedValueOnce({ id: 1 });

      const result = await service.findOne(1);

      expect(repo.findOne).toHaveBeenCalledWith({ where: { id: 1 } });
      expect(result).toEqual({ incident: { id: 1 }, errorCode: ErrorCode.NONE });
    });
  });

  describe('update', () => {
    it('transactional path saves preloaded entity', async () => {
      repo.preload.mockResolvedValueOnce({ id: 1, description: 'x' });

      const result = await service.update(1, { description: 'x' } as any, 1);

      expect(repo.save).toHaveBeenCalled();
      expect(result.errorCode).toBe(ErrorCode.NONE);
    });

    it('transactional path returns NOT_FOUND when preload yields nothing', async () => {
      repo.preload.mockResolvedValueOnce(undefined);

      const result = await service.update(1, {} as any, 1);

      expect(result).toEqual({ incident: null, errorCode: ErrorCode.NOT_FOUND });
    });

    it('historical path: NOT_FOUND when current row has no createdAt', async () => {
      repo.findOne.mockResolvedValueOnce(null);

      const result = await service.update(1, {} as any, 0);

      expect(result).toEqual({ incident: null, errorCode: ErrorCode.NOT_FOUND });
    });

    it('historical path: returns NONE when historical table does not exist', async () => {
      repo.findOne.mockResolvedValueOnce({ id: 1, createdAt: new Date('2026-03-15') });
      repo.query.mockResolvedValueOnce([{ exists: false }]);

      const result = await service.update(1, {} as any, 0);

      expect(result).toEqual({ incident: null, errorCode: ErrorCode.NONE });
    });

    it('historical path: runs update on the historical table when it exists', async () => {
      repo.findOne.mockResolvedValueOnce({ id: 1, createdAt: new Date('2026-03-15') });
      repo.query.mockResolvedValueOnce([{ exists: true }]);
      repo.__qb.execute.mockResolvedValueOnce({ raw: [{ id: 1, internalState: 200 }] });

      const result = await service.update(1, { description: 'y' } as any, 0);

      expect(repo.createQueryBuilder).toHaveBeenCalled();
      expect(repo.__qb.update).toHaveBeenCalledWith('history."2026_03_incident"');
      expect(result).toEqual({ incident: { id: 1, internalState: 200 }, errorCode: ErrorCode.NONE });
    });

    it('historical path: returns null incident when nothing was updated', async () => {
      repo.findOne.mockResolvedValueOnce({ id: 1, createdAt: new Date('2026-03-15') });
      repo.query.mockResolvedValueOnce([{ exists: true }]);
      repo.__qb.execute.mockResolvedValueOnce({ raw: [] });

      const result = await service.update(1, {} as any, 0);

      expect(result).toEqual({ incident: null, errorCode: ErrorCode.NONE });
    });

    it('routes errors through handleDbExceptions', async () => {
      repo.preload.mockRejectedValueOnce(new Error('p'));
      await expect(service.update(1, {} as any, 1)).rejects.toThrow('p');
    });
  });

  describe('updateStatusGim', () => {
    it('saves preloaded entity when found', async () => {
      repo.preload.mockResolvedValueOnce({ id: 1 });

      const result = await service.updateStatusGim(1, {} as any);

      expect(repo.save).toHaveBeenCalled();
      expect(result).toEqual({ incident: { id: 1 }, errorCode: ErrorCode.NONE });
    });

    it('returns undefined when preload yields nothing', async () => {
      repo.preload.mockResolvedValueOnce(undefined);
      const result = await service.updateStatusGim(1, {} as any);
      expect(result).toBeUndefined();
    });

    it('handles errors', async () => {
      repo.preload.mockRejectedValueOnce(new Error('e'));
      await expect(service.updateStatusGim(1, {} as any)).rejects.toThrow('e');
    });
  });

  describe('uploadToAlfresco', () => {
    const env = process.env;

    beforeEach(() => {
      process.env = {
        ...env,
        ALFRESCO_BASE_URL: 'http://alf',
        ALFRESCO_USER: 'u',
        ALFRESCO_PASS: 'p',
        ALFRESCO_DIR: 'dir-id',
      };
    });

    afterAll(() => {
      process.env = env;
    });

    it('returns HTTP_ERROR_REINTENT when Alfresco env vars are missing', async () => {
      delete process.env.ALFRESCO_BASE_URL;
      const result = await service.uploadToAlfresco(Buffer.from('x'), 'f.pdf');
      expect(result).toEqual({ errorCode: ErrorCode.HTTP_ERROR_REINTENT });
    });

    it('uploads file and returns the Alfresco entry on success', async () => {
      (axios.request as jest.Mock).mockResolvedValueOnce({
        data: { entry: { id: 'node-1' } },
      });

      const result = await service.uploadToAlfresco(Buffer.from('x'), 'f.pdf', 'sub/dir');

      expect(axios.request).toHaveBeenCalled();
      expect(result).toEqual({
        errorCode: ErrorCode.NONE,
        alfrescoData: { entry: { id: 'node-1' } },
      });
    });

    it('returns HTTP_ERROR_REINTENT when response has no entry', async () => {
      (axios.request as jest.Mock).mockResolvedValueOnce({ data: {} });
      const result = await service.uploadToAlfresco(Buffer.from('x'), 'f.pdf');
      expect(result).toEqual({ errorCode: ErrorCode.HTTP_ERROR_REINTENT });
    });

    it('returns HTTP_ERROR_REINTENT on axios error', async () => {
      (axios.request as jest.Mock).mockRejectedValueOnce({ response: { data: { msg: 'fail' } } });
      const result = await service.uploadToAlfresco(Buffer.from('x'), 'f.pdf');
      expect(result).toEqual({ errorCode: ErrorCode.HTTP_ERROR_REINTENT });
    });
  });

  describe('getFileUrlAlfresco', () => {
    const env = process.env;

    beforeEach(() => {
      process.env = {
        ...env,
        ALFRESCO_BASE_URL: 'http://alf',
        ALFRESCO_USER: 'u',
        ALFRESCO_PASS: 'p',
        ALFRESCO_BASE_URL_PUBLIC: 'http://public',
      };
    });

    afterAll(() => {
      process.env = env;
    });

    it('returns HTTP_ERROR_REINTENT when env is missing', async () => {
      delete process.env.ALFRESCO_BASE_URL;
      const result = await service.getFileUrlAlfresco('node-1');
      expect(result).toEqual({ errorCode: ErrorCode.HTTP_ERROR_REINTENT });
    });

    it('returns HTTP_ERROR_REINTENT when alfrescoId is empty', async () => {
      const result = await service.getFileUrlAlfresco('');
      expect(result).toEqual({ errorCode: ErrorCode.HTTP_ERROR_REINTENT });
    });

    it('builds the public shared URL on success', async () => {
      (axios.request as jest.Mock).mockResolvedValueOnce({
        data: { entry: { id: 'shared-1' } },
      });

      const result: any = await service.getFileUrlAlfresco('node-1');

      expect(result.errorCode).toBe(ErrorCode.NONE);
      expect(result.sharedId).toBe('shared-1');
      expect(result.sharedUrl).toContain('http://public');
      expect(result.sharedUrl).toContain('shared-1');
    });

    it('returns HTTP_ERROR_REINTENT when response has no entry id', async () => {
      (axios.request as jest.Mock).mockResolvedValueOnce({ data: { entry: {} } });
      const result = await service.getFileUrlAlfresco('node-1');
      expect(result).toEqual({ errorCode: ErrorCode.HTTP_ERROR_REINTENT });
    });

    it('returns HTTP_ERROR_REINTENT on axios error', async () => {
      (axios.request as jest.Mock).mockRejectedValueOnce({ response: { data: {} } });
      const result = await service.getFileUrlAlfresco('node-1');
      expect(result).toEqual({ errorCode: ErrorCode.HTTP_ERROR_REINTENT });
    });
  });

  describe('remove', () => {
    it('marks the incident as deactivated when found', async () => {
      repo.findOne.mockResolvedValueOnce({ id: 1, isActivated: true });

      const result = await service.remove(1);

      expect(repo.save).toHaveBeenCalledWith(expect.objectContaining({ isActivated: false }));
      expect(result?.errorCode).toBe(ErrorCode.NONE);
    });

    it('returns undefined when incident not found', async () => {
      repo.findOne.mockResolvedValueOnce(null);
      const result = await service.remove(1);
      expect(result).toBeUndefined();
    });

    it('handles errors', async () => {
      repo.findOne.mockRejectedValueOnce(new Error('e'));
      await expect(service.remove(1)).rejects.toThrow('e');
    });
  });

  describe('findStatistics', () => {
    it('returns NOT_FOUND when no rows match', async () => {
      repo.query.mockResolvedValueOnce([]);
      const result = await service.findStatistics({} as any);
      expect(result?.errorCode).toBe(ErrorCode.NOT_FOUND);
    });

    it('returns rows when present', async () => {
      repo.query.mockResolvedValueOnce([{ incidentTypeId: 1, total: '3', name: 'x' }]);
      const result: any = await service.findStatistics({ search: 'x' } as any);
      expect(result.errorCode).toBe(ErrorCode.NONE);
      expect(result.incidents).toHaveLength(1);
    });

    it('handles errors', async () => {
      repo.query.mockRejectedValueOnce(new Error('e'));
      await expect(service.findStatistics({} as any)).rejects.toThrow('e');
    });
  });

  describe('findStatisticsByFraction', () => {
    it('returns NOT_FOUND when empty', async () => {
      repo.query.mockResolvedValueOnce([]);
      const result = await service.findStatisticsByFraction({} as any);
      expect(result?.errorCode).toBe(ErrorCode.NOT_FOUND);
    });

    it('returns results when present', async () => {
      repo.query.mockResolvedValueOnce([{ total: '1' }]);
      const result: any = await service.findStatisticsByFraction({ search: 'a' } as any);
      expect(result.errorCode).toBe(ErrorCode.NONE);
    });

    it('handles errors', async () => {
      repo.query.mockRejectedValueOnce(new Error('e'));
      await expect(service.findStatisticsByFraction({} as any)).rejects.toThrow('e');
    });
  });

  describe('_buildConditionsAndParametersPg (via findStatistics)', () => {
    it('ignores empty/undefined/null search strings', async () => {
      repo.query.mockResolvedValueOnce([{}]);
      await service.findStatistics({ search: '  ' } as any);
      const [, params] = repo.query.mock.calls[0];
      // No %  % pattern should have been pushed for whitespace-only search.
      expect(params).not.toContain('%  %');
    });

    it('builds clauses for every supported filter', async () => {
      repo.query.mockResolvedValueOnce([{}]);

      await service.findStatistics({
        search: 'q',
        incidentTypeId: 1,
        statusIncident: 2,
        dateFrom: '2026-01-01',
        dateTo: '2026-01-31',
        zoneId: 3,
        blockId: 4,
        userId: 5,
        blockOperatorId: 6,
        incidentCategory: 7,
      } as any);

      const [sql, params] = repo.query.mock.calls[0];
      expect(sql).toContain('i."incidentTypeId" =');
      expect(sql).toContain('i."statusIncident" =');
      expect(sql).toContain('i."zoneId" =');
      expect(sql).toContain('i."blockId" =');
      expect(sql).toContain('i."controllerId" =');
      expect(sql).toContain('i."blockOperatorId" =');
      expect(sql).toContain('i."incidentCategory" =');
      expect(sql).toContain('DATE(i."createdAt") BETWEEN');
      expect(params).toContain(1);
      expect(params).toContain(2);
      expect(params).toContain('2026-01-01');
      expect(params).toContain('2026-01-31');
    });

    it('uses literal "undefined" / "null" search strings as no-op', async () => {
      repo.query.mockResolvedValueOnce([{}]);
      await service.findStatistics({ search: 'undefined' } as any);
      const [, params1] = repo.query.mock.calls[0];
      expect(params1.length).toBe(0);

      repo.query.mockResolvedValueOnce([{}]);
      await service.findStatistics({ search: 'null' } as any);
      const [, params2] = repo.query.mock.calls[1];
      expect(params2.length).toBe(0);
    });
  });

  describe('findAllFractionSanction', () => {
    it('queries main table when no year/month', async () => {
      repo.query.mockResolvedValueOnce([{ id: 1 }]);
      const result: any = await service.findAllFractionSanction({} as any);
      expect(result.fractionSanction).toEqual([{ id: 1 }]);
      expect(repo.query.mock.calls[0][0]).toContain('public.incident');
    });

    it('uses historical incident and fraction tables when both exist', async () => {
      // tableExists for incident -> true, tableExists for fraction -> true,
      // then the actual query.
      repo.query
        .mockResolvedValueOnce([{ exists: true }])
        .mockResolvedValueOnce([{ exists: true }])
        .mockResolvedValueOnce([{ id: 9 }]);

      const result: any = await service.findAllFractionSanction({
        year: 2026,
        month: 3,
        typeFractionId: 99,
        limit: 5,
        offset: 0,
      } as any);

      expect(result.fractionSanction).toEqual([{ id: 9 }]);
      expect(repo.query.mock.calls[2][0]).toContain('history."2026_03_incident"');
      expect(repo.query.mock.calls[2][0]).toContain('history."2026_03_fraction"');
      // typeFractionId condition appended.
      expect(repo.query.mock.calls[2][1]).toContain(99);
    });

    it('keeps public.fraction when only the incident archive exists', async () => {
      // tableExists for incident -> true, tableExists for fraction -> false,
      // then the actual query. Mixing historical incidents with public fractions
      // is unsafe, so the join must stay on public.fraction in that case.
      repo.query
        .mockResolvedValueOnce([{ exists: true }])
        .mockResolvedValueOnce([{ exists: false }])
        .mockResolvedValueOnce([{ id: 10 }]);

      const result: any = await service.findAllFractionSanction({
        year: 2026,
        month: 3,
        limit: 5,
        offset: 0,
      } as any);

      expect(result.fractionSanction).toEqual([{ id: 10 }]);
      expect(repo.query.mock.calls[2][0]).toContain('history."2026_03_incident"');
      expect(repo.query.mock.calls[2][0]).toContain('public.fraction');
      expect(repo.query.mock.calls[2][0]).not.toContain('history."2026_03_fraction"');
    });

    it('skips historical lookup when year/month invalid', async () => {
      repo.query.mockResolvedValueOnce([]);
      await service.findAllFractionSanction({ year: 1999, month: 1 } as any);
      expect(repo.query.mock.calls[0][0]).toContain('public.incident');
    });

    it('coerces non-numeric limit/offset to zero (NaN path)', async () => {
      repo.query.mockResolvedValueOnce([]);
      await service.findAllFractionSanction({ limit: 'abc' as any, offset: 'xyz' as any } as any);
      const params = repo.query.mock.calls[0][1];
      expect(params[params.length - 2]).toBe(0);
      expect(params[params.length - 1]).toBe(0);
    });

    it('handles errors', async () => {
      repo.query.mockRejectedValueOnce(new Error('e'));
      await expect(service.findAllFractionSanction({} as any)).rejects.toThrow('e');
    });
  });

  describe('findAllFractionSanctionTotal', () => {
    it('returns 0 when no rows', async () => {
      repo.query.mockResolvedValueOnce([]);
      const result = await service.findAllFractionSanctionTotal({} as any);
      expect(result).toEqual({ total: 0 });
    });

    it('returns parsed total when rows present', async () => {
      repo.query.mockResolvedValueOnce([{ total: '7' }]);
      const result = await service.findAllFractionSanctionTotal({} as any);
      expect(result).toEqual({ total: 7 });
    });

    it('appends extra conditions when filters provided', async () => {
      repo.query.mockResolvedValueOnce([{ total: '3' }]);

      const result = await service.findAllFractionSanctionTotal({
        search: 'q',
        zoneId: 1,
      } as any);

      expect(result).toEqual({ total: 3 });
      expect(repo.query.mock.calls[0][0]).toContain(' AND ');
    });

    it('uses historical incident and fraction tables when both exist', async () => {
      repo.query
        .mockResolvedValueOnce([{ exists: true }])
        .mockResolvedValueOnce([{ exists: true }])
        .mockResolvedValueOnce([{ total: '2' }]);

      const result = await service.findAllFractionSanctionTotal({ year: 2026, month: 3 } as any);

      expect(result).toEqual({ total: 2 });
      expect(repo.query.mock.calls[2][0]).toContain('history."2026_03_incident"');
      expect(repo.query.mock.calls[2][0]).toContain('history."2026_03_fraction"');
    });

    it('keeps public.fraction in total when only the incident archive exists', async () => {
      repo.query
        .mockResolvedValueOnce([{ exists: true }])
        .mockResolvedValueOnce([{ exists: false }])
        .mockResolvedValueOnce([{ total: '4' }]);

      const result = await service.findAllFractionSanctionTotal({ year: 2026, month: 3 } as any);

      expect(result).toEqual({ total: 4 });
      expect(repo.query.mock.calls[2][0]).toContain('history."2026_03_incident"');
      expect(repo.query.mock.calls[2][0]).toContain('public.fraction');
      expect(repo.query.mock.calls[2][0]).not.toContain('history."2026_03_fraction"');
    });

    it('total query joins to zone, block and fraction so it matches the list', async () => {
      repo.query.mockResolvedValueOnce([{ total: '5' }]);

      const result = await service.findAllFractionSanctionTotal({} as any);

      expect(result).toEqual({ total: 5 });
      const sql = repo.query.mock.calls[0][0];
      expect(sql).toContain('INNER JOIN public.zone z');
      expect(sql).toContain('INNER JOIN public.block b');
      expect(sql).toContain('public.fraction f');
    });

    it('applies typeFractionId filter on the total query', async () => {
      repo.query.mockResolvedValueOnce([{ total: '1' }]);

      const result = await service.findAllFractionSanctionTotal({ typeFractionId: 99 } as any);

      expect(result).toEqual({ total: 1 });
      const sql = repo.query.mock.calls[0][0];
      const params = repo.query.mock.calls[0][1];
      expect(sql).toContain('f."typeFraction"');
      expect(params).toContain(99);
    });

    it('handles errors', async () => {
      repo.query.mockRejectedValueOnce(new Error('e'));
      await expect(service.findAllFractionSanctionTotal({} as any)).rejects.toThrow('e');
    });
  });

  describe('_tableExists (private)', () => {
    it('returns false and logs when no schema is provided', async () => {
      const result = await (service as any)._tableExists('incident');
      expect(result).toBe(false);
      expect(repo.query).not.toHaveBeenCalled();
    });

    it('returns true when information_schema confirms existence', async () => {
      repo.query.mockResolvedValueOnce([{ exists: true }]);
      const result = await (service as any)._tableExists('history."2026_03_incident"');
      expect(result).toBe(true);
      // Schema and name are passed as parameters, not interpolated.
      expect(repo.query.mock.calls[0][1]).toEqual(['history', '2026_03_incident']);
    });

    it('returns false when query result is empty', async () => {
      repo.query.mockResolvedValueOnce([]);
      const result = await (service as any)._tableExists('a.b');
      expect(result).toBe(false);
    });
  });

  describe('findAllTotalVehicleClientTime', () => {
    it('queries main tables when year/month omitted', async () => {
      repo.query.mockResolvedValueOnce([{ totalVehicle: 1 }]);
      const result: any = await service.findAllTotalVehicleClientTime({} as any);
      expect(result.fractionSanction).toEqual([{ totalVehicle: 1 }]);
    });

    it('uses historical tables when both exist and applies typeFractionId', async () => {
      repo.query
        .mockResolvedValueOnce([{ exists: true }]) // incident exists
        .mockResolvedValueOnce([{ exists: true }]) // fraction exists
        .mockResolvedValueOnce([{ totalVehicle: 2 }]);

      const result: any = await service.findAllTotalVehicleClientTime({
        year: 2026,
        month: 3,
        typeFractionId: 99,
      } as any);

      expect(result.fractionSanction).toEqual([{ totalVehicle: 2 }]);
      const finalSql = repo.query.mock.calls[2][0];
      expect(finalSql).toContain('history."2026_03_incident"');
      expect(finalSql).toContain('history."2026_03_fraction"');
      expect(repo.query.mock.calls[2][1]).toContain(99);
    });

    it('handles errors', async () => {
      repo.query.mockRejectedValueOnce(new Error('e'));
      await expect(service.findAllTotalVehicleClientTime({} as any)).rejects.toThrow('e');
    });
  });

  describe('findAllStatisticsFractionSanction', () => {
    it('queries main tables when no historical', async () => {
      repo.query.mockResolvedValueOnce([{ idZone: 1 }]);
      const result: any = await service.findAllStatisticsFractionSanction({} as any);
      expect(result.fractionSanction).toEqual([{ idZone: 1 }]);
    });

    it('uses historical tables when both exist and applies typeFractionId', async () => {
      repo.query
        .mockResolvedValueOnce([{ exists: true }])
        .mockResolvedValueOnce([{ exists: true }])
        .mockResolvedValueOnce([{ idZone: 2 }]);

      const result: any = await service.findAllStatisticsFractionSanction({
        year: 2026,
        month: 3,
        typeFractionId: 7,
      } as any);

      expect(result.fractionSanction).toEqual([{ idZone: 2 }]);
      expect(repo.query.mock.calls[2][1]).toContain(7);
    });

    it('handles errors', async () => {
      repo.query.mockRejectedValueOnce(new Error('e'));
      await expect(service.findAllStatisticsFractionSanction({} as any)).rejects.toThrow('e');
    });
  });

  describe('findAndSincronizeToEmit', () => {
    it('returns empty result when year/month invalid', async () => {
      const result = await service.findAndSincronizeToEmit(1, 'dev', { year: 1, month: 1 } as any, 1);
      expect(result?.errorCode).toBe(ErrorCode.NONE);
      expect((result as any).incidents).toEqual([]);
    });

    it('returns NOT_FOUND when no incidents match', async () => {
      repo.query.mockResolvedValueOnce([]);
      const result = await service.findAndSincronizeToEmit(1, 'dev', {} as any, 1);
      expect(result?.errorCode).toBe(ErrorCode.NOT_FOUND);
    });

    it('iterates incidents and pushes those matching GIM as supplied', async () => {
      repo.query.mockResolvedValueOnce([
        { id: 1, nroTicket: 'T1', identityCard: 'ID1' },
        { id: 2, nroTicket: 'T2', identityCard: 'ID2' },
      ]);
      gim.findObligationsByCitation
        .mockResolvedValueOnce({ errorCode: ErrorCode.NONE, data: [{}] })
        .mockResolvedValueOnce({ errorCode: ErrorCode.NOT_FOUND, data: [] });
      gim.validateStatusWithGim.mockResolvedValueOnce({ errorCode: ErrorCode.NONE });

      const result: any = await service.findAndSincronizeToEmit(1, 'dev', {} as any, 1);

      expect(result.errorCode).toBe(ErrorCode.NONE);
      expect(result.incidents).toHaveLength(1);
      expect(result.incidents[0].id).toBe(1);
    });

    it('short-circuits when validateStatusWithGim returns an error', async () => {
      repo.query.mockResolvedValueOnce([{ id: 1, nroTicket: 'T1', identityCard: 'ID1' }]);
      gim.findObligationsByCitation.mockResolvedValueOnce({ errorCode: ErrorCode.NONE, data: [] });
      gim.validateStatusWithGim.mockResolvedValueOnce({
        errorCode: ErrorCode.NOT_FOUND,
        message: 'fail',
        data: { x: 1 },
      });

      const result: any = await service.findAndSincronizeToEmit(1, 'dev', {} as any, 1);

      expect(result.errorCode).toBe(ErrorCode.NOT_FOUND);
      expect(result.message).toBe('fail');
    });

    it('messageInfo signals "no incidencias" when nothing was supplied', async () => {
      repo.query.mockResolvedValueOnce([{ id: 1, nroTicket: 'T1' }]);
      gim.findObligationsByCitation.mockResolvedValueOnce({ errorCode: ErrorCode.NOT_FOUND, data: [] });

      const result: any = await service.findAndSincronizeToEmit(1, 'dev', {} as any, 1);

      expect(result.incidents).toEqual([]);
      expect(result.message).toContain('No se encontraron');
    });

    it('uses historical table when it exists', async () => {
      repo.query
        .mockResolvedValueOnce([{ exists: true }])
        .mockResolvedValueOnce([]);

      await service.findAndSincronizeToEmit(1, 'dev', { year: 2026, month: 3 } as any, 1);

      expect(repo.query.mock.calls[1][0]).toContain('history."2026_03_incident"');
    });

    it('returns empty when historical table missing', async () => {
      repo.query.mockResolvedValueOnce([{ exists: false }]);
      const result = await service.findAndSincronizeToEmit(1, 'dev', { year: 2026, month: 3 } as any, 1);
      expect((result as any).incidents).toEqual([]);
    });

    it('handles DB errors', async () => {
      repo.query.mockRejectedValueOnce(new Error('e'));
      await expect(service.findAndSincronizeToEmit(1, 'dev', {} as any, 1)).rejects.toThrow('e');
    });

    it('appends NOT IN clause for excluded statuses', async () => {
      repo.query.mockResolvedValueOnce([]);
      await service.findAndSincronizeToEmit(1, 'dev', {} as any, 1);
      const [sql, params] = repo.query.mock.calls[0];
      expect(sql).toContain('i."statusIncident" NOT IN');
      expect(params).toContain(IncidentStatus.SUPPLIED);
      expect(params).toContain(IncidentStatus.PAYED);
    });
  });

  describe('findAllNotification', () => {
    it('returns rows with parameterized LIMIT/OFFSET', async () => {
      repo.query.mockResolvedValueOnce([{ id: 1 }]);

      const result = await service.findAllNotification({ limit: 5, offset: 2 } as any);

      expect(result?.errorCode).toBe(ErrorCode.NONE);
      const [sql, params] = repo.query.mock.calls[0];
      expect(sql).toContain('LIMIT $1 OFFSET $2');
      expect(params).toEqual([5, 2]);
    });

    it('uses defaults when limit/offset omitted', async () => {
      repo.query.mockResolvedValueOnce([]);
      await service.findAllNotification({} as any);
      expect(repo.query.mock.calls[0][1]).toEqual([30, 0]);
    });

    it('coerces unsafe limit/offset to safe integers', async () => {
      repo.query.mockResolvedValueOnce([]);
      await service.findAllNotification({ limit: -1, offset: -5 } as any);
      expect(repo.query.mock.calls[0][1]).toEqual([0, 0]);
    });

    it('coerces non-numeric limit/offset to zero (NaN path)', async () => {
      repo.query.mockResolvedValueOnce([]);
      await service.findAllNotification({ limit: 'abc' as any, offset: 'xyz' as any } as any);
      expect(repo.query.mock.calls[0][1]).toEqual([0, 0]);
    });

    it('handles errors', async () => {
      repo.query.mockRejectedValueOnce(new Error('e'));
      await expect(service.findAllNotification({} as any)).rejects.toThrow('e');
    });
  });

  describe('advanceNextProcess', () => {
    it('returns NOT_FOUND when identityCard missing', async () => {
      const result = await service.advanceNextProcess(1, 'dev', { nroTicket: 'T' } as any, 1);
      expect(result.errorCode).toBe(ErrorCode.NOT_FOUND);
    });

    it('returns NOT_FOUND when nroTicket missing', async () => {
      const result = await service.advanceNextProcess(1, 'dev', { identityCard: 'X' } as any, 1);
      expect(result.errorCode).toBe(ErrorCode.NOT_FOUND);
    });

    it('SIMERT_ADMINISTRATION -> TRAFFIC_POLICE_STATION', async () => {
      gim.findObligationsByCitation.mockResolvedValueOnce({ errorCode: ErrorCode.NOT_FOUND, data: [] });
      repo.preload.mockImplementationOnce(async (e: any) => e);

      const result = await service.advanceNextProcess(1, 'dev', {
        id: 1,
        identityCard: 'X',
        nroTicket: 'T',
        internalState: InternalStateIncident.SIMERT_ADMINISTRATION,
      } as any, 1);

      expect(repo.save).toHaveBeenCalledWith(expect.objectContaining({
        internalState: InternalStateIncident.TRAFFIC_POLICE_STATION,
      }));
      expect(result.errorCode).toBe(ErrorCode.NONE);
    });

    it('TRAFFIC_POLICE_STATION -> REVENUE_DEPARTMENT', async () => {
      gim.findObligationsByCitation.mockResolvedValueOnce({ errorCode: ErrorCode.NOT_FOUND, data: [] });
      repo.preload.mockImplementationOnce(async (e: any) => e);

      const result = await service.advanceNextProcess(1, 'dev', {
        id: 1,
        identityCard: 'X',
        nroTicket: 'T',
        internalState: InternalStateIncident.TRAFFIC_POLICE_STATION,
      } as any, 1);

      expect(repo.save).toHaveBeenCalledWith(expect.objectContaining({
        internalState: InternalStateIncident.REVENUE_DEPARTMENT,
      }));
      expect(result.errorCode).toBe(ErrorCode.NONE);
    });

    it('REVENUE_DEPARTMENT -> REVENUE_DEPARTMENT (terminal)', async () => {
      gim.findObligationsByCitation.mockResolvedValueOnce({ errorCode: ErrorCode.NOT_FOUND, data: [] });
      repo.preload.mockImplementationOnce(async (e: any) => e);

      const result = await service.advanceNextProcess(1, 'dev', {
        id: 1,
        identityCard: 'X',
        nroTicket: 'T',
        internalState: InternalStateIncident.REVENUE_DEPARTMENT,
      } as any, 1);

      expect(repo.save).toHaveBeenCalledWith(expect.objectContaining({
        internalState: InternalStateIncident.REVENUE_DEPARTMENT,
      }));
      expect(result.errorCode).toBe(ErrorCode.NONE);
    });

    it('GIM returns existing obligation -> jumps to REVENUE_DEPARTMENT', async () => {
      gim.findObligationsByCitation.mockResolvedValueOnce({ errorCode: ErrorCode.NONE, data: [{ x: 1 }] });
      repo.preload.mockImplementationOnce(async (e: any) => e);

      const result = await service.advanceNextProcess(1, 'dev', {
        id: 1,
        identityCard: 'X',
        nroTicket: 'T',
        internalState: InternalStateIncident.SIMERT_ADMINISTRATION,
      } as any, 1);

      expect(repo.save).toHaveBeenCalledWith(expect.objectContaining({
        internalState: InternalStateIncident.REVENUE_DEPARTMENT,
      }));
      expect(result.errorCode).toBe(ErrorCode.NONE);
    });

    it('transactional path returns NOT_FOUND when preload yields nothing', async () => {
      gim.findObligationsByCitation.mockResolvedValueOnce({ errorCode: ErrorCode.NOT_FOUND, data: [] });
      repo.preload.mockResolvedValueOnce(undefined);

      const result = await service.advanceNextProcess(1, 'dev', {
        id: 1,
        identityCard: 'X',
        nroTicket: 'T',
        internalState: InternalStateIncident.SIMERT_ADMINISTRATION,
      } as any, 1);

      expect(result.errorCode).toBe(ErrorCode.NOT_FOUND);
    });

    it('historical path: NOT_FOUND when current row missing', async () => {
      gim.findObligationsByCitation.mockResolvedValueOnce({ errorCode: ErrorCode.NOT_FOUND, data: [] });
      repo.findOne.mockResolvedValueOnce(null);

      const result = await service.advanceNextProcess(1, 'dev', {
        id: 1,
        identityCard: 'X',
        nroTicket: 'T',
        internalState: InternalStateIncident.SIMERT_ADMINISTRATION,
      } as any, 0);

      expect(result.errorCode).toBe(ErrorCode.NOT_FOUND);
    });

    it('historical path: NONE when historical table does not exist', async () => {
      gim.findObligationsByCitation.mockResolvedValueOnce({ errorCode: ErrorCode.NOT_FOUND, data: [] });
      repo.findOne.mockResolvedValueOnce({ id: 1, createdAt: new Date('2026-03-15') });
      repo.query.mockResolvedValueOnce([{ exists: false }]);

      const result = await service.advanceNextProcess(1, 'dev', {
        id: 1,
        identityCard: 'X',
        nroTicket: 'T',
        internalState: InternalStateIncident.SIMERT_ADMINISTRATION,
      } as any, 0);

      expect(result.errorCode).toBe(ErrorCode.NONE);
    });

    it('historical path: updates and returns NONE when row found', async () => {
      gim.findObligationsByCitation.mockResolvedValueOnce({ errorCode: ErrorCode.NOT_FOUND, data: [] });
      repo.findOne.mockResolvedValueOnce({ id: 1, createdAt: new Date('2026-03-15') });
      repo.query.mockResolvedValueOnce([{ exists: true }]);
      repo.__qb.execute.mockResolvedValueOnce({ raw: [{ id: 1, internalState: 200 }] });

      const result = await service.advanceNextProcess(1, 'dev', {
        id: 1,
        identityCard: 'X',
        nroTicket: 'T',
        internalState: InternalStateIncident.SIMERT_ADMINISTRATION,
      } as any, 0);

      expect(result.errorCode).toBe(ErrorCode.NONE);
      expect(repo.__qb.update).toHaveBeenCalledWith('history."2026_03_incident"');
    });

    it('historical path: NOT_FOUND when update returns no rows', async () => {
      gim.findObligationsByCitation.mockResolvedValueOnce({ errorCode: ErrorCode.NOT_FOUND, data: [] });
      repo.findOne.mockResolvedValueOnce({ id: 1, createdAt: new Date('2026-03-15') });
      repo.query.mockResolvedValueOnce([{ exists: true }]);
      repo.__qb.execute.mockResolvedValueOnce({ raw: [] });

      const result = await service.advanceNextProcess(1, 'dev', {
        id: 1,
        identityCard: 'X',
        nroTicket: 'T',
        internalState: InternalStateIncident.SIMERT_ADMINISTRATION,
      } as any, 0);

      expect(result.errorCode).toBe(ErrorCode.NOT_FOUND);
    });
  });
});
