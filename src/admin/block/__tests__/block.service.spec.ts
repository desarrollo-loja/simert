import { TypeOperation } from 'src/common/glob/type/type_operation';
import { ErrorCode } from 'src/common/glob/error';

jest.mock('src/common/exceptions/error.db.exception', () => ({
  __esModule: true,
  default: jest.fn((error: any) => {
    throw error;
  }),
}));
import handleDbExceptions from 'src/common/exceptions/error.db.exception';

// Mock geo helpers so we don't depend on their implementation.
jest.mock('src/common/glob/utilities/funtions', () => ({
  __esModule: true,
  parseGeoJsonMultiPolygon: jest.fn((g: any) => (Array.isArray(g) ? g : [g])),
  toIntArray: jest.fn((val: any) => {
    if (val === undefined || val === null) return [];
    if (Array.isArray(val)) return val.map((n) => Number(n));
    return [Number(val)];
  }),
}));

import { BlockService } from '../block.service';

const buildQb = () => ({
  select: jest.fn().mockReturnThis(),
  innerJoin: jest.fn().mockReturnThis(),
  where: jest.fn().mockReturnThis(),
  andWhere: jest.fn().mockReturnThis(),
  orderBy: jest.fn().mockReturnThis(),
  take: jest.fn().mockReturnThis(),
  skip: jest.fn().mockReturnThis(),
  getMany: jest.fn(),
  getCount: jest.fn(),
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

describe('BlockService', () => {
  let service: BlockService;
  let repo: ReturnType<typeof buildRepo>;
  let loggerService: any;

  beforeEach(() => {
    repo = buildRepo();
    loggerService = { saveBlockLogger: jest.fn() };
    service = new BlockService(repo as any, loggerService);
    (service as any).logger = { error: jest.fn(), log: jest.fn(), warn: jest.fn() };
    (handleDbExceptions as unknown as jest.Mock).mockClear();
  });

  describe('initializeDatabase', () => {
    it('creates and saves two sample blocks', async () => {
      const result = await service.initializeDatabase();
      expect(repo.create).toHaveBeenCalledTimes(2);
      expect(repo.save).toHaveBeenCalledTimes(2);
      expect(result.block1).toBeDefined();
      expect(result.block2).toBeDefined();
    });
  });

  describe('create', () => {
    it('saves block, applies WKT geofence and logs', async () => {
      const dto: any = { name: 'A', geofence: '1 2, 3 4' };
      const result = await service.create(1, dto);
      expect(repo.save).toHaveBeenCalled();
      const saved = repo.save.mock.calls[0][0];
      expect(typeof saved.geofence).toBe('function');
      expect(saved.geofence()).toContain("ST_GeomFromText('POLYGON((1 2, 3 4))')");
      expect(loggerService.saveBlockLogger).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 1, typeOperation: TypeOperation.CREATE }),
      );
      expect(result?.block).toBeDefined();
    });

    it('routes errors through handleDbExceptions', async () => {
      repo.save.mockRejectedValueOnce(new Error('e'));
      await expect(service.create(1, { geofence: '' } as any)).rejects.toThrow('e');
      expect(handleDbExceptions).toHaveBeenCalled();
    });
  });

  describe('findAll', () => {
    it('returns blocks and total with pagination', async () => {
      repo.__qb.getMany.mockResolvedValueOnce([{ id: 1 }]);
      repo.__qb.getCount.mockResolvedValueOnce(1);

      const result = await service.findAll({ limit: 10, offset: 0 } as any);

      expect(repo.__qb.take).toHaveBeenCalledWith(10);
      expect(repo.__qb.skip).toHaveBeenCalledWith(0);
      expect(result).toEqual({ blocks: [{ id: 1 }], total: 1, offset: 0, limit: 10 });
    });

    it('applies search filter', async () => {
      repo.__qb.getMany.mockResolvedValueOnce([]);
      repo.__qb.getCount.mockResolvedValueOnce(0);
      await service.findAll({ search: 'abc' } as any);
      expect(repo.__qb.andWhere).toHaveBeenCalledWith('bl.name ILIKE :search', {
        search: '%abc%',
      });
    });

    it('routes errors', async () => {
      repo.__qb.getMany.mockRejectedValueOnce(new Error('e'));
      await expect(service.findAll({} as any)).rejects.toThrow('e');
    });
  });

  describe('findAllByfilter', () => {
    it('returns blocks for given zone', async () => {
      repo.__qb.getMany.mockResolvedValueOnce([{ id: 1 }]);
      const result = await service.findAllByfilter(2);
      expect(repo.__qb.where).toHaveBeenCalledWith('bl.zoneId = :zoneId', { zoneId: 2 });
      expect(result).toEqual({ blocks: [{ id: 1 }] });
    });

    it('routes errors', async () => {
      repo.__qb.getMany.mockRejectedValueOnce(new Error('e'));
      await expect(service.findAllByfilter(1)).rejects.toThrow('e');
    });
  });

  describe('findAllByFilterParking', () => {
    it('parses geofence on returned blocks', async () => {
      repo.__qb.getMany.mockResolvedValueOnce([{ id: 1, geofence: { type: 'MultiPolygon' } }]);
      const result: any = await service.findAllByFilterParking(1, {} as any);
      expect(result.blocks).toHaveLength(1);
      expect(result.blocks[0].geofence).toBeDefined();
    });

    it('applies search and zoneId filters', async () => {
      repo.__qb.getMany.mockResolvedValueOnce([]);
      await service.findAllByFilterParking(1, { search: 'q', zoneId: 2 } as any);
      expect(repo.__qb.andWhere).toHaveBeenCalledWith('bl.name ILIKE :search', {
        search: '%q%',
      });
      expect(repo.__qb.andWhere).toHaveBeenCalledWith('bl.zoneId = :zoneId', { zoneId: 2 });
    });

    it('returns empty list when no blocks', async () => {
      repo.__qb.getMany.mockResolvedValueOnce([]);
      const result = await service.findAllByFilterParking(1, {} as any);
      expect(result).toEqual({ blocks: [] });
    });

    it('routes errors', async () => {
      repo.__qb.getMany.mockRejectedValueOnce(new Error('e'));
      await expect(service.findAllByFilterParking(1, {} as any)).rejects.toThrow('e');
    });
  });

  describe('findOne', () => {
    it('returns placeholder string', () => {
      expect(service.findOne(5)).toBe('This action returns a #5 block');
    });
  });

  describe('update', () => {
    it('saves the preloaded block, applies WKT geofence and logs', async () => {
      repo.preload.mockResolvedValueOnce({ id: 1 });
      const result = await service.update(1, 1, { geofence: '1 1, 2 2' } as any);
      expect(repo.save).toHaveBeenCalled();
      const saved = repo.save.mock.calls[0][0];
      expect(typeof saved.geofence).toBe('function');
      expect(saved.geofence()).toContain("ST_GeomFromText('POLYGON((1 1, 2 2))')");
      expect(loggerService.saveBlockLogger).toHaveBeenCalledWith(
        expect.objectContaining({ typeOperation: TypeOperation.UPDATE }),
      );
      expect(result?.block).toBeDefined();
    });

    it('returns undefined when preload yields nothing', async () => {
      repo.preload.mockResolvedValueOnce(undefined);
      const result = await service.update(1, 1, {} as any);
      expect(result).toBeUndefined();
    });

    it('routes errors', async () => {
      repo.preload.mockRejectedValueOnce(new Error('e'));
      await expect(service.update(1, 1, {} as any)).rejects.toThrow('e');
    });
  });

  describe('remove', () => {
    it('returns placeholder string', () => {
      expect(service.remove(5)).toBe('This action removes a #5 block');
    });
  });

  describe('getAllBlockSector', () => {
    it('returns NOT_FOUND when no rows', async () => {
      repo.query.mockResolvedValueOnce([]);
      const result = await service.getAllBlockSector({} as any);
      expect(result).toEqual({ errorCode: ErrorCode.NOT_FOUND, blocks: [] });
    });

    it('parses geofence and returns blocks', async () => {
      repo.query.mockResolvedValueOnce([
        {
          id: 1,
          geofence: '{"type":"MultiPolygon","coordinates":[]}',
          geofenceZone: '{"type":"MultiPolygon","coordinates":[]}',
        },
      ]);
      const result: any = await service.getAllBlockSector({} as any);
      expect(result.errorCode).toBe(ErrorCode.NONE);
      expect(result.blocks[0].numberPolygon).toBeGreaterThanOrEqual(0);
    });

    it('handles null geofence fields', async () => {
      repo.query.mockResolvedValueOnce([{ id: 1, geofence: null, geofenceZone: null }]);
      const result: any = await service.getAllBlockSector({} as any);
      expect(result.blocks[0].geofence).toEqual([]);
      expect(result.blocks[0].geofenceZone).toEqual([]);
    });

    it('applies single zoneId filter', async () => {
      repo.query.mockResolvedValueOnce([]);
      await service.getAllBlockSector({ zoneId: 5 } as any);
      const [sql, params] = repo.query.mock.calls[0];
      expect(sql).toContain('b."zoneId" = $1');
      expect(params).toEqual([5]);
    });

    it('applies multi zoneId filter with ANY()', async () => {
      repo.query.mockResolvedValueOnce([]);
      await service.getAllBlockSector({ zoneId: [1, 2] as any } as any);
      const [sql, params] = repo.query.mock.calls[0];
      expect(sql).toContain('ANY($1::int[])');
      expect(params[0]).toEqual([1, 2]);
    });

    it('applies search filter combined with zoneId', async () => {
      repo.query.mockResolvedValueOnce([]);
      await service.getAllBlockSector({ search: 'q', zoneId: 1 } as any);
      const [sql, params] = repo.query.mock.calls[0];
      expect(sql).toContain('b.name ILIKE $2');
      expect(params).toEqual([1, '%q%']);
    });

    it('ignores whitespace-only search', async () => {
      repo.query.mockResolvedValueOnce([]);
      await service.getAllBlockSector({ search: '   ' } as any);
      const params = repo.query.mock.calls[0][1];
      expect(params).toEqual([]);
    });

    it('routes errors', async () => {
      repo.query.mockRejectedValueOnce(new Error('e'));
      await expect(service.getAllBlockSector({} as any)).rejects.toThrow('e');
    });
  });

  describe('_tableExists', () => {
    it('returns false and logs when no schema is provided', async () => {
      const result = await service._tableExists('block');
      expect(result).toBe(false);
      expect(repo.query).not.toHaveBeenCalled();
    });

    it('queries information_schema with parameters and returns true', async () => {
      repo.query.mockResolvedValueOnce([{ table_name: 'x' }]);
      const result = await service._tableExists('history.x');
      expect(result).toBe(true);
      expect(repo.query.mock.calls[0][1]).toEqual(['history', 'x']);
    });

    it('returns false when result empty', async () => {
      repo.query.mockResolvedValueOnce([]);
      const result = await service._tableExists('a.b');
      expect(result).toBe(false);
    });

    it('returns false on error', async () => {
      repo.query.mockRejectedValueOnce(new Error('e'));
      const result = await service._tableExists('a.b');
      expect(result).toBe(false);
    });
  });

  describe('createBlockSector', () => {
    it('saves block with geofence and logs', async () => {
      const result = await service.createBlockSector(1, { geofence: '1 1, 2 2' } as any);
      expect(repo.save).toHaveBeenCalled();
      const saved = repo.save.mock.calls[0][0];
      expect(typeof saved.geofence).toBe('function');
      expect(saved.geofence()).toContain("ST_GeomFromText('POLYGON((1 1, 2 2))')");
      expect(loggerService.saveBlockLogger).toHaveBeenCalled();
      expect(result?.block).toBeDefined();
    });

    it('saves without geofence transformation when geofence absent', async () => {
      const result = await service.createBlockSector(1, { name: 'A' } as any);
      expect(repo.save).toHaveBeenCalled();
      const saved = repo.save.mock.calls[0][0];
      expect(saved.geofence).toBeUndefined();
      expect(result?.block).toBeDefined();
    });

    it('routes errors', async () => {
      repo.save.mockRejectedValueOnce(new Error('e'));
      await expect(service.createBlockSector(1, {} as any)).rejects.toThrow('e');
    });
  });

  describe('updateBlockSector', () => {
    it('saves preloaded block with geofence', async () => {
      repo.preload.mockResolvedValueOnce({ id: 1 });
      const result = await service.updateBlockSector(1, 1, { geofence: 'POLYGON(())' } as any);
      expect(repo.save).toHaveBeenCalled();
      const saved = repo.save.mock.calls[0][0];
      expect(typeof saved.geofence).toBe('function');
      expect(saved.geofence()).toContain("ST_GeomFromText('POLYGON(())')");
      expect(loggerService.saveBlockLogger).toHaveBeenCalled();
      expect(result?.block).toBeDefined();
    });

    it('saves without applying geofence when DTO has none', async () => {
      repo.preload.mockResolvedValueOnce({ id: 1 });
      const result = await service.updateBlockSector(1, 1, {} as any);
      expect(repo.save).toHaveBeenCalled();
      expect(result?.block).toBeDefined();
    });

    it('returns undefined when preload yields nothing', async () => {
      repo.preload.mockResolvedValueOnce(undefined);
      const result = await service.updateBlockSector(1, 1, {} as any);
      expect(result).toBeUndefined();
    });

    it('routes errors', async () => {
      repo.preload.mockRejectedValueOnce(new Error('e'));
      await expect(service.updateBlockSector(1, 1, {} as any)).rejects.toThrow('e');
    });
  });
});
