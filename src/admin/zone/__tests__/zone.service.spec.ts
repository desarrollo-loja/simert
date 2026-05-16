import { QueryFailedError } from 'typeorm';

import { ErrorCode } from 'src/common/glob/error';
import { TypeOperation } from 'src/common/glob/type/type_operation';

jest.mock('src/common/exceptions/error.db.exception', () => ({
  __esModule: true,
  default: jest.fn((error: any) => {
    throw error;
  }),
}));
import handleDbExceptions from 'src/common/exceptions/error.db.exception';

jest.mock('src/common/glob/utilities/funtions', () => ({
  parseGeoJsonMultiPolygon: jest.fn(() => [['parsed-geofence']]),
}));

import { ZoneService } from '../zone.service';

const buildQb = () => ({
  select: jest.fn().mockReturnThis(),
  where: jest.fn().mockReturnThis(),
  andWhere: jest.fn().mockReturnThis(),
  getMany: jest.fn(),
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

const buildQueryFailedError = (code: string, constraint?: string) => {
  const err: any = new QueryFailedError('q', [], new Error('inner'));
  err.driverError = { code, constraint };
  return err;
};

describe('ZoneService', () => {
  let service: ZoneService;
  let repo: ReturnType<typeof buildRepo>;
  let loggerService: any;

  beforeEach(() => {
    repo = buildRepo();
    loggerService = { saveZoneLogger: jest.fn() };
    service = new ZoneService(repo as any, loggerService);
    (service as any).logger = { error: jest.fn(), log: jest.fn() };
    (handleDbExceptions as unknown as jest.Mock).mockClear();
  });

  describe('create', () => {
    it('saves, logs and returns the zone', async () => {
      const result = await service.create(1, { name: 'A' } as any);
      expect(repo.save).toHaveBeenCalled();
      expect(loggerService.saveZoneLogger).toHaveBeenCalledWith(
        expect.objectContaining({ typeOperation: TypeOperation.CREATE }),
      );
      expect(result?.errorCode).toBe(ErrorCode.NONE);
    });

    it('builds the WKT geofence function when geofence is provided', async () => {
      await service.create(1, { name: 'A', geofence: '0 0,1 1,2 2,0 0' } as any);
      const savedArg = repo.save.mock.calls[0][0];
      expect(typeof savedArg.geofence).toBe('function');
      expect(savedArg.geofence()).toContain('ST_GeomFromText');
    });

    it('returns NAMEUNIQUE on 23505 with name constraint', async () => {
      repo.save.mockRejectedValueOnce(buildQueryFailedError('23505', 'UQ_name'));
      const result = await service.create(1, {} as any);
      expect(result).toEqual({ errorCode: ErrorCode.NAMEUNIQUE });
    });

    it('returns NAMEUNIQUE on 23505 with non-name constraint', async () => {
      repo.save.mockRejectedValueOnce(buildQueryFailedError('23505', 'UQ_other'));
      const result = await service.create(1, {} as any);
      expect(result).toEqual({ errorCode: ErrorCode.NAMEUNIQUE });
    });

    it('routes other errors through handleDbExceptions', async () => {
      repo.save.mockRejectedValueOnce(new Error('boom'));
      await expect(service.create(1, {} as any)).rejects.toThrow('boom');
    });
  });

  describe('findAllByFilterParking', () => {
    it('returns zones with parsed geofence', async () => {
      repo.__qb.getMany.mockResolvedValueOnce([{ id: 1, geofence: 'raw' }]);
      const result: any = await service.findAllByFilterParking({} as any);
      expect(result.zones[0].geofence).toEqual([['parsed-geofence']]);
    });

    it('returns empty list when no zones', async () => {
      repo.__qb.getMany.mockResolvedValueOnce([]);
      const result: any = await service.findAllByFilterParking({} as any);
      expect(result.zones).toEqual([]);
    });

    it('applies search filter when provided', async () => {
      repo.__qb.getMany.mockResolvedValueOnce([]);
      await service.findAllByFilterParking({ search: 'q' } as any);
      expect(repo.__qb.andWhere).toHaveBeenCalled();
    });

    it('routes errors through handleDbExceptions', async () => {
      repo.__qb.getMany.mockRejectedValueOnce(new Error('e'));
      await expect(service.findAllByFilterParking({} as any)).rejects.toThrow('e');
    });
  });

  describe('findAll', () => {
    it('returns zones with parsed geofence and numberPolygon', async () => {
      repo.__qb.getMany.mockResolvedValueOnce([{ id: 1, geofence: 'raw' }]);
      const result: any = await service.findAll({} as any);
      expect(result.errorCode).toBe(ErrorCode.NONE);
      expect(result.zones[0].numberPolygon).toBe(1);
    });

    it('returns empty list when no zones', async () => {
      repo.__qb.getMany.mockResolvedValueOnce([]);
      const result: any = await service.findAll({} as any);
      expect(result).toEqual({ errorCode: ErrorCode.NONE, zones: [] });
    });

    it('applies search filter', async () => {
      repo.__qb.getMany.mockResolvedValueOnce([]);
      await service.findAll({ search: 'x' } as any);
      expect(repo.__qb.where).toHaveBeenCalled();
    });

    it('routes errors through handleDbExceptions', async () => {
      repo.__qb.getMany.mockRejectedValueOnce(new Error('e'));
      await expect(service.findAll({} as any)).rejects.toThrow('e');
    });
  });

  describe('findAllByActive', () => {
    it('returns active zones', async () => {
      repo.__qb.getMany.mockResolvedValueOnce([{ id: 1 }]);
      const result = await service.findAllByActive({} as any);
      expect(result).toEqual({ errorCode: ErrorCode.NONE, zones: [{ id: 1 }] });
    });

    it('applies search filter', async () => {
      repo.__qb.getMany.mockResolvedValueOnce([]);
      await service.findAllByActive({ search: 'q' } as any);
      expect(repo.__qb.andWhere).toHaveBeenCalled();
    });

    it('routes errors through handleDbExceptions', async () => {
      repo.__qb.getMany.mockRejectedValueOnce(new Error('e'));
      await expect(service.findAllByActive({} as any)).rejects.toThrow('e');
    });
  });

  describe('findAllByActives', () => {
    it('returns active zones', async () => {
      repo.__qb.getMany.mockResolvedValueOnce([{ id: 1 }]);
      const result = await service.findAllByActives({} as any);
      expect(result).toEqual({ errorCode: ErrorCode.NONE, zones: [{ id: 1 }] });
    });

    it('applies search filter', async () => {
      repo.__qb.getMany.mockResolvedValueOnce([]);
      await service.findAllByActives({ search: 'q' } as any);
      expect(repo.__qb.andWhere).toHaveBeenCalled();
    });

    it('routes errors through handleDbExceptions', async () => {
      repo.__qb.getMany.mockRejectedValueOnce(new Error('e'));
      await expect(service.findAllByActives({} as any)).rejects.toThrow('e');
    });
  });

  describe('update', () => {
    it('saves and returns the updated zone', async () => {
      repo.preload.mockResolvedValueOnce({ id: 1 });
      const result: any = await service.update(1, 1, {} as any);
      expect(repo.save).toHaveBeenCalled();
      expect(result.errorCode).toBe(ErrorCode.NONE);
    });

    it('sets geofence function when geofence is provided', async () => {
      const entity: any = { id: 1 };
      repo.preload.mockResolvedValueOnce(entity);
      await service.update(1, 1, { geofence: 'POLYGON((0 0))' } as any);
      expect(typeof entity.geofence).toBe('function');
      expect(entity.geofence()).toContain('ST_GeomFromText');
    });

    it('returns empty zone when preload yields nothing', async () => {
      repo.preload.mockResolvedValueOnce(undefined);
      const result = await service.update(1, 1, {} as any);
      expect(result).toEqual({ errorCode: ErrorCode.NONE, zone: {} });
    });

    it('returns NAMEUNIQUE on 23505 with name constraint', async () => {
      repo.preload.mockRejectedValueOnce(buildQueryFailedError('23505', 'UQ_name'));
      const result = await service.update(1, 1, {} as any);
      expect(result).toEqual({ errorCode: ErrorCode.NAMEUNIQUE });
    });

    it('returns NAMEUNIQUE on 23505 with non-name constraint', async () => {
      repo.preload.mockRejectedValueOnce(buildQueryFailedError('23505', 'UQ_other'));
      const result = await service.update(1, 1, {} as any);
      expect(result).toEqual({ errorCode: ErrorCode.NAMEUNIQUE });
    });

    it('routes other errors through handleDbExceptions', async () => {
      repo.preload.mockRejectedValueOnce(new Error('e'));
      await expect(service.update(1, 1, {} as any)).rejects.toThrow('e');
    });
  });

  describe('remove', () => {
    it('soft-deletes when zone exists', async () => {
      repo.findOne.mockResolvedValueOnce({ id: 1, isActivated: true });
      const result: any = await service.remove(1, 1);
      expect(repo.save).toHaveBeenCalledWith(
        expect.objectContaining({ isActivated: false }),
      );
      expect(result.errorCode).toBe(ErrorCode.NONE);
    });

    it('returns empty zone when not found', async () => {
      repo.findOne.mockResolvedValueOnce(null);
      const result = await service.remove(1, 1);
      expect(result).toEqual({ errorCode: ErrorCode.NONE, zone: {} });
    });

    it('routes errors through handleDbExceptions', async () => {
      repo.findOne.mockRejectedValueOnce(new Error('e'));
      await expect(service.remove(1, 1)).rejects.toThrow('e');
    });
  });
});
