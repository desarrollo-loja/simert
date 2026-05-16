import { ErrorCode } from 'src/common/glob/error';
import { TypeOperation } from 'src/common/glob/type/type_operation';

jest.mock('src/common/exceptions/error.db.exception', () => ({
  __esModule: true,
  default: jest.fn((error: any) => {
    throw error;
  }),
}));
import handleDbExceptions from 'src/common/exceptions/error.db.exception';

import { SalePointService } from '../sale-point.service';

const buildQb = () => ({
  select: jest.fn().mockReturnThis(),
  addSelect: jest.fn().mockReturnThis(),
  leftJoin: jest.fn().mockReturnThis(),
  innerJoin: jest.fn().mockReturnThis(),
  andWhere: jest.fn().mockReturnThis(),
  orderBy: jest.fn().mockReturnThis(),
  take: jest.fn().mockReturnThis(),
  skip: jest.fn().mockReturnThis(),
  getRawAndEntities: jest.fn(),
  getMany: jest.fn(),
  getCount: jest.fn(),
});

const buildRepo = () => {
  const qb = buildQb();
  return {
    create: jest.fn((dto: any) => ({ ...dto })),
    save: jest.fn(async (e: any) => ({ id: 1, ...e })),
    preload: jest.fn(),
    findOne: jest.fn(),
    createQueryBuilder: jest.fn(() => qb),
    __qb: qb,
  };
};

describe('SalePointService', () => {
  let service: SalePointService;
  let repo: ReturnType<typeof buildRepo>;
  let loggerService: any;

  beforeEach(() => {
    repo = buildRepo();
    loggerService = { saveSalePointLogger: jest.fn() };
    service = new SalePointService(repo as any, loggerService);
    (service as any).logger = { error: jest.fn(), log: jest.fn() };
    (handleDbExceptions as unknown as jest.Mock).mockClear();
  });

  describe('create', () => {
    it('saves, logs and returns the sale point', async () => {
      const result = await service.create(1, { title: 'X' } as any);

      expect(repo.save).toHaveBeenCalled();
      expect(loggerService.saveSalePointLogger).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 1, typeOperation: TypeOperation.CREATE }),
      );
      expect(result).toEqual({ errorCode: ErrorCode.NONE, salePoint: { title: 'X' } });
    });

    it('routes errors through handleDbExceptions', async () => {
      repo.save.mockRejectedValueOnce(new Error('boom'));
      await expect(service.create(1, {} as any)).rejects.toThrow('boom');
      expect(handleDbExceptions).toHaveBeenCalled();
    });
  });

  describe('existsByUserId', () => {
    it('returns exists=true when a sale point is found', async () => {
      repo.findOne.mockResolvedValueOnce({ id: 1 });
      const result = await service.existsByUserId(5);
      expect(result).toEqual({ errorCode: ErrorCode.NONE, exists: true });
    });

    it('returns exists=false when nothing is found', async () => {
      repo.findOne.mockResolvedValueOnce(null);
      const result = await service.existsByUserId(5);
      expect(result).toEqual({ errorCode: ErrorCode.NONE, exists: false });
    });

    it('returns UNKNOWN on DB error', async () => {
      repo.findOne.mockRejectedValueOnce(new Error('e'));
      const result = await service.existsByUserId(5);
      expect(result).toEqual({ errorCode: ErrorCode.UNKNOWN, exists: false });
    });
  });

  describe('findAll', () => {
    it('returns sale points enriched with latitude/longitude from raw', async () => {
      repo.__qb.getRawAndEntities.mockResolvedValueOnce({
        entities: [{ id: 1 }, { id: 2 }],
        raw: [
          { latitudeMobible: 1, longitudeMobible: 2 },
          null,
        ],
      });

      const result: any = await service.findAll({} as any);

      expect(result.errorCode).toBe(ErrorCode.NONE);
      expect(result.salePoints[0].latitudeMobible).toBe(1);
      expect(result.salePoints[0].longitudeMobible).toBe(2);
      expect(result.salePoints[1].latitudeMobible).toBeUndefined();
    });

    it('appends conditions when filters provided', async () => {
      repo.__qb.getRawAndEntities.mockResolvedValueOnce({ entities: [], raw: [] });

      await service.findAll({
        userId: 1,
        search: 'foo',
        zoneId: 2,
        blockId: 3,
        isApproved: 1,
      } as any);

      expect(repo.__qb.andWhere).toHaveBeenCalled();
      const [sql, params] = repo.__qb.andWhere.mock.calls[0];
      expect(sql).toContain('sp.userId = :userId');
      expect(sql).toContain('sp.zoneId = :zoneId');
      expect(sql).toContain('sp.blockId = :blockId');
      expect(sql).toContain('sp.isApproved = :isApproved');
      expect(sql).toContain('ILIKE');
      expect(params).toEqual({
        userId: 1,
        search: '%foo%',
        zoneId: 2,
        blockId: 3,
        isApproved: 1,
      });
    });

    it('exercises the subquery factory passed to leftJoin', async () => {
      repo.__qb.getRawAndEntities.mockResolvedValueOnce({ entities: [], raw: [] });
      await service.findAll({} as any);

      const subQueryFactory = repo.__qb.leftJoin.mock.calls.find(
        (c: any[]) => typeof c[0] === 'function',
      )?.[0];
      expect(subQueryFactory).toBeDefined();

      const sub: any = {
        select: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        from: jest.fn().mockReturnThis(),
        distinctOn: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        addOrderBy: jest.fn().mockReturnThis(),
      };
      subQueryFactory(sub);
      expect(sub.select).toHaveBeenCalled();
      expect(sub.from).toHaveBeenCalled();
    });

    it('routes errors through handleDbExceptions', async () => {
      repo.__qb.getRawAndEntities.mockRejectedValueOnce(new Error('e'));
      await expect(service.findAll({} as any)).rejects.toThrow('e');
    });
  });

  describe('findAllFilter', () => {
    it('applies default pagination', async () => {
      repo.__qb.getMany.mockResolvedValueOnce([]);
      await service.findAllFilter({} as any);
      expect(repo.__qb.take).toHaveBeenCalledWith(20);
      expect(repo.__qb.skip).toHaveBeenCalledWith(0);
    });

    it('applies custom pagination and conditions', async () => {
      repo.__qb.getMany.mockResolvedValueOnce([]);
      await service.findAllFilter({ search: 'q', limit: 5, offset: 2 } as any);
      expect(repo.__qb.take).toHaveBeenCalledWith(5);
      expect(repo.__qb.skip).toHaveBeenCalledWith(2);
      expect(repo.__qb.andWhere).toHaveBeenCalled();
    });

    it('routes errors through handleDbExceptions', async () => {
      repo.__qb.getMany.mockRejectedValueOnce(new Error('e'));
      await expect(service.findAllFilter({} as any)).rejects.toThrow('e');
    });
  });

  describe('findAllTotal', () => {
    it('returns the count', async () => {
      repo.__qb.getCount.mockResolvedValueOnce(7);
      const result = await service.findAllTotal({} as any);
      expect(result).toEqual({ errorCode: ErrorCode.NONE, total: 7 });
    });

    it('appends conditions when provided', async () => {
      repo.__qb.getCount.mockResolvedValueOnce(0);
      await service.findAllTotal({ search: 'q' } as any);
      expect(repo.__qb.andWhere).toHaveBeenCalled();
    });

    it('routes errors through handleDbExceptions', async () => {
      repo.__qb.getCount.mockRejectedValueOnce(new Error('e'));
      await expect(service.findAllTotal({} as any)).rejects.toThrow('e');
    });
  });

  describe('update', () => {
    it('saves, logs and returns the preloaded sale point', async () => {
      repo.preload.mockResolvedValueOnce({ id: 1 });
      const result = await service.update(1, 1, {} as any);
      expect(repo.save).toHaveBeenCalled();
      expect(loggerService.saveSalePointLogger).toHaveBeenCalledWith(
        expect.objectContaining({ typeOperation: TypeOperation.UPDATE }),
      );
      expect(result).toEqual({ errorCode: ErrorCode.NONE, salePoint: { id: 1 } });
    });

    it('returns undefined when preload yields nothing', async () => {
      repo.preload.mockResolvedValueOnce(undefined);
      const result = await service.update(1, 1, {} as any);
      expect(result).toBeUndefined();
    });

    it('routes errors through handleDbExceptions', async () => {
      repo.preload.mockRejectedValueOnce(new Error('e'));
      await expect(service.update(1, 1, {} as any)).rejects.toThrow('e');
    });
  });
});
