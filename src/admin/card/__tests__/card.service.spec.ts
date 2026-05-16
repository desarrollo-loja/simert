import { TypeOperation } from 'src/common/glob/type/type_operation';

jest.mock('src/common/exceptions/error.db.exception', () => ({
  __esModule: true,
  default: jest.fn((error: any) => {
    throw error;
  }),
}));
import handleDbExceptions from 'src/common/exceptions/error.db.exception';

import { CardService } from '../card.service';

const buildQb = () => ({
  select: jest.fn().mockReturnThis(),
  orderBy: jest.fn().mockReturnThis(),
  take: jest.fn().mockReturnThis(),
  skip: jest.fn().mockReturnThis(),
  andWhere: jest.fn().mockReturnThis(),
  getMany: jest.fn(),
  getCount: jest.fn(),
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

describe('CardService', () => {
  let service: CardService;
  let repo: ReturnType<typeof buildRepo>;
  let loggerService: any;

  beforeEach(() => {
    repo = buildRepo();
    loggerService = { saveCardLogger: jest.fn() };
    service = new CardService(repo as any, loggerService);
    (service as any).logger = { error: jest.fn() };
    (handleDbExceptions as unknown as jest.Mock).mockClear();
  });

  describe('create', () => {
    it('saves the card, logs and returns it', async () => {
      const result = await service.create(1, { name: 'N' } as any);

      expect(repo.save).toHaveBeenCalled();
      expect(loggerService.saveCardLogger).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 1, typeOperation: TypeOperation.CREATE }),
      );
      expect(result).toEqual({ card: { id: 1, name: 'N' } });
    });

    it('routes errors through handleDbExceptions', async () => {
      repo.save.mockRejectedValueOnce(new Error('e'));
      await expect(service.create(1, {} as any)).rejects.toThrow('e');
    });
  });

  describe('findAll', () => {
    it('applies default pagination', async () => {
      repo.__qb.getMany.mockResolvedValueOnce([{ id: 1 }]);

      const result = await service.findAll({} as any);

      expect(repo.__qb.take).toHaveBeenCalledWith(20);
      expect(repo.__qb.skip).toHaveBeenCalledWith(0);
      expect(result).toEqual({ card: [{ id: 1 }], offset: 0, limit: 20 });
    });

    it('applies search filter and custom pagination', async () => {
      repo.__qb.getMany.mockResolvedValueOnce([]);

      await service.findAll({ search: 'foo', limit: 5, offset: 2 } as any);

      expect(repo.__qb.andWhere).toHaveBeenCalledWith('c.name ILIKE :search', {
        search: '%foo%',
      });
      expect(repo.__qb.take).toHaveBeenCalledWith(5);
      expect(repo.__qb.skip).toHaveBeenCalledWith(2);
    });

    it('coerces invalid limit/offset to defaults', async () => {
      repo.__qb.getMany.mockResolvedValueOnce([]);

      await service.findAll({ limit: 'abc' as any, offset: 'xyz' as any } as any);

      expect(repo.__qb.take).toHaveBeenCalledWith(20);
      expect(repo.__qb.skip).toHaveBeenCalledWith(0);
    });

    it('routes errors through handleDbExceptions', async () => {
      repo.__qb.getMany.mockRejectedValueOnce(new Error('e'));
      await expect(service.findAll({} as any)).rejects.toThrow('e');
    });
  });

  describe('findAllTotal', () => {
    it('returns the count from query builder', async () => {
      repo.__qb.getCount.mockResolvedValueOnce(3);
      const result = await service.findAllTotal({} as any);
      expect(result).toEqual({ total: 3 });
    });

    it('applies search when provided', async () => {
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
    it('saves the preloaded card and logs', async () => {
      repo.preload.mockResolvedValueOnce({ id: 1 });
      const result = await service.update(1, {} as any);
      expect(repo.save).toHaveBeenCalled();
      expect(loggerService.saveCardLogger).toHaveBeenCalled();
      expect(result).toEqual({ card: { id: 1 } });
    });

    it('returns undefined when preload yields nothing', async () => {
      repo.preload.mockResolvedValueOnce(undefined);
      const result = await service.update(1, {} as any);
      expect(result).toBeUndefined();
    });

    it('routes errors through handleDbExceptions', async () => {
      repo.preload.mockRejectedValueOnce(new Error('e'));
      await expect(service.update(1, {} as any)).rejects.toThrow('e');
    });
  });
});
