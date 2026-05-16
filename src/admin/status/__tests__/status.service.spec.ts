jest.mock('src/common/exceptions/error.db.exception', () => ({
  __esModule: true,
  default: jest.fn((error: any) => {
    throw error;
  }),
}));
import handleDbExceptions from 'src/common/exceptions/error.db.exception';

import { StatusService } from '../status.service';

const buildRepoMock = () => {
  const qb: any = {
    select: jest.fn().mockReturnThis(),
    getMany: jest.fn(),
  };
  return {
    create: jest.fn((dto: any) => dto),
    save: jest.fn(async (e: any) => e),
    createQueryBuilder: jest.fn(() => qb),
    __qb: qb,
  };
};

describe('StatusService', () => {
  let service: StatusService;
  let repo: ReturnType<typeof buildRepoMock>;

  beforeEach(() => {
    repo = buildRepoMock();
    service = new StatusService(repo as any);
    (service as any).logger = { error: jest.fn() };
    (handleDbExceptions as unknown as jest.Mock).mockClear();
  });

  describe('initializeDatabase', () => {
    it('saves all 11 seed statuses and returns the first two', async () => {
      const result = await service.initializeDatabase();

      expect(repo.create).toHaveBeenCalledTimes(11);
      expect(repo.save).toHaveBeenCalledTimes(11);
      expect(result).toHaveProperty('status1');
      expect(result).toHaveProperty('status2');
    });
  });

  describe('findAllByfilter', () => {
    it('returns rows from the query builder', async () => {
      repo.__qb.getMany.mockResolvedValueOnce([{ id: 1, name: 'A' }]);

      const result = await service.findAllByfilter();

      expect(result).toEqual({ status: [{ id: 1, name: 'A' }] });
    });

    it('routes errors through handleDbExceptions', async () => {
      repo.__qb.getMany.mockRejectedValueOnce(new Error('e'));
      await expect(service.findAllByfilter()).rejects.toThrow('e');
    });
  });
});
