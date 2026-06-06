import { ErrorCode } from 'src/common/glob/error';

jest.mock('src/common/exceptions/error.db.exception', () => ({
  __esModule: true,
  default: jest.fn((error: any) => {
    throw error;
  }),
}));
import handleDbExceptions from 'src/common/exceptions/error.db.exception';

import { LService } from '../l.service';

const buildQbMock = () => ({
  select: jest.fn().mockReturnThis(),
  addSelect: jest.fn().mockReturnThis(),
  leftJoin: jest.fn().mockReturnThis(),
  innerJoin: jest.fn().mockReturnThis(),
  where: jest.fn().mockReturnThis(),
  andWhere: jest.fn().mockReturnThis(),
  getRawAndEntities: jest.fn(),
});

const buildRepoMock = () => {
  const qb = buildQbMock();
  return {
    createQueryBuilder: jest.fn(() => qb),
    __qb: qb,
  };
};

describe('LService', () => {
  let service: LService;
  let repo: ReturnType<typeof buildRepoMock>;

  beforeEach(() => {
    repo = buildRepoMock();
    service = new LService(repo as any);
    (service as any).logger = { error: jest.fn() };
    (handleDbExceptions as unknown as jest.Mock).mockClear();
  });

  describe('findAllByUser', () => {
    it('returns the location with NONE error code', async () => {
      repo.__qb.getRawAndEntities.mockResolvedValueOnce({
        entities: [{ userId: 1 }],
        raw: [{ zoneName: 'Zone A', blockName: 'Block B' }],
      });

      const result = await service.findAllByUser({ userId: 1 } as any);

      expect(repo.__qb.where).toHaveBeenCalledWith('l.userId = :userId', { userId: 1 });
      expect(result).toEqual({
        errorCode: ErrorCode.NONE,
        location: { userId: 1, zoneName: 'Zone A', blockName: 'Block B' },
      });
    });

    it('routes errors through handleDbExceptions', async () => {
      repo.__qb.getRawAndEntities.mockRejectedValueOnce(new Error('e'));
      await expect(service.findAllByUser({} as any)).rejects.toThrow('e');
    });
  });

  describe('findByUsers', () => {
    it('parses comma-separated userIds and applies date range when provided', async () => {
      repo.__qb.getRawAndEntities.mockResolvedValueOnce({
        entities: [{ userId: 1 }],
        raw: [{ l_timestamp: '2026-01-15T00:00:00.000', zoneName: 'Z', blockName: 'B' }],
      });

      const result = await service.findByUsers({
        userIds: '1, 2, abc, 3',
        dateFrom: '2026-01-01',
        dateTo: '2026-01-31',
      } as any);

      expect(repo.__qb.where).toHaveBeenCalledWith('l.userId IN (:...userIds)', {
        userIds: [1, 2, 3],
      });
      expect(repo.__qb.andWhere).toHaveBeenCalledWith(
        'l.timestamp BETWEEN :dateFrom AND :dateTo',
        { dateFrom: '2026-01-01', dateTo: '2026-01-31' },
      );
      expect(result).toEqual({
        errorCode: ErrorCode.NONE,
        location: [
          {
            userId: 1,
            timestamp: '2026-01-15T00:00:00.000',
            zoneName: 'Z',
            blockName: 'B',
          },
        ],
      });
    });

    it('skips date range when only one bound provided', async () => {
      repo.__qb.getRawAndEntities.mockResolvedValueOnce({ entities: [], raw: [] });

      await service.findByUsers({ userIds: '1', dateFrom: '2026-01-01' } as any);

      // Without both dateFrom and dateTo, production falls back to the
      // CURRENT_DATE range (a single andWhere call), not the BETWEEN clause.
      expect(repo.__qb.andWhere).toHaveBeenCalledWith(
        `l.timestamp >= CURRENT_DATE AND l.timestamp < CURRENT_DATE + INTERVAL '1 day'`,
      );
      expect(repo.__qb.andWhere).not.toHaveBeenCalledWith(
        'l.timestamp BETWEEN :dateFrom AND :dateTo',
        expect.anything(),
      );
    });

    it('routes errors through handleDbExceptions', async () => {
      await expect(service.findByUsers({} as any)).rejects.toThrow();
    });
  });
});
