import { ErrorCode } from 'src/common/glob/error';
import { TypeSizeVehicle } from 'src/common/glob/type/type_size_vehicle';

jest.mock('src/common/exceptions/error.db.exception', () => ({
  __esModule: true,
  default: jest.fn((error: any) => {
    throw error;
  }),
}));
import handleDbExceptions from 'src/common/exceptions/error.db.exception';

import { FractionService } from '../fraction.service';

const buildRepo = () => ({
  query: jest.fn(),
});

describe('FractionService', () => {
  let service: FractionService;
  let repo: ReturnType<typeof buildRepo>;

  beforeEach(() => {
    repo = buildRepo();
    service = new FractionService(repo as any);
    (service as any).logger = { error: jest.fn(), log: jest.fn(), warn: jest.fn() };
    (handleDbExceptions as unknown as jest.Mock).mockClear();
  });

  describe('_isValidYearMonth (private)', () => {
    const fn = (y: any, m: any) =>
      (FractionService.prototype as any)._isValidYearMonth.call({}, y, m);

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
      expect(fn(2026, "5; DROP TABLE x")).toBe(false);
    });
  });

  describe('_tableExists (private)', () => {
    it('returns false and logs when no schema', async () => {
      const result = await (service as any)._tableExists('fraction');
      expect(result).toBe(false);
      expect(repo.query).not.toHaveBeenCalled();
    });

    it('returns true when information_schema confirms existence', async () => {
      repo.query.mockResolvedValueOnce([{ exists: true }]);
      const result = await (service as any)._tableExists('history.x');
      expect(result).toBe(true);
      expect(repo.query.mock.calls[0][1]).toEqual(['history', 'x']);
    });

    it('returns false on error', async () => {
      repo.query.mockRejectedValueOnce(new Error('e'));
      const result = await (service as any)._tableExists('a.b');
      expect(result).toBe(false);
    });
  });

  describe('_convertRangeToTimeZone (private)', () => {
    const fn = (s: string, e: string, tz: string) =>
      (service as any)._convertRangeToTimeZone(s, e, tz);

    // Note: the production implementation interprets the timezone sign in the
    // opposite direction from standard conventions. The tests below assert the
    // ACTUAL current behavior (not the conventional one) to avoid breaking
    // any consumer that is already calibrated against this output.
    it('applies the +-inverted timezone offset for -05:00', () => {
      const result = fn('2026-01-01 12:00:00', '2026-01-01 14:00:00', '-05:00');
      expect(result.start).toBe('2026-01-01 17:00:00');
      expect(result.end).toBe('2026-01-01 19:00:00');
    });

    it('applies the +-inverted timezone offset for +03:00', () => {
      const result = fn('2026-01-01 12:00:00', '2026-01-01 14:00:00', '+03:00');
      expect(result.start).toBe('2026-01-01 09:00:00');
      expect(result.end).toBe('2026-01-01 11:00:00');
    });

    it('produces NaN-filled strings on invalid input rather than throwing', () => {
      const result = fn('not-a-date', 'not-a-date', 'bogus');
      // The regex match fails so sign/hours/minutes are undefined; Date(NaN)
      // yields "NaN-NaN-NaN NaN:NaN:NaN" through the formatter (no throw).
      expect(result.start).toContain('NaN');
      expect(result.end).toContain('NaN');
    });

    it('returns empty strings when timeZone.match throws (catch branch)', () => {
      // Passing null causes `.match` to throw → catch returns empty result.
      const result = fn('2026-01-01 12:00:00', '2026-01-01 14:00:00', null as any);
      expect(result).toEqual({ start: '', end: '' });
    });
  });

  describe('findAll', () => {
    it('queries main table when year/month omitted', async () => {
      repo.query
        .mockResolvedValueOnce([{ total: '5' }])
        .mockResolvedValueOnce([{ id: 1 }]);

      const result = await service.findAll({} as any);

      expect(result).toEqual({ fractions: [{ id: 1 }], total: '5', limit: 10, offset: 0 });
      const [totalSql] = repo.query.mock.calls[0];
      expect(totalSql).toContain('FROM fraction AS f');
    });

    it('returns empty when year/month invalid', async () => {
      const result = await service.findAll({ year: 1700, month: 5 } as any);
      expect(result).toEqual({ fractions: [] });
      expect(repo.query).not.toHaveBeenCalled();
    });

    it('queries historical table when it exists', async () => {
      repo.query
        .mockResolvedValueOnce([{ exists: true }])
        .mockResolvedValueOnce([{ total: '1' }])
        .mockResolvedValueOnce([{ id: 9 }]);

      const result = await service.findAll({ year: 2026, month: 3 } as any);

      expect(result?.fractions).toEqual([{ id: 9 }]);
      expect(repo.query.mock.calls[1][0]).toContain('history."2026_03_fraction"');
    });

    it('returns empty fractions when historical table missing', async () => {
      repo.query.mockResolvedValueOnce([{ exists: false }]);

      const result = await service.findAll({ year: 2026, month: 3 } as any);

      expect(result).toEqual({ fractions: [] });
    });

    it('appends WHERE clause when conditions present', async () => {
      repo.query
        .mockResolvedValueOnce([{ total: '0' }])
        .mockResolvedValueOnce([]);
      await service.findAll({ zoneId: 1 } as any);
      const [sql] = repo.query.mock.calls[0];
      expect(sql).toContain('WHERE');
    });

    it('routes errors through handleDbExceptions', async () => {
      repo.query.mockRejectedValueOnce(new Error('e'));
      await expect(service.findAll({} as any)).rejects.toThrow('e');
    });
  });

  describe('findFractionHistory', () => {
    it('queries only public table when no year/month', async () => {
      repo.query.mockResolvedValueOnce([{ id: 1 }]);

      const result = await service.findFractionHistory({} as any);

      expect(result).toEqual({ errorCode: ErrorCode.NONE, fraction: [{ id: 1 }] });
      const [sql] = repo.query.mock.calls[0];
      expect(sql).toContain('public.fraction');
    });

    it('returns empty when year/month invalid', async () => {
      const result = await service.findFractionHistory({ year: 1700, month: 1 } as any);
      expect(result).toEqual({ errorCode: ErrorCode.NONE, fraction: [] });
      expect(repo.query).not.toHaveBeenCalled();
    });

    it('UNIONs historical table when it exists', async () => {
      repo.query
        .mockResolvedValueOnce([{ exists: true }])
        .mockResolvedValueOnce([]);

      await service.findFractionHistory({ year: 2026, month: 3 } as any);

      const finalSql = repo.query.mock.calls[1][0];
      expect(finalSql).toContain('UNION ALL');
      expect(finalSql).toContain('history."2026_03_fraction"');
    });

    it('skips historical when table missing', async () => {
      repo.query
        .mockResolvedValueOnce([{ exists: false }])
        .mockResolvedValueOnce([]);

      await service.findFractionHistory({ year: 2026, month: 3 } as any);

      const finalSql = repo.query.mock.calls[1][0];
      expect(finalSql).not.toContain('UNION ALL');
    });

    it('appends WHERE clause inside UNIONed selects when conditions present', async () => {
      repo.query
        .mockResolvedValueOnce([{ exists: true }])
        .mockResolvedValueOnce([]);
      await service.findFractionHistory({ year: 2026, month: 3, zoneId: 1 } as any);
      const sql = repo.query.mock.calls[1][0];
      expect(sql).toContain('WHERE');
    });

    it('routes errors', async () => {
      repo.query.mockRejectedValueOnce(new Error('e'));
      await expect(service.findFractionHistory({} as any)).rejects.toThrow('e');
    });
  });

  describe('findAllTotalVehicleClientTime', () => {
    it('queries main table when no year/month', async () => {
      repo.query.mockResolvedValueOnce([{ totalVehicle: 1 }]);
      const result = await service.findAllTotalVehicleClientTime({} as any);
      expect(result).toEqual({ fractions: [{ totalVehicle: 1 }] });
    });

    it('returns empty when year/month invalid', async () => {
      const result = await service.findAllTotalVehicleClientTime({
        year: 1700,
        month: 1,
      } as any);
      expect(result).toEqual({ fractions: [] });
    });

    it('returns empty fractions when year/month set (no schema in table name, _tableExists yields false)', async () => {
      // The table name built here lacks a schema prefix so _tableExists short
      // circuits to false without querying. Function returns the empty branch.
      const result = await service.findAllTotalVehicleClientTime({
        year: 2026,
        month: 3,
      } as any);
      expect(result).toEqual({ fractions: [] });
      expect(repo.query).not.toHaveBeenCalled();
    });

    it('catches errors gracefully (logs and returns undefined)', async () => {
      const spy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
      repo.query.mockRejectedValueOnce(new Error('e'));
      const result = await service.findAllTotalVehicleClientTime({} as any);
      expect(result).toBeUndefined();
      spy.mockRestore();
    });

    it('appends WHERE clause when conditions present', async () => {
      repo.query.mockResolvedValueOnce([]);
      await service.findAllTotalVehicleClientTime({ zoneId: 1 } as any);
      expect(repo.query.mock.calls[0][0]).toContain('WHERE');
    });
  });

  describe('findAllTotalOccupationRotationParking', () => {
    it('returns occupation and rotation calculations', async () => {
      repo.query
        .mockResolvedValueOnce([{ total: '10' }])
        .mockResolvedValueOnce([
          { totalParking: '5', totalSlotOccupation: '5', avgtime: '00:30:00' },
        ]);

      const result: any = await service.findAllTotalOccupationRotationParking({} as any);

      expect(result.fractions[0].totalSlot).toBe('10');
      expect(result.fractions[0].occupation).toBe('50.00');
      expect(result.fractions[0].rotation).toBe('0.50');
    });

    it('returns empty when year/month invalid', async () => {
      const result = await service.findAllTotalOccupationRotationParking({
        year: 1700,
        month: 1,
      } as any);
      expect(result).toEqual({ fractions: [] });
    });

    it('returns empty fractions when year/month set (no schema in table name)', async () => {
      const result = await service.findAllTotalOccupationRotationParking({
        year: 2026,
        month: 3,
      } as any);
      expect(result).toEqual({ fractions: [] });
      expect(repo.query).not.toHaveBeenCalled();
    });

    it('applies zoneId/blockId/slotId filters on slot count', async () => {
      repo.query
        .mockResolvedValueOnce([{ total: '0' }])
        .mockResolvedValueOnce([]);

      await service.findAllTotalOccupationRotationParking({
        zoneId: 1,
        blockId: 2,
        slotId: 3,
      } as any);

      const [sql, params] = repo.query.mock.calls[0];
      expect(sql).toContain('WHERE');
      expect(params).toEqual([1, 2, 3]);
    });

    it('appends WHERE clause when buildParametersConditions produces some', async () => {
      repo.query
        .mockResolvedValueOnce([{ total: '0' }])
        .mockResolvedValueOnce([]);
      await service.findAllTotalOccupationRotationParking({ statusId: 1 } as any);
      expect(repo.query.mock.calls[1][0]).toContain('WHERE');
    });

    it('catches errors gracefully', async () => {
      const spy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
      repo.query.mockRejectedValueOnce(new Error('e'));
      const result = await service.findAllTotalOccupationRotationParking({} as any);
      expect(result).toBeUndefined();
      spy.mockRestore();
    });
  });

  describe('findAllStatistics', () => {
    it('queries main table when year/month omitted', async () => {
      repo.query.mockResolvedValueOnce([{ idZone: 1 }]);
      const result = await service.findAllStatistics({} as any);
      expect(result).toEqual({ fractions: [{ idZone: 1 }] });
    });

    it('returns empty when year/month invalid', async () => {
      const result = await service.findAllStatistics({ year: 1700, month: 1 } as any);
      expect(result).toEqual({ fractions: [] });
    });

    it('returns empty fractions when year/month set (no schema in table name)', async () => {
      const result = await service.findAllStatistics({ year: 2026, month: 3 } as any);
      expect(result).toEqual({ fractions: [] });
      expect(repo.query).not.toHaveBeenCalled();
    });

    it('appends WHERE when filters present', async () => {
      repo.query.mockResolvedValueOnce([]);
      await service.findAllStatistics({ zoneId: 1 } as any);
      expect(repo.query.mock.calls[0][0]).toContain('WHERE');
    });

    it('routes errors', async () => {
      repo.query.mockRejectedValueOnce(new Error('e'));
      await expect(service.findAllStatistics({} as any)).rejects.toThrow('e');
    });
  });

  describe('findStatisticsFractions', () => {
    it('returns NOT_FOUND when no rows', async () => {
      repo.query.mockResolvedValueOnce([]);
      const result = await service.findStatisticsFractions({} as any);
      expect(result?.errorCode).toBe(ErrorCode.NOT_FOUND);
    });

    it('returns rows when present', async () => {
      repo.query.mockResolvedValueOnce([{ date: '2026-01-01' }]);
      const result: any = await service.findStatisticsFractions({} as any);
      expect(result.errorCode).toBe(ErrorCode.NONE);
      expect(result.fractions).toHaveLength(1);
    });

    it('returns NOT_FOUND when year/month invalid', async () => {
      const result = await service.findStatisticsFractions({
        year: 1700,
        month: 1,
      } as any);
      expect(result?.errorCode).toBe(ErrorCode.NOT_FOUND);
      expect(repo.query).not.toHaveBeenCalled();
    });

    it('uses historical table when exists', async () => {
      repo.query
        .mockResolvedValueOnce([{ exists: true }])
        .mockResolvedValueOnce([{ date: '2026-03-01' }]);
      const result: any = await service.findStatisticsFractions({
        year: 2026,
        month: 3,
      } as any);
      expect(result.errorCode).toBe(ErrorCode.NONE);
      expect(repo.query.mock.calls[1][0]).toContain('history."2026_03_fraction"');
    });

    it('falls back to public.fraction when historical missing', async () => {
      repo.query
        .mockResolvedValueOnce([{ exists: false }])
        .mockResolvedValueOnce([{ date: '2026-03-01' }]);
      const result: any = await service.findStatisticsFractions({
        year: 2026,
        month: 3,
      } as any);
      expect(result.errorCode).toBe(ErrorCode.NONE);
      expect(repo.query.mock.calls[1][0]).toContain('public.fraction');
    });

    it('appends WHERE when filters present', async () => {
      repo.query.mockResolvedValueOnce([{}]);
      await service.findStatisticsFractions({ zoneId: 1 } as any);
      expect(repo.query.mock.calls[0][0]).toContain('WHERE');
    });

    it('routes errors', async () => {
      repo.query.mockRejectedValueOnce(new Error('e'));
      await expect(service.findStatisticsFractions({} as any)).rejects.toThrow('e');
    });
  });

  describe('buildParametersConditions', () => {
    it('returns empty params/conditions with empty filter', () => {
      const result = service.buildParametersConditions({});
      expect(result).toEqual({ parameters: [], conditions: [] });
    });

    it('adds clauses for each supported filter', () => {
      const { parameters, conditions } = service.buildParametersConditions({
        search: 'PLATE',
        statusId: 1,
        typeFraction: 'X',
        zoneId: 2,
        blockId: 3,
        slotId: 4,
        userId: 5,
        typeSlot: 7,
        dateFrom: '2026-01-01',
        dateTo: '2026-01-31',
      });
      expect(conditions.some((c) => c.includes('f."plate"'))).toBe(true);
      expect(conditions.some((c) => c.includes('f."statusId"'))).toBe(true);
      expect(conditions.some((c) => c.includes('f."typeFraction"'))).toBe(true);
      expect(conditions.some((c) => c.includes('f."zoneId"'))).toBe(true);
      expect(conditions.some((c) => c.includes('f."blockId"'))).toBe(true);
      expect(conditions.some((c) => c.includes('f."slotId"'))).toBe(true);
      expect(conditions.some((c) => c.includes('f."userId"'))).toBe(true);
      expect(conditions.some((c) => c.includes('slot."typeSlot"'))).toBe(true);
      expect(conditions.some((c) => c.includes('BETWEEN'))).toBe(true);
      expect(parameters).toContain('PLATE');
      expect(parameters).toContain(7); // Number(typeSlot)
    });

    it('applies vehicle/others/undefined plate regex for typeSize', () => {
      const r1 = service.buildParametersConditions({ typeSize: TypeSizeVehicle.VEHICLE });
      expect(r1.conditions.some((c) => c.includes("'[0-9]$'"))).toBe(true);

      const r2 = service.buildParametersConditions({ typeSize: TypeSizeVehicle.OTHERS });
      expect(r2.conditions.some((c) => c.includes("'[0-9]$'"))).toBe(true);

      const r3 = service.buildParametersConditions({ typeSize: TypeSizeVehicle.UNDEFINED });
      // Falsy value 0 -> falls through and is ignored
      expect(r3.conditions.some((c) => c.includes("'[0-9]$'"))).toBe(false);
    });

    it('applies bike plate regex for BIKE typeSize', () => {
      const { conditions } = service.buildParametersConditions({
        typeSize: TypeSizeVehicle.BIKE,
      });
      expect(conditions.some((c) => c.includes("'[A-Za-z]$'"))).toBe(true);
    });

    it('uses timezone branch when isTimeZone=true and all timezone fields supplied', () => {
      const { conditions, parameters } = service.buildParametersConditions({
        isTimeZone: true,
        fromCreatedAt: '2026-01-01',
        toCreatedAt: '2026-01-02',
        timeZoneUTC: '-05:00',
      });
      expect(conditions.some((c) => c.includes('AT TIME ZONE'))).toBe(true);
      expect(parameters).toContain('-05:00');
    });

    it('does not push BETWEEN if dateFrom/dateTo missing', () => {
      const { conditions } = service.buildParametersConditions({ dateFrom: '2026-01-01' });
      expect(conditions.some((c) => c.includes('BETWEEN'))).toBe(false);
    });

    it('does not push timezone clause if some timezone fields missing', () => {
      const { conditions } = service.buildParametersConditions({
        isTimeZone: true,
        fromCreatedAt: '2026-01-01',
      });
      expect(conditions.some((c) => c.includes('AT TIME ZONE'))).toBe(false);
    });
  });
});
