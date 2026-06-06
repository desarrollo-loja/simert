import { ErrorCode } from 'src/common/glob/error';
import { TypeOperation } from 'src/common/glob/type/type_operation';

jest.mock('src/common/exceptions/error.db.exception', () => ({
  __esModule: true,
  PG_UNIQUE_VIOLATION: '23505',
  default: jest.fn((error: any) => {
    throw error;
  }),
}));
import handleDbExceptions from 'src/common/exceptions/error.db.exception';

import { CatalogService } from '../catalog.service';

const buildQb = () => ({
  select: jest.fn().mockReturnThis(),
  addSelect: jest.fn().mockReturnThis(),
  orderBy: jest.fn().mockReturnThis(),
  limit: jest.fn().mockReturnThis(),
  offset: jest.fn().mockReturnThis(),
  andWhere: jest.fn().mockReturnThis(),
  getCount: jest.fn().mockResolvedValue(0),
  getRawMany: jest.fn(),
});

const buildRepo = () => {
  const qb = buildQb();
  return {
    create: jest.fn((dto: any) => ({ ...dto })),
    save: jest.fn(async (e: any) => ({ id: 1, ...e })),
    preload: jest.fn(),
    createQueryBuilder: jest.fn(() => qb),
    __qb: qb,
  };
};

describe('CatalogService', () => {
  let service: CatalogService;
  let repo: ReturnType<typeof buildRepo>;
  let loggerService: any;

  beforeEach(() => {
    repo = buildRepo();
    loggerService = { saveCatalogLogger: jest.fn() };
    service = new CatalogService(repo as any, loggerService);
    (service as any).logger = { error: jest.fn() };
    (handleDbExceptions as unknown as jest.Mock).mockClear();
  });

  describe('create', () => {
    it('saves, logs and returns the catalog', async () => {
      const result = await service.create(1, { name: 'n' } as any);
      expect(repo.save).toHaveBeenCalled();
      expect(loggerService.saveCatalogLogger).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 1, typeOperation: TypeOperation.CREATE }),
      );
      expect(result?.errorCode).toBe(ErrorCode.NONE);
    });

    it('routes errors through handleDbExceptions', async () => {
      repo.save.mockRejectedValueOnce(new Error('e'));
      await expect(service.create(1, {} as any)).rejects.toThrow('e');
    });
  });

  describe('findAll', () => {
    it('applies default pagination and returns rows', async () => {
      repo.__qb.getRawMany.mockResolvedValueOnce([{ id: 1 }]);
      const result = await service.findAll({} as any);
      expect(repo.__qb.limit).toHaveBeenCalledWith(20);
      expect(repo.__qb.offset).toHaveBeenCalledWith(0);
      expect(result).toEqual({
        errorCode: ErrorCode.NONE,
        catalog: [{ id: 1 }],
        total: 0,
        offset: 0,
        limit: 20,
      });
    });

    it('applies search and custom pagination', async () => {
      repo.__qb.getRawMany.mockResolvedValueOnce([]);
      await service.findAll({ search: 'foo', limit: 5, offset: 2 } as any);
      expect(repo.__qb.andWhere).toHaveBeenCalledWith(
        '(c.name ILIKE :search OR c.description ILIKE :search)',
        {
          search: '%foo%',
        },
      );
      expect(repo.__qb.limit).toHaveBeenCalledWith(5);
      expect(repo.__qb.offset).toHaveBeenCalledWith(2);
    });

    it('coerces invalid limit/offset to defaults', async () => {
      repo.__qb.getRawMany.mockResolvedValueOnce([]);
      await service.findAll({ limit: 'abc' as any, offset: 'xyz' as any } as any);
      expect(repo.__qb.limit).toHaveBeenCalledWith(20);
      expect(repo.__qb.offset).toHaveBeenCalledWith(0);
    });

    it('routes errors through handleDbExceptions', async () => {
      repo.__qb.getRawMany.mockRejectedValueOnce(new Error('e'));
      await expect(service.findAll({} as any)).rejects.toThrow('e');
    });
  });

  describe('update', () => {
    it('saves and logs when preload returns entity', async () => {
      repo.preload.mockResolvedValueOnce({ id: 1 });
      const result = await service.update(1, 1, {} as any);
      expect(repo.save).toHaveBeenCalled();
      expect(loggerService.saveCatalogLogger).toHaveBeenCalled();
      expect(result?.errorCode).toBe(ErrorCode.NONE);
    });

    it('returns NOT_FOUND when preload yields nothing', async () => {
      repo.preload.mockResolvedValueOnce(undefined);
      const result = await service.update(1, 1, {} as any);
      expect(result?.errorCode).toBe(ErrorCode.NOT_FOUND);
    });

    it('routes errors through handleDbExceptions', async () => {
      repo.preload.mockRejectedValueOnce(new Error('e'));
      await expect(service.update(1, 1, {} as any)).rejects.toThrow('e');
    });
  });
});
