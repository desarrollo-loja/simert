jest.mock('src/common/exceptions/error.db.exception', () => ({
  __esModule: true,
  default: jest.fn((error: any) => {
    throw error;
  }),
}));
import handleDbExceptions from 'src/common/exceptions/error.db.exception';

import { FractionStatusService } from '../fraction_status.service';

const buildRepoMock = () => ({
  query: jest.fn(),
});

describe('FractionStatusService', () => {
  let service: FractionStatusService;
  let repo: ReturnType<typeof buildRepoMock>;

  beforeEach(() => {
    repo = buildRepoMock();
    service = new FractionStatusService(repo as any);
    (service as any).logger = { error: jest.fn() };
    (handleDbExceptions as unknown as jest.Mock).mockClear();
  });

  describe('findAllFractionState', () => {
    it('uses the default table when year/month omitted and parameterizes fractionId', async () => {
      repo.query.mockResolvedValueOnce([{ id: 1 }]);

      const result = await service.findAllFractionState(42, {} as any);

      const [sql, params] = repo.query.mock.calls[0];
      expect(sql).toContain('FROM public."fractionStatus" AS fs');
      expect(sql).toContain('$1');
      expect(params).toEqual([42]);
      expect(result).toEqual({ fractionStatus: [{ id: 1 }] });
    });

    it('switches to historical table when year/month are valid integers', async () => {
      repo.query.mockResolvedValueOnce([]);

      await service.findAllFractionState(1, { year: 2026, month: 3 } as any);

      expect(repo.query.mock.calls[0][0]).toContain('FROM "2026_3_fraction_status"');
    });

    it('falls back to default table when year/month are out of range', async () => {
      repo.query.mockResolvedValueOnce([]);

      await service.findAllFractionState(1, { year: 1700, month: 5 } as any);

      expect(repo.query.mock.calls[0][0]).toContain('FROM public."fractionStatus" AS fs');
    });

    it('returns empty when fractionId cannot be coerced to a number', async () => {
      const result = await service.findAllFractionState('abc' as any, {} as any);

      expect(result).toEqual({ fractionStatus: [] });
      expect(repo.query).not.toHaveBeenCalled();
    });

    it('routes errors through handleDbExceptions', async () => {
      repo.query.mockRejectedValueOnce(new Error('e'));

      await expect(service.findAllFractionState(1, {} as any)).rejects.toThrow('e');
    });
  });
});
