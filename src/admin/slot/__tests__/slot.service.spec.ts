import { ErrorCode } from 'src/common/glob/error';
import { TypeOperation } from 'src/common/glob/type/type_operation';

jest.mock('src/common/exceptions/error.db.exception', () => ({
  __esModule: true,
  default: jest.fn((error: any) => {
    throw error;
  }),
}));
import handleDbExceptions from 'src/common/exceptions/error.db.exception';

import { SlotService } from '../slot.service';

const buildQb = () => ({
  select: jest.fn().mockReturnThis(),
  addSelect: jest.fn().mockReturnThis(),
  innerJoin: jest.fn().mockReturnThis(),
  leftJoin: jest.fn().mockReturnThis(),
  where: jest.fn().mockReturnThis(),
  andWhere: jest.fn().mockReturnThis(),
  orderBy: jest.fn().mockReturnThis(),
  take: jest.fn().mockReturnThis(),
  skip: jest.fn().mockReturnThis(),
  getMany: jest.fn(),
  getCount: jest.fn(),
  getRawMany: jest.fn(),
});

const buildRepo = () => {
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

describe('SlotService', () => {
  let service: SlotService;
  let repo: ReturnType<typeof buildRepo>;
  let loggerService: any;

  beforeEach(() => {
    repo = buildRepo();
    loggerService = { saveSlotLogger: jest.fn() };
    service = new SlotService(repo as any, loggerService);
    (service as any).logger = { error: jest.fn(), log: jest.fn() };
    (handleDbExceptions as unknown as jest.Mock).mockClear();
  });

  describe('initializeDatabase', () => {
    it('creates and saves the initial slot', async () => {
      const result = await service.initializeDatabase();
      expect(repo.create).toHaveBeenCalled();
      expect(repo.save).toHaveBeenCalled();
      expect(result.slot1).toBeDefined();
    });
  });

  describe('create', () => {
    it('saves, logs and returns the slot', async () => {
      const result = await service.create(1, { slot: 'A1' } as any);
      expect(repo.save).toHaveBeenCalled();
      expect(loggerService.saveSlotLogger).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 1, typeOperation: TypeOperation.CREATE }),
      );
      expect(result).toEqual({ slot: { id: 1, slot: 'A1' } });
    });

    it('routes errors through handleDbExceptions', async () => {
      repo.save.mockRejectedValueOnce(new Error('e'));
      await expect(service.create(1, {} as any)).rejects.toThrow('e');
    });
  });

  describe('findAll', () => {
    it('runs paginated query and count', async () => {
      repo.__qb.getMany.mockResolvedValueOnce([{ id: 1 }]);
      repo.__qb.getCount.mockResolvedValueOnce(1);

      const result = await service.findAll({ offset: 0, limit: 10 } as any);

      expect(result).toEqual({ slots: [{ id: 1 }], total: 1, offset: 0, limit: 10 });
    });

    it('applies search filter when provided', async () => {
      repo.__qb.getMany.mockResolvedValueOnce([]);
      repo.__qb.getCount.mockResolvedValueOnce(0);
      await service.findAll({ search: 'q' } as any);
      expect(repo.__qb.where).toHaveBeenCalledWith('sl.slot ILIKE :search', { search: '%q%' });
    });

    it('routes errors through handleDbExceptions', async () => {
      repo.__qb.getMany.mockRejectedValueOnce(new Error('e'));
      await expect(service.findAll({} as any)).rejects.toThrow('e');
    });
  });

  describe('findAllByfilter', () => {
    it('returns raw slots', async () => {
      repo.__qb.getRawMany.mockResolvedValueOnce([{ id: 1, name: 'A1' }]);
      const result = await service.findAllByfilter(1, 2);
      expect(result).toEqual({ slots: [{ id: 1, name: 'A1' }] });
    });

    it('routes errors through handleDbExceptions', async () => {
      repo.__qb.getRawMany.mockRejectedValueOnce(new Error('e'));
      await expect(service.findAllByfilter(1, 2)).rejects.toThrow('e');
    });
  });

  describe('update', () => {
    it('saves, logs and returns the preloaded slot', async () => {
      repo.preload.mockResolvedValueOnce({ id: 1 });
      const result = await service.update(1, 1, {} as any);
      expect(repo.save).toHaveBeenCalled();
      expect(loggerService.saveSlotLogger).toHaveBeenCalled();
      expect(result).toEqual({ slot: { id: 1 } });
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

  describe('getSlotsByBlockByZone', () => {
    it('returns the raw slots', async () => {
      repo.__qb.getRawMany.mockResolvedValueOnce([{ id: 1 }]);
      const result = await service.getSlotsByBlockByZone(1, 2);
      expect(result).toEqual({ slots: [{ id: 1 }] });
    });

    it('routes errors through handleDbExceptions', async () => {
      repo.__qb.getRawMany.mockRejectedValueOnce(new Error('e'));
      await expect(service.getSlotsByBlockByZone(1, 2)).rejects.toThrow('e');
    });
  });

  describe('getSlotsByPolygon', () => {
    it('returns empty slots when the table does not exist', async () => {
      repo.query.mockResolvedValueOnce([]); // _tableExists -> false
      const result = await service.getSlotsByPolygon({} as any);
      expect(result).toEqual({ slots: [] });
    });

    it('runs the query when table exists and polygon is provided', async () => {
      repo.query
        .mockResolvedValueOnce([{ table_name: 'slot' }]) // _tableExists -> true
        .mockResolvedValueOnce([{ id: 1 }]);

      const result = await service.getSlotsByPolygon({
        polygon: 'POLYGON((0 0,1 1,2 2,0 0))',
      } as any);

      expect(result).toEqual({ slots: [{ id: 1 }] });
      const [sql, params] = repo.query.mock.calls[1];
      expect(sql).toContain('WHERE');
      expect(params).toEqual(['POLYGON((0 0,1 1,2 2,0 0))']);
    });

    it('skips polygon condition when string does not start with POLYGON', async () => {
      repo.query
        .mockResolvedValueOnce([{ table_name: 'slot' }])
        .mockResolvedValueOnce([]);

      await service.getSlotsByPolygon({ polygon: 'NOT_VALID' } as any);

      const [sql] = repo.query.mock.calls[1];
      expect(sql).not.toContain('WHERE');
    });

    it('routes errors through handleDbExceptions', async () => {
      repo.query
        .mockResolvedValueOnce([{ table_name: 'slot' }]) // _tableExists -> true
        .mockRejectedValueOnce(new Error('e'));
      await expect(service.getSlotsByPolygon({} as any)).rejects.toThrow('e');
    });
  });

  describe('findAllSlotBlockParking', () => {
    it('returns NOT_FOUND when no slots match', async () => {
      repo.__qb.getMany.mockResolvedValueOnce([]);
      const result = await service.findAllSlotBlockParking(1, 1, {} as any);
      expect(result).toEqual({ errorCode: ErrorCode.NOT_FOUND, slot: [] });
    });

    it('returns slots when found and applies all filters', async () => {
      repo.__qb.getMany.mockResolvedValueOnce([{ id: 1 }]);
      const result = await service.findAllSlotBlockParking(1, 1, {
        search: 'q',
        typeSlot: 2 as any,
        statusSlot: 3 as any,
      } as any);
      expect(result).toEqual({ errorCode: ErrorCode.NONE, slot: [{ id: 1 }] });
      expect(repo.__qb.andWhere).toHaveBeenCalledWith('s.blockId = :blockId', { blockId: 1 });
      expect(repo.__qb.andWhere).toHaveBeenCalledWith('s.zoneId = :zoneId', { zoneId: 1 });
      expect(repo.__qb.andWhere).toHaveBeenCalledWith('s.slot ILIKE :search', { search: '%q%' });
      expect(repo.__qb.andWhere).toHaveBeenCalledWith('s.typeSlot = :typeSlot', { typeSlot: 2 });
      expect(repo.__qb.andWhere).toHaveBeenCalledWith('s.status = :statusSlot', { statusSlot: 3 });
    });

    it('handles undefined filterDto', async () => {
      repo.__qb.getMany.mockResolvedValueOnce([{ id: 1 }]);
      const result = await service.findAllSlotBlockParking(0, 0);
      expect(result?.errorCode).toBe(ErrorCode.NONE);
    });

    it('routes errors through handleDbExceptions', async () => {
      repo.__qb.getMany.mockRejectedValueOnce(new Error('e'));
      await expect(service.findAllSlotBlockParking(1, 1, {} as any)).rejects.toThrow('e');
    });
  });

  describe('_tableExists', () => {
    it('returns false when no schema is specified', async () => {
      const result = await service._tableExists('slot');
      expect(result).toBe(false);
      expect(repo.query).not.toHaveBeenCalled();
    });

    it('passes schema and table as bound parameters', async () => {
      repo.query.mockResolvedValueOnce([{ table_name: 'slot' }]);
      const result = await service._tableExists('public.slot');
      expect(result).toBe(true);
      expect(repo.query.mock.calls[0][1]).toEqual(['public', 'slot']);
    });

    it('returns false when query result is empty', async () => {
      repo.query.mockResolvedValueOnce([]);
      const result = await service._tableExists('public.slot');
      expect(result).toBe(false);
    });

    it('returns false on DB error', async () => {
      repo.query.mockRejectedValueOnce(new Error('e'));
      const result = await service._tableExists('public.slot');
      expect(result).toBe(false);
    });
  });

  describe('findStatistics', () => {
    it('returns NOT_FOUND when no rows', async () => {
      repo.query.mockResolvedValueOnce([]);
      const result = await service.findStatistics({} as any);
      expect(result?.errorCode).toBe(ErrorCode.NOT_FOUND);
    });

    it('returns the aggregated counts', async () => {
      repo.query.mockResolvedValueOnce([{ available: 1 }]);
      const result: any = await service.findStatistics({ zoneId: 1, blockId: 2 } as any);
      expect(result.errorCode).toBe(ErrorCode.NONE);
      expect(result.slots).toEqual([{ available: 1 }]);
      const [sql, params] = repo.query.mock.calls[0];
      expect(sql).toContain('s."zoneId"');
      expect(sql).toContain('s."blockId"');
      expect(params).toEqual([1, 2]);
    });

    it('routes errors through handleDbExceptions', async () => {
      repo.query.mockRejectedValueOnce(new Error('e'));
      await expect(service.findStatistics({} as any)).rejects.toThrow('e');
    });
  });
});
