import { ErrorCode } from 'src/common/glob/error';

import { TrakingService } from '../traking.service';

const buildRepoMock = () => ({
  query: jest.fn(),
});

const buildDataSourceMock = () => ({
  query: jest.fn(),
});

describe('TrakingService', () => {
  let service: TrakingService;
  let repo: ReturnType<typeof buildRepoMock>;
  let dataSource: ReturnType<typeof buildDataSourceMock>;

  beforeEach(() => {
    repo = buildRepoMock();
    dataSource = buildDataSourceMock();
    service = new TrakingService(repo as any, dataSource as any);
    // Silence the internal Logger so test output stays clean.
    (service as any).logger = { error: jest.fn(), log: jest.fn(), debug: jest.fn(), warn: jest.fn() };
  });

  describe('plot', () => {
    const baseDto = (overrides: Partial<{ p: string; l: string; t: number }> = {}) => ({
      // Build the comma-separated payload the service splits.
      // Index map: 0:_, 1:version, 2:distOn, 3:distOff, 4:vehicleId,
      // 5:lat, 6:lng, 7:alt, 8:speed, 9:acc, 10:heading, 11:status,
      // 12:activity, 13:taken, 14:gps, 15:battery, 16:carrier, 17:network,
      // 18:platform, 19:versionos, 20:typeconnection
      p: '_,v1,0,0,123,1.0,-1.0,10,5,2,90,A,RUN,T,gps,bat,car,net,plat,osv,wifi',
      l: 'polyline-xyz',
      t: 42,
      ...overrides,
    });

    it('returns early when p is falsy', async () => {
      const result = await service.plot(1, { p: '', l: '', t: 0 } as any);
      expect(result).toBeUndefined();
      expect(repo.query).not.toHaveBeenCalled();
      expect(dataSource.query).not.toHaveBeenCalled();
    });

    it('updates existing row, does not insert when affected rows > 0', async () => {
      // First call -> UPDATE; affected count at index 1 is non-zero.
      repo.query.mockResolvedValueOnce([[], 1]);
      // Inner _registerTraking: CREATE TABLE then INSERT.
      dataSource.query.mockResolvedValueOnce(undefined).mockResolvedValueOnce(undefined);

      const result = await service.plot(7, baseDto() as any);

      expect(result).toBe(true);
      // Only one repo.query call (UPDATE) — no INSERT into public.l.
      expect(repo.query).toHaveBeenCalledTimes(1);
      expect(repo.query.mock.calls[0][0]).toContain('UPDATE public.l');
    });

    it('inserts new row in public.l when UPDATE returns 0 affected rows', async () => {
      repo.query
        .mockResolvedValueOnce([[], 0]) // UPDATE -> nothing affected
        .mockResolvedValueOnce(undefined); // INSERT path
      dataSource.query.mockResolvedValue(undefined);

      const result = await service.plot(7, baseDto() as any);

      expect(result).toBe(true);
      expect(repo.query).toHaveBeenCalledTimes(2);
      expect(repo.query.mock.calls[1][0]).toContain('INSERT INTO public.l');
    });

    it('swallows errors and still returns true', async () => {
      repo.query.mockRejectedValueOnce(new Error('boom'));
      const result = await service.plot(7, baseDto() as any);
      expect(result).toBe(true);
    });

    it('_registerTraking: only issues CREATE TABLE once per month (caches table name)', async () => {
      repo.query.mockResolvedValue([[], 1]);
      dataSource.query.mockResolvedValue(undefined);

      await service.plot(1, baseDto() as any);
      await service.plot(2, baseDto() as any);

      const createCalls = dataSource.query.mock.calls.filter(c =>
        String(c[0]).includes('CREATE TABLE IF NOT EXISTS'),
      );
      expect(createCalls.length).toBe(1);
    });

    it('_registerTraking: logs and swallows errors from the dataSource', async () => {
      repo.query.mockResolvedValue([[], 1]);
      dataSource.query.mockRejectedValueOnce(new Error('ds boom'));

      const result = await service.plot(1, baseDto() as any);

      expect(result).toBe(true);
    });

    it('_registerTraking: uses two-digit month when UTC month >= 10', async () => {
      repo.query.mockResolvedValue([[], 1]);
      dataSource.query.mockResolvedValue(undefined);
      jest.useFakeTimers().setSystemTime(new Date('2026-10-15T12:00:00.000Z'));
      try {
        await (service as any)._registerTraking(
          1, 1, '', 0, 0, 0, 'A', 'B', 0, 0, 0, {}, 'poly',
        );
        const createCall = dataSource.query.mock.calls.find(c =>
          String(c[0]).includes('CREATE TABLE'),
        );
        expect(String(createCall![0])).toContain('"2026_10_traking"');
      } finally {
        jest.useRealTimers();
      }
    });

    it('_registerTraking: falsy idDevice yields empty device string', async () => {
      repo.query.mockResolvedValue([[], 1]);
      dataSource.query.mockResolvedValue(undefined);

      await (service as any)._registerTraking(
        1, 1, '', 0, 0, 0, 'A', 'B', 0, 0, 0, {}, 'poly',
      );

      const insertCall = dataSource.query.mock.calls.find(c =>
        String(c[0]).includes('INSERT INTO'),
      );
      expect(insertCall).toBeDefined();
      expect(insertCall![1][4]).toBe('');
    });

    it('_registerTraking: trims idDevice when present (covers ternary truthy branch)', async () => {
      repo.query.mockResolvedValue([[], 1]);
      dataSource.query.mockResolvedValue(undefined);

      // Invoke the private method directly to exercise the truthy idDevice branch.
      await (service as any)._registerTraking(
        1, 1, 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaa123456', 0, 0, 0,
        'A', 'B', 0, 0, 0, {}, 'poly',
      );

      const insertCall = dataSource.query.mock.calls.find(c =>
        String(c[0]).includes('INSERT INTO'),
      );
      expect(insertCall).toBeDefined();
      // Index 4 of the INSERT params is the trimmed idDevice (chars 30..36).
      expect(insertCall![1][4]).toBe('123456');
    });
  });

  describe('getAllTracking', () => {
    it('runs two queries when from/to are on different days', async () => {
      dataSource.query
        .mockResolvedValueOnce([{ a: 1 }])
        .mockResolvedValueOnce([{ b: 2 }]);

      const from = new Date(2026, 2, 10, 6, 0, 0);
      const to = new Date(2026, 2, 12, 18, 0, 0);

      const result = await service.getAllTracking(99, from, to);

      expect(dataSource.query).toHaveBeenCalledTimes(2);
      expect(result.errorCode).toBe(ErrorCode.NONE);
      expect(result.trackings).toEqual([{ a: 1 }, { b: 2 }]);
      // Both should target a "YYYY_MM_traking" table reference.
      expect(dataSource.query.mock.calls[0][0]).toContain('_traking');
      expect(dataSource.query.mock.calls[1][0]).toContain('_traking');
    });

    it('runs a single query when from/to are on the same day', async () => {
      dataSource.query.mockResolvedValueOnce([{ a: 1 }]);

      // Use the same local date by constructing from local components.
      const from = new Date(2026, 2, 10, 6, 0, 0);
      const to = new Date(2026, 2, 10, 18, 0, 0);

      const result = await service.getAllTracking(99, from, to);

      expect(dataSource.query).toHaveBeenCalledTimes(1);
      expect(result).toEqual({ errorCode: ErrorCode.NONE, trackings: [{ a: 1 }] });
      const params = dataSource.query.mock.calls[0][1];
      // Single-partition path passes 4 params (date, userId, timeFrom, timeTo).
      expect(params).toHaveLength(4);
      expect(params[1]).toBe(99);
    });

    it('uses two-digit month directly when month >= 10 in single-partition path', async () => {
      dataSource.query.mockResolvedValueOnce([]);
      const from = new Date(2026, 9, 10, 6, 0, 0); // October same-day
      const to = new Date(2026, 9, 10, 18, 0, 0);
      await service.getAllTracking(1, from, to);
      expect(dataSource.query.mock.calls[0][0]).toContain('"2026_10_traking"');
    });

    it('uses two-digit month directly when month >= 10', async () => {
      dataSource.query
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);
      const from = new Date(2026, 9, 10, 6, 0, 0); // October
      const to = new Date(2026, 9, 12, 18, 0, 0);
      await service.getAllTracking(1, from, to);
      const sql1 = dataSource.query.mock.calls[0][0];
      const sql2 = dataSource.query.mock.calls[1][0];
      expect(sql1).toContain('"2026_10_traking"');
      expect(sql2).toContain('"2026_10_traking"');
    });

    it('zero-pads month < 10 in table name', async () => {
      dataSource.query.mockResolvedValueOnce([]);
      const from = new Date(2026, 2, 10, 6, 0, 0);
      const to = new Date(2026, 2, 10, 18, 0, 0);
      await service.getAllTracking(1, from, to);
      const sql = dataSource.query.mock.calls[0][0];
      // Local-time month for March is 03 in most TZs; allow either 02 or 03 to keep test deterministic.
      expect(sql).toMatch(/"\d{4}_(0[1-9]|1[0-2])_traking"/);
    });
  });

  describe('getTrackingByUserId', () => {
    it('returns NOT_FOUND when no rows match', async () => {
      repo.query.mockResolvedValueOnce([]);

      const result = await service.getTrackingByUserId(1);

      expect(result).toEqual({ errorCode: ErrorCode.NOT_FOUND });
    });

    it('returns mapped location object when row exists', async () => {
      const ts = new Date('2026-05-15T12:00:00.000Z');
      repo.query.mockResolvedValueOnce([
        {
          latitude: '1.5',
          longitude: '-2.5',
          heading: '90',
          timestamp: ts,
          polyline: 'p-xyz',
        },
      ]);

      const result = await service.getTrackingByUserId(7);

      expect(result).toEqual({
        errorCode: ErrorCode.NONE,
        lt: 1.5,
        lg: -2.5,
        direction: 90,
        date: ts,
        spriteSheet: '',
        polyline: 'p-xyz',
      });
      // Captures current behavior: query uses MySQL "?" placeholder against PG repo
      // (latent bug — kept as-is per audit). Verify parameters reach the driver.
      const [sql, params] = repo.query.mock.calls[0];
      expect(sql).toContain('?');
      expect(params).toEqual([7]);
    });
  });

  describe('getTrackings', () => {
    it('parses ids and returns NONE with locations', async () => {
      repo.query.mockResolvedValueOnce([
        { userId: 1, latitude: '1', longitude: '2', heading: '3', polyline: 'p' },
        { userId: 2, latitude: '4', longitude: '5', heading: '6', polyline: null },
      ]);

      const result = await service.getTrackings('1,2');

      expect(result.errorCode).toBe(ErrorCode.NONE);
      expect(result.locations).toHaveLength(2);
      // Captures current behavior: MySQL-style "?" placeholder passed unchanged.
      const [sql, params] = repo.query.mock.calls[0];
      expect(sql).toContain('?');
      expect(params).toEqual([[1, 2]]);
    });
  });
});
