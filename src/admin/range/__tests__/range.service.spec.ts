import { ErrorCode } from 'src/common/glob/error';
import { TypeOperation } from 'src/common/glob/type/type_operation';

jest.mock('src/common/exceptions/error.db.exception', () => ({
  __esModule: true,
  default: jest.fn((error: any) => {
    throw error;
  }),
}));
import handleDbExceptions from 'src/common/exceptions/error.db.exception';

import { RangeService } from '../range.service';

const buildQb = () => ({
  select: jest.fn().mockReturnThis(),
  where: jest.fn().mockReturnThis(),
  andWhere: jest.fn().mockReturnThis(),
  take: jest.fn().mockReturnThis(),
  skip: jest.fn().mockReturnThis(),
  orderBy: jest.fn().mockReturnThis(),
  getMany: jest.fn(),
});

const buildRepoMock = () => {
  const qb = buildQb();
  return {
    create: jest.fn((dto: any) => ({ ...dto })),
    save: jest.fn(async (e: any) => ({ id: 1, ...e })),
    preload: jest.fn(),
    query: jest.fn(),
    createQueryBuilder: jest.fn(() => qb),
    __qb: qb,
  };
};

describe('RangeService', () => {
  let service: RangeService;
  let repo: ReturnType<typeof buildRepoMock>;
  let loggerService: any;

  beforeEach(() => {
    repo = buildRepoMock();
    loggerService = { saveRangeLogger: jest.fn() };
    service = new RangeService(repo as any, loggerService);
    (service as any).logger = { error: jest.fn(), log: jest.fn(), warn: jest.fn() };
    (handleDbExceptions as unknown as jest.Mock).mockClear();
  });

  describe('create', () => {
    it('persists the range, logs and returns it', async () => {
      const result = await service.create(1, { from: '1', to: '10' } as any);

      expect(repo.save).toHaveBeenCalled();
      expect(loggerService.saveRangeLogger).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 1, typeOperation: TypeOperation.CREATE }),
      );
      expect(result).toEqual({
        errorCode: ErrorCode.NONE,
        range: { id: 1, from: '1', to: '10' },
      });
    });

    it('routes save errors through handleDbExceptions', async () => {
      repo.save.mockRejectedValueOnce(new Error('boom'));

      await expect(service.create(1, {} as any)).rejects.toThrow('boom');
      expect(handleDbExceptions).toHaveBeenCalled();
    });
  });

  describe('update', () => {
    it('saves preloaded entity and logs UPDATE', async () => {
      repo.preload.mockResolvedValueOnce({ id: 1, from: '5' });

      const result = await service.update(1, 1, { from: '5' } as any);

      expect(repo.save).toHaveBeenCalled();
      expect(loggerService.saveRangeLogger).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 1, typeOperation: TypeOperation.UPDATE }),
      );
      expect(result?.errorCode).toBe(ErrorCode.NONE);
    });

    it('throws (routed through handleDbExceptions) when preload yields nothing', async () => {
      repo.preload.mockResolvedValueOnce(undefined);

      await expect(service.update(1, 1, {} as any)).rejects.toThrow('Range not found');
      expect(handleDbExceptions).toHaveBeenCalled();
    });

    it('routes save errors through handleDbExceptions', async () => {
      repo.preload.mockResolvedValueOnce({ id: 1 });
      repo.save.mockRejectedValueOnce(new Error('boom'));

      await expect(service.update(1, 1, {} as any)).rejects.toThrow('boom');
    });
  });

  describe('findAll', () => {
    it('applies default pagination and orders by id DESC', async () => {
      repo.__qb.getMany.mockResolvedValueOnce([{ id: 1 }]);

      const result = await service.findAll({} as any);

      expect(repo.__qb.take).toHaveBeenCalledWith(10);
      expect(repo.__qb.skip).toHaveBeenCalledWith(0);
      expect(repo.__qb.orderBy).toHaveBeenCalledWith('range.id', 'DESC');
      expect(result).toEqual({ errorCode: ErrorCode.NONE, ranges: [{ id: 1 }] });
    });

    it('adds search ILIKE clause when provided and uses custom pagination', async () => {
      repo.__qb.getMany.mockResolvedValueOnce([]);

      await service.findAll({ search: 'foo', limit: 5, offset: 3 } as any);

      expect(repo.__qb.andWhere).toHaveBeenCalledWith(
        'range.description ILIKE :search',
        { search: '%foo%' },
      );
      expect(repo.__qb.take).toHaveBeenCalledWith(5);
      expect(repo.__qb.skip).toHaveBeenCalledWith(3);
    });

    it('routes errors through handleDbExceptions', async () => {
      repo.__qb.getMany.mockRejectedValueOnce(new Error('boom'));

      await expect(service.findAll({} as any)).rejects.toThrow('boom');
    });
  });

  describe('verifyRange', () => {
    it('queries the range with bound :from / :to parameters', async () => {
      repo.__qb.getMany.mockResolvedValueOnce([{ id: 1 }]);

      const result = await service.verifyRange({ from: 5, to: 10 } as any);

      // Range bounds are bound as parameters, not interpolated.
      expect(repo.__qb.where).toHaveBeenCalledWith(
        expect.stringContaining(':from'),
        { from: 5, to: 10 },
      );
      expect(result?.errorCode).toBe(ErrorCode.NONE);
    });

    it('appends search ILIKE when provided', async () => {
      repo.__qb.getMany.mockResolvedValueOnce([]);

      await service.verifyRange({ from: 1, to: 2, search: 'q' } as any);

      expect(repo.__qb.andWhere).toHaveBeenCalledWith(
        'range.description ILIKE :search',
        { search: '%q%' },
      );
    });

    it('routes errors through handleDbExceptions', async () => {
      repo.__qb.getMany.mockRejectedValueOnce(new Error('boom'));
      await expect(service.verifyRange({} as any)).rejects.toThrow('boom');
    });
  });

  describe('findAllTotal', () => {
    it('returns the count without filters', async () => {
      repo.query.mockResolvedValueOnce([{ total: '3' }]);

      const result = await service.findAllTotal({} as any);

      expect(result).toEqual({ total: '3' });
      const [sql, params] = repo.query.mock.calls[0];
      expect(sql).not.toContain('WHERE');
      expect(params).toEqual([]);
    });

    it('appends search ILIKE clause when provided', async () => {
      repo.query.mockResolvedValueOnce([{ total: '1' }]);

      await service.findAllTotal({ search: 'abc' } as any);

      const [sql, params] = repo.query.mock.calls[0];
      expect(sql).toContain('r.description ILIKE $1');
      expect(params).toEqual(['%abc%']);
    });

    it('routes errors through handleDbExceptions', async () => {
      repo.query.mockRejectedValueOnce(new Error('boom'));
      await expect(service.findAllTotal({} as any)).rejects.toThrow('boom');
    });
  });
});
