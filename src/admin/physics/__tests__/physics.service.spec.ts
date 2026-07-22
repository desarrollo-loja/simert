import { ErrorCode } from 'src/common/glob/error';

jest.mock('src/common/exceptions/error.db.exception', () => ({
  __esModule: true,
  default: jest.fn((error: any) => {
    throw error;
  }),
}));
import handleDbExceptions from 'src/common/exceptions/error.db.exception';

import { PhysicsService } from '../physics.service';

const buildQbMock = () => ({
  select: jest.fn().mockReturnThis(),
  andWhere: jest.fn().mockReturnThis(),
  orderBy: jest.fn().mockReturnThis(),
  take: jest.fn().mockReturnThis(),
  skip: jest.fn().mockReturnThis(),
  getMany: jest.fn(),
  getCount: jest.fn(),
  getRawOne: jest.fn(),
});

const buildRepoMock = () => {
  const qb = buildQbMock();
  return {
    // findAll runs a raw SQL string via repository.query (no QueryBuilder).
    query: jest.fn(),
    createQueryBuilder: jest.fn(() => qb),
    __qb: qb,
  };
};

describe('PhysicsService', () => {
  let service: PhysicsService;
  let repo: ReturnType<typeof buildRepoMock>;

  beforeEach(() => {
    repo = buildRepoMock();
    service = new PhysicsService(repo as any);
    (service as any).logger = { error: jest.fn() };
    (handleDbExceptions as unknown as jest.Mock).mockClear();
  });

  describe('findAll', () => {
    it('applies default pagination and returns rows', async () => {
      repo.query.mockResolvedValueOnce([{ id: 1 }]);

      const result = await service.findAll({} as any);

      // No filters: only LIMIT/OFFSET parameters ($1, $2 => 20, 0).
      const [sql, params] = repo.query.mock.calls[0];
      expect(sql).not.toContain('WHERE');
      expect(sql).toContain('LIMIT $1 OFFSET $2');
      expect(params).toEqual([20, 0]);
      expect(result).toEqual({ errorCode: ErrorCode.NONE, physics: [{ id: 1 }] });
    });

    it('appends ALL filters and overrides pagination', async () => {
      repo.query.mockResolvedValueOnce([]);

      await service.findAll({
        userId: 1,
        zoneId: 2,
        blockId: 3,
        search: 'card-x',
        dateFrom: '2026-01-01 05:00:00',
        dateTo: '2026-01-02 04:59:59',
        timeByBlock: 'hour',
        limit: 50,
        offset: 5,
      } as any);

      const [sql, params] = repo.query.mock.calls[0];
      expect(sql).toContain('p."userId" = $1');
      expect(sql).toContain('p."zoneId" = $2');
      // `physic` has no blockId; the sector filter is applied on the joined block.
      expect(sql).toContain('b."id" = $3');
      expect(sql).toContain('p."card" = $4');
      // The date filter is a closed UTC range on `createdAt` (needs both bounds).
      expect(sql).toContain('p."createdAt" BETWEEN $5 AND $6');
      expect(sql).toContain('p."timeByBlock" = $7');
      // LIMIT/OFFSET placeholders follow the 7 filter parameters.
      expect(sql).toContain('LIMIT $8 OFFSET $9');
      expect(params).toEqual([
        1,
        2,
        3,
        'card-x',
        '2026-01-01 05:00:00',
        '2026-01-02 04:59:59',
        'hour',
        50,
        5,
      ]);
    });

    it('routes errors through handleDbExceptions', async () => {
      repo.query.mockRejectedValueOnce(new Error('e'));
      await expect(service.findAll({} as any)).rejects.toThrow('e');
    });
  });

  describe('findAllTotalUnique', () => {
    it('returns parsed total count of unique cards', async () => {
      repo.__qb.getRawOne.mockResolvedValueOnce({ total: '5' });

      const result = await service.findAllTotalUnique({} as any);

      expect(result).toEqual({ errorCode: ErrorCode.NONE, total: 5 });
    });

    it('applies filters when provided', async () => {
      repo.__qb.getRawOne.mockResolvedValueOnce({ total: '0' });
      await service.findAllTotalUnique({ userId: 1 } as any);
      expect(repo.__qb.andWhere).toHaveBeenCalled();
    });

    it('routes errors through handleDbExceptions', async () => {
      repo.__qb.getRawOne.mockRejectedValueOnce(new Error('e'));
      await expect(service.findAllTotalUnique({} as any)).rejects.toThrow('e');
    });
  });

  describe('findAllTotal', () => {
    it('returns count from query builder', async () => {
      repo.__qb.getCount.mockResolvedValueOnce(7);

      const result = await service.findAllTotal({} as any);

      expect(result).toEqual({ errorCode: ErrorCode.NONE, total: 7 });
    });

    it('applies filters when provided', async () => {
      repo.__qb.getCount.mockResolvedValueOnce(0);
      await service.findAllTotal({ zoneId: 1 } as any);
      expect(repo.__qb.andWhere).toHaveBeenCalled();
    });

    it('routes errors through handleDbExceptions', async () => {
      repo.__qb.getCount.mockRejectedValueOnce(new Error('e'));
      await expect(service.findAllTotal({} as any)).rejects.toThrow('e');
    });
  });
});
