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
  where: jest.fn().mockReturnThis(),
  andWhere: jest.fn().mockReturnThis(),
  getOne: jest.fn(),
  getMany: jest.fn(),
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
      repo.__qb.getOne.mockResolvedValueOnce({ userId: 1 });

      const result = await service.findAllByUser({ userId: 1 } as any);

      expect(repo.__qb.where).toHaveBeenCalledWith('l.userId = :userId', { userId: 1 });
      expect(result).toEqual({ errorCode: ErrorCode.NONE, location: { userId: 1 } });
    });

    it('routes errors through handleDbExceptions', async () => {
      repo.__qb.getOne.mockRejectedValueOnce(new Error('e'));
      await expect(service.findAllByUser({} as any)).rejects.toThrow('e');
    });
  });

  describe('findByUsers', () => {
    it('parses comma-separated userIds and applies date range when provided', async () => {
      repo.__qb.getMany.mockResolvedValueOnce([{ userId: 1 }]);

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
      expect(result).toEqual({ errorCode: ErrorCode.NONE, location: [{ userId: 1 }] });
    });

    it('skips date range when only one bound provided', async () => {
      repo.__qb.getMany.mockResolvedValueOnce([]);

      await service.findByUsers({ userIds: '1', dateFrom: '2026-01-01' } as any);

      expect(repo.__qb.andWhere).not.toHaveBeenCalled();
    });

    it('routes errors through handleDbExceptions', async () => {
      await expect(service.findByUsers({} as any)).rejects.toThrow();
    });
  });
});
