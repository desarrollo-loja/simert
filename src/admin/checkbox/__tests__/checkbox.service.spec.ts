import { ErrorCode } from '../../../common/glob/error';
import { StatusPayment } from '../../../common/glob/status/status_payment';
import { IncidentStatus } from '../../../common/glob/type/type_incident';

// Spy on handleDbExceptions so we can assert error routing.
jest.mock('src/common/exceptions/error.db.exception', () => ({
  __esModule: true,
  default: jest.fn((error: any) => {
    throw error;
  }),
}));
import handleDbExceptions from 'src/common/exceptions/error.db.exception';

import { CheckboxService } from '../checkbox.service';

const buildRepoMock = () => ({
  query: jest.fn(),
  update: jest.fn(),
});

describe('CheckboxService', () => {
  let service: CheckboxService;
  let repo: ReturnType<typeof buildRepoMock>;

  beforeEach(() => {
    repo = buildRepoMock();
    service = new CheckboxService(repo as any);
    (service as any).logger = { error: jest.fn(), log: jest.fn(), warn: jest.fn() };
    (handleDbExceptions as unknown as jest.Mock).mockClear();
  });

  describe('findAll', () => {
    it('queries main table when year/month omitted, applies default pagination', async () => {
      // First query: total count. Second query: rows.
      repo.query
        .mockResolvedValueOnce([{ total: '5' }])
        .mockResolvedValueOnce([{ id: 1 }]);

      const result: any = await service.findAll({} as any);

      expect(result).toEqual({ checkbox: [{ id: 1 }], total: '5', limit: 10, offset: 0 });
      // Ensure the rows query was parameterized with the safe limit/offset.
      const [, params] = repo.query.mock.calls[1];
      expect(params[params.length - 2]).toBe(10);
      expect(params[params.length - 1]).toBe(0);
      expect(repo.query.mock.calls[1][0]).toContain('FROM checkbox c');
    });

    it('coerces unsafe limit/offset to safe defaults (defense-in-depth)', async () => {
      repo.query
        .mockResolvedValueOnce([{ total: '0' }])
        .mockResolvedValueOnce([]);

      await service.findAll({ limit: -1 as any, offset: -3 as any } as any);

      const [, params] = repo.query.mock.calls[1];
      // -1 / -3 are rejected -> falls back to defaults.
      expect(params[params.length - 2]).toBe(10);
      expect(params[params.length - 1]).toBe(0);
    });

    it('coerces non-numeric limit/offset to safe defaults', async () => {
      repo.query
        .mockResolvedValueOnce([{ total: '0' }])
        .mockResolvedValueOnce([]);

      await service.findAll({ limit: 'abc' as any, offset: 'xyz' as any } as any);

      const [, params] = repo.query.mock.calls[1];
      expect(params[params.length - 2]).toBe(10);
      expect(params[params.length - 1]).toBe(0);
    });

    it('returns empty when only one of year/month is provided', async () => {
      const result = await service.findAll({ year: 2026 } as any);
      expect(result).toEqual({ checkbox: [] });
      expect(repo.query).not.toHaveBeenCalled();
    });

    it('returns empty when year/month are out of range (SQL-injection guard)', async () => {
      const result = await service.findAll({ year: 1999, month: 13 } as any);
      expect(result).toEqual({ checkbox: [] });
      expect(repo.query).not.toHaveBeenCalled();
    });

    it('queries historical table when it exists', async () => {
      // _tableExists -> true, then total query, then rows query.
      repo.query
        .mockResolvedValueOnce([{ exists: true }])
        .mockResolvedValueOnce([{ total: '2' }])
        .mockResolvedValueOnce([{ id: 9 }]);

      const result: any = await service.findAll({ year: 2026, month: 3 } as any);

      expect(result.checkbox).toEqual([{ id: 9 }]);
      // Historical table name is built from coerced integers (safe).
      expect(repo.query.mock.calls[1][0]).toContain('FROM 2026_03_checkbox');
    });

    it('returns empty when historical table does not exist', async () => {
      repo.query.mockResolvedValueOnce([{ exists: false }]);

      const result = await service.findAll({ year: 2026, month: 3 } as any);

      expect(result).toEqual({ checkbox: [] });
    });

    it('builds WHERE clause for all supported filters', async () => {
      repo.query
        .mockResolvedValueOnce([{ total: '0' }])
        .mockResolvedValueOnce([]);

      await service.findAll({
        search: 'tx-1',
        statusMomentId: 1,
        statusPayment: 'PAID',
        typePaymentMethod: 'CARD',
        dateFrom: '2026-01-01',
        dateTo: '2026-01-31',
      } as any);

      const [totalSql, totalParams] = repo.query.mock.calls[0];
      expect(totalSql).toContain('c."transactionId" = $1');
      expect(totalSql).toContain('c.moment = $2');
      expect(totalSql).toContain('c."statusPayment" = $3');
      expect(totalSql).toContain('c."typePaymentMethod" = $4');
      expect(totalSql).toContain('DATE(c.register) BETWEEN');
      // The parameters array is shared and limit/offset are appended for the rows
      // query, so we only assert the leading filter values are present in order.
      expect(totalParams.slice(0, 6)).toEqual(['tx-1', 1, 'PAID', 'CARD', '2026-01-01', '2026-01-31']);
    });

    it('routes DB errors through handleDbExceptions', async () => {
      repo.query.mockRejectedValueOnce(new Error('boom'));

      await expect(service.findAll({} as any)).rejects.toThrow('boom');
      expect(handleDbExceptions).toHaveBeenCalled();
    });

    it('falls through to fallback return when handleDbExceptions swallows the error', async () => {
      repo.query.mockRejectedValueOnce(new Error('soft'));
      (handleDbExceptions as unknown as jest.Mock).mockImplementationOnce(() => undefined);

      const result = await service.findAll({} as any);

      // The defensive fallback string at the end of findAll.
      expect(result).toBe('This action returns all checkbox');
    });
  });

  describe('findAllByTransactionId', () => {
    it('returns empty when transactionIds is missing', async () => {
      const result = await service.findAllByTransactionId({} as any);
      expect(result).toEqual({ checkbox: [] });
      expect(repo.query).not.toHaveBeenCalled();
    });

    it('returns empty when transactionIds is empty array', async () => {
      const result = await service.findAllByTransactionId({ transactionIds: [] } as any);
      expect(result).toEqual({ checkbox: [] });
      expect(repo.query).not.toHaveBeenCalled();
    });

    it('queries main table with IN clause when year/month omitted', async () => {
      repo.query.mockResolvedValueOnce([
        { id: 1, transactionId: 'a', statusIncident: 100, onResponseExternal: null },
      ]);

      const result: any = await service.findAllByTransactionId({
        transactionIds: ['a', 'b'],
      } as any);

      expect(result).toEqual({
        checkbox: [{ id: 1, transactionId: 'a', statusIncident: 100, onResponseExternal: null }],
      });
      const [sql, params] = repo.query.mock.calls[0];
      expect(sql).toContain('FROM checkbox c');
      expect(sql).toContain('c."transactionId" IN ($1, $2)');
      expect(sql).toContain('c."statusIncident"');
      expect(sql).toContain('c."onResponseExternal"');
      expect(params).toEqual(['a', 'b']);
    });

    it('appends date range condition when dateFrom and dateTo are provided', async () => {
      repo.query.mockResolvedValueOnce([]);

      await service.findAllByTransactionId({
        transactionIds: ['a'],
        dateFrom: '2026-01-01',
        dateTo: '2026-01-31',
      } as any);

      const [sql, params] = repo.query.mock.calls[0];
      expect(sql).toContain('DATE(c.register) BETWEEN $2 AND $3');
      expect(params).toEqual(['a', '2026-01-01', '2026-01-31']);
    });

    it('returns empty when only one of year/month is provided', async () => {
      const result = await service.findAllByTransactionId({
        transactionIds: ['a'],
        year: 2026,
      } as any);
      expect(result).toEqual({ checkbox: [] });
      expect(repo.query).not.toHaveBeenCalled();
    });

    it('returns empty when year/month are out of range', async () => {
      const result = await service.findAllByTransactionId({
        transactionIds: ['a'],
        year: 1999,
        month: 13,
      } as any);
      expect(result).toEqual({ checkbox: [] });
      expect(repo.query).not.toHaveBeenCalled();
    });

    it('queries historical table when it exists', async () => {
      repo.query
        .mockResolvedValueOnce([{ exists: true }])
        .mockResolvedValueOnce([{ id: 9, transactionId: 'a', statusIncident: 500, onResponseExternal: [] }]);

      const result: any = await service.findAllByTransactionId({
        transactionIds: ['a'],
        year: 2026,
        month: 3,
      } as any);

      expect(result.checkbox).toEqual([
        { id: 9, transactionId: 'a', statusIncident: 500, onResponseExternal: [] },
      ]);
      expect(repo.query.mock.calls[1][0]).toContain('FROM 2026_03_checkbox c');
    });

    it('returns empty when historical table does not exist', async () => {
      repo.query.mockResolvedValueOnce([{ exists: false }]);

      const result = await service.findAllByTransactionId({
        transactionIds: ['a'],
        year: 2026,
        month: 3,
      } as any);

      expect(result).toEqual({ checkbox: [] });
    });

    it('routes DB errors through handleDbExceptions', async () => {
      repo.query.mockRejectedValueOnce(new Error('boom'));

      await expect(
        service.findAllByTransactionId({ transactionIds: ['a'] } as any),
      ).rejects.toThrow('boom');
      expect(handleDbExceptions).toHaveBeenCalled();
    });

    it('falls through to fallback empty result when handleDbExceptions swallows the error', async () => {
      repo.query.mockRejectedValueOnce(new Error('soft'));
      (handleDbExceptions as unknown as jest.Mock).mockImplementationOnce(() => undefined);

      const result = await service.findAllByTransactionId({ transactionIds: ['a'] } as any);

      expect(result).toEqual({ checkbox: [] });
    });
  });

  describe('_tableExists (private)', () => {
    it('returns the exists flag from information_schema', async () => {
      repo.query.mockResolvedValueOnce([{ exists: true }]);
      const result = await (service as any)._tableExists('2026_03_checkbox');
      expect(result).toBe(true);
      // The table name is bound as a parameter, not interpolated.
      expect(repo.query.mock.calls[0][1]).toEqual(['2026_03_checkbox']);
    });

    it('returns false when the query throws', async () => {
      repo.query.mockRejectedValueOnce(new Error('e'));
      const result = await (service as any)._tableExists('x');
      expect(result).toBe(false);
    });
  });

  describe('findPaidWithoutIncident', () => {
    it('returns NONE with the rows from the repository', async () => {
      repo.query.mockResolvedValueOnce([{ id: 1 }]);

      const result = await service.findPaidWithoutIncident();

      expect(result).toEqual({ errorCode: ErrorCode.NONE, data: [{ id: 1 }] });
      expect(repo.query.mock.calls[0][1]).toEqual([StatusPayment.PAID]);
    });

    it('returns HTTP_ERROR_REINTENT when the query fails', async () => {
      repo.query.mockRejectedValueOnce(new Error('boom'));

      const result = await service.findPaidWithoutIncident();

      expect(result).toEqual({ errorCode: ErrorCode.HTTP_ERROR_REINTENT, data: [] });
    });
  });

  describe('findPaidWithPendingIncident', () => {
    it('queries with the full set of pending statuses', async () => {
      repo.query.mockResolvedValueOnce([{ id: 9 }]);

      const result = await service.findPaidWithPendingIncident();

      expect(result).toEqual({ errorCode: ErrorCode.NONE, data: [{ id: 9 }] });
      const [, params] = repo.query.mock.calls[0];
      expect(params[0]).toBe(StatusPayment.PAID);
      expect(params).toContain(IncidentStatus.ENTERED);
      expect(params).toContain(IncidentStatus.APPROVED);
      expect(params).toContain(IncidentStatus.CONVENIO);
      expect(params).toContain(IncidentStatus.ON_CREDIT);
      expect(params).toContain(IncidentStatus.PENDIENTE_LIQUIDACION);
      expect(params).toContain(IncidentStatus.SUPPLIED);
    });

    it('returns HTTP_ERROR_REINTENT on error', async () => {
      repo.query.mockRejectedValueOnce(new Error('boom'));

      const result = await service.findPaidWithPendingIncident();

      expect(result).toEqual({ errorCode: ErrorCode.HTTP_ERROR_REINTENT, data: [] });
    });
  });

  describe('updateCheckboxById', () => {
    it('updates and returns NONE on success', async () => {
      repo.update.mockResolvedValueOnce({ affected: 1 });

      const result = await service.updateCheckboxById(7, { amount: 5 } as any);

      expect(repo.update).toHaveBeenCalledWith(7, { amount: 5 });
      expect(result.errorCode).toBe(ErrorCode.NONE);
    });

    it('returns HTTP_ERROR_REINTENT on error', async () => {
      repo.update.mockRejectedValueOnce(new Error('boom'));

      const result = await service.updateCheckboxById(7, {} as any);

      expect(result.errorCode).toBe(ErrorCode.HTTP_ERROR_REINTENT);
    });
  });

  describe('moveCheckboxToHistory', () => {
    it('returns NOT_FOUND when the checkbox row is missing', async () => {
      repo.query.mockResolvedValueOnce([]);
      const result = await service.moveCheckboxToHistory(1);
      expect(result.errorCode).toBe(ErrorCode.NOT_FOUND);
    });

    it('returns NOT_FOUND when row has no createdAt', async () => {
      repo.query.mockResolvedValueOnce([{ id: 1, createdAt: null }]);
      const result = await service.moveCheckboxToHistory(1);
      expect(result.errorCode).toBe(ErrorCode.NOT_FOUND);
    });

    it('returns NONE when the historical table does not exist', async () => {
      repo.query
        .mockResolvedValueOnce([{ id: 1, createdAt: '2026-03-15T00:00:00.000Z' }])
        .mockResolvedValueOnce([{ exists: false }]);

      const result = await service.moveCheckboxToHistory(1);

      expect(result.errorCode).toBe(ErrorCode.NONE);
      expect(result.message).toContain('No se encontró la tabla');
    });

    it('inserts into the historical table when it exists', async () => {
      repo.query
        .mockResolvedValueOnce([{ id: 1, createdAt: '2026-03-15T00:00:00.000Z' }])
        .mockResolvedValueOnce([{ exists: true }])
        .mockResolvedValueOnce(undefined);

      const result = await service.moveCheckboxToHistory(1);

      expect(result.errorCode).toBe(ErrorCode.NONE);
      // The INSERT target table is built from Date getters (always numeric -> safe).
      expect(repo.query.mock.calls[2][0]).toContain('history."2026_03_checkbox"');
      expect(repo.query.mock.calls[2][1]).toEqual([1]);
    });

    it('returns HTTP_ERROR_REINTENT on unexpected error', async () => {
      repo.query.mockRejectedValueOnce(new Error('boom'));

      const result = await service.moveCheckboxToHistory(1);

      expect(result.errorCode).toBe(ErrorCode.HTTP_ERROR_REINTENT);
    });
  });
});
