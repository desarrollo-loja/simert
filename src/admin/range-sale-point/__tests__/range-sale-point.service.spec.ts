/* eslint-disable @typescript-eslint/no-var-requires */
import { ErrorCode } from 'src/common/glob/error';
import { TypeOperation } from 'src/common/glob/type/type_operation';

// Spy on default-exported `handleDbExceptions` so we can assert behavior on
// thrown errors without exercising the real Nest exception classes.
jest.mock('src/common/exceptions/error.db.exception', () => ({
  __esModule: true,
  default: jest.fn((error: any) => {
    throw error;
  }),
}));
import handleDbExceptions from 'src/common/exceptions/error.db.exception';

import { RangeSalePointService } from '../range-sale-point.service';

// Chainable QueryBuilder mock; every chainable method returns the same object.
const buildQbMock = () => {
  const qb: any = {
    addSelect: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    innerJoin: jest.fn().mockReturnThis(),
    getRawAndEntities: jest.fn(),
    getCount: jest.fn(),
    getRawOne: jest.fn(),
    getOne: jest.fn(),
  };
  return qb;
};

const buildRepoMock = () => {
  const qb = buildQbMock();
  return {
    create: jest.fn((dto: any) => dto),
    save: jest.fn(async (e: any) => e),
    preload: jest.fn(),
    createQueryBuilder: jest.fn(() => qb),
    __qb: qb,
  };
};

const buildLoggerServiceMock = () => ({
  saveRangeSalePointLogger: jest.fn(),
});

describe('RangeSalePointService', () => {
  let service: RangeSalePointService;
  let repo: ReturnType<typeof buildRepoMock>;
  let loggerService: ReturnType<typeof buildLoggerServiceMock>;

  beforeEach(() => {
    repo = buildRepoMock();
    loggerService = buildLoggerServiceMock();
    service = new RangeSalePointService(repo as any, loggerService as any);
    // Silence the internal Logger so test output stays clean.
    (service as any).logger = { error: jest.fn(), log: jest.fn(), warn: jest.fn() };

    (handleDbExceptions as unknown as jest.Mock).mockClear();
  });

  describe('create', () => {
    it('persists the range sale point, logs and returns NONE', async () => {
      const dto: any = { sold: 5, salePointId: 1 };
      repo.save.mockResolvedValueOnce({ id: 10, ...dto });

      const result = await service.create(2, dto);

      expect(repo.create).toHaveBeenCalledWith(dto);
      expect(repo.save).toHaveBeenCalled();
      expect(loggerService.saveRangeSalePointLogger).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 2,
          typeOperation: TypeOperation.CREATE,
        }),
      );
      expect(result).toMatchObject({ errorCode: ErrorCode.NONE });
    });

    it('routes errors through handleDbExceptions', async () => {
      repo.save.mockRejectedValueOnce(new Error('boom'));

      await expect(service.create(1, {} as any)).rejects.toThrow('boom');
      expect(handleDbExceptions).toHaveBeenCalled();
    });
  });

  describe('findAll', () => {
    it('returns merged entities with formatted dates when no filters', async () => {
      repo.__qb.getRawAndEntities.mockResolvedValueOnce({
        entities: [{ id: 1 }],
        raw: [{ rsp_createdAt: '2026-01-01 00:00:00', rsp_updatedAt: '2026-01-02 00:00:00' }],
      });

      const result: any = await service.findAll({} as any);

      expect(result.errorCode).toBe(ErrorCode.NONE);
      expect(result.rangeSalePoints).toEqual([
        { id: 1, createdAt: '2026-01-01 00:00:00', updatedAt: '2026-01-02 00:00:00' },
      ]);
      // No conditions => andWhere not called.
      expect(repo.__qb.andWhere).not.toHaveBeenCalled();
    });

    it('falls back to null when raw row is missing', async () => {
      repo.__qb.getRawAndEntities.mockResolvedValueOnce({
        entities: [{ id: 1 }],
        raw: [],
      });

      const result: any = await service.findAll({} as any);

      expect(result.rangeSalePoints[0].createdAt).toBeNull();
      expect(result.rangeSalePoints[0].updatedAt).toBeNull();
    });

    it('applies userId and salePointId filters when provided', async () => {
      repo.__qb.getRawAndEntities.mockResolvedValueOnce({ entities: [], raw: [] });

      await service.findAll({ userId: 5, salePointId: 9 } as any);

      expect(repo.__qb.andWhere).toHaveBeenCalledWith(
        'rsp.userId = :userId AND rsp.salePointId = :salePointId',
        { userId: 5, salePointId: 9 },
      );
    });

    it('routes errors through handleDbExceptions', async () => {
      repo.__qb.getRawAndEntities.mockRejectedValueOnce(new Error('db'));

      await expect(service.findAll({} as any)).rejects.toThrow('db');
      expect(handleDbExceptions).toHaveBeenCalled();
    });
  });

  describe('findAllTotal', () => {
    it('returns the count with no filters', async () => {
      repo.__qb.getCount.mockResolvedValueOnce(42);

      const result = await service.findAllTotal({} as any);

      expect(result).toEqual({ errorCode: ErrorCode.NONE, total: 42 });
      expect(repo.__qb.andWhere).not.toHaveBeenCalled();
    });

    it('applies conditions when filters provided', async () => {
      repo.__qb.getCount.mockResolvedValueOnce(3);

      await service.findAllTotal({ userId: 1 } as any);

      expect(repo.__qb.andWhere).toHaveBeenCalledWith('rsp.userId = :userId', { userId: 1 });
    });

    it('routes errors through handleDbExceptions', async () => {
      repo.__qb.getCount.mockRejectedValueOnce(new Error('x'));
      await expect(service.findAllTotal({} as any)).rejects.toThrow('x');
    });
  });

  describe('getAvailable', () => {
    it('computes stock/available with no filters', async () => {
      repo.__qb.getRawOne.mockResolvedValueOnce({ availableSum: '10' });

      const result: any = await service.getAvailable({} as any);

      expect(result.errorCode).toBe(ErrorCode.NONE);
      expect(result.stock).toBe(10);
      expect(result.available).toBe(result.maximum - 10);
      expect(repo.__qb.andWhere).not.toHaveBeenCalled();
    });

    it('applies conditions when filters provided', async () => {
      repo.__qb.getRawOne.mockResolvedValueOnce({ availableSum: '0' });

      await service.getAvailable({ salePointId: 9 } as any);

      expect(repo.__qb.andWhere).toHaveBeenCalled();
    });

    it('routes errors through handleDbExceptions', async () => {
      repo.__qb.getRawOne.mockRejectedValueOnce(new Error('x'));
      await expect(service.getAvailable({} as any)).rejects.toThrow('x');
    });
  });

  describe('findOne', () => {
    it('returns the formatted entity when present', async () => {
      repo.__qb.getRawAndEntities.mockResolvedValueOnce({
        entities: [{ id: 1 }],
        raw: [{ rsp_createdAt: 'A', rsp_updatedAt: 'B' }],
      });

      const result: any = await service.findOne(1);

      expect(result.errorCode).toBe(ErrorCode.NONE);
      expect(result.rangeSalePoint).toEqual({ id: 1, createdAt: 'A', updatedAt: 'B' });
    });

    it('returns null entity when not found', async () => {
      repo.__qb.getRawAndEntities.mockResolvedValueOnce({ entities: [], raw: [] });

      const result: any = await service.findOne(1);

      expect(result).toEqual({ errorCode: ErrorCode.NONE, rangeSalePoint: null });
    });

    it('falls back to null for missing raw row fields', async () => {
      repo.__qb.getRawAndEntities.mockResolvedValueOnce({
        entities: [{ id: 1 }],
        raw: [],
      });

      const result: any = await service.findOne(1);

      expect(result.rangeSalePoint.createdAt).toBeNull();
      expect(result.rangeSalePoint.updatedAt).toBeNull();
    });

    it('routes errors through handleDbExceptions', async () => {
      repo.__qb.getRawAndEntities.mockRejectedValueOnce(new Error('e'));
      await expect(service.findOne(1)).rejects.toThrow('e');
    });
  });

  describe('update', () => {
    it('saves preloaded entity, logs and returns NONE', async () => {
      repo.preload.mockResolvedValueOnce({ id: 1, sold: 7 });

      const result: any = await service.update(2, 1, { sold: 7 } as any);

      expect(repo.save).toHaveBeenCalled();
      expect(loggerService.saveRangeSalePointLogger).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 2,
          typeOperation: TypeOperation.UPDATE,
        }),
      );
      expect(result.errorCode).toBe(ErrorCode.NONE);
    });

    it('returns undefined when preload yields nothing', async () => {
      repo.preload.mockResolvedValueOnce(undefined);

      const result = await service.update(2, 1, {} as any);

      expect(result).toBeUndefined();
      expect(repo.save).not.toHaveBeenCalled();
    });

    it('routes errors through handleDbExceptions', async () => {
      repo.preload.mockRejectedValueOnce(new Error('p'));
      await expect(service.update(1, 1, {} as any)).rejects.toThrow('p');
    });
  });
});
