import { ErrorCode } from 'src/common/glob/error';

jest.mock('src/common/exceptions/error.db.exception', () => ({
  __esModule: true,
  default: jest.fn((error: any) => {
    throw error;
  }),
}));
import handleDbExceptions from 'src/common/exceptions/error.db.exception';

// Stub geofence parser to return a deterministic value.
jest.mock('src/common/glob/utilities/funtions', () => ({
  __esModule: true,
  parseGeoJsonMultiPolygon: jest.fn(() => ({ type: 'MultiPolygon', coordinates: [] })),
}));

import { MappingService } from '../mapping.service';

const buildQb = () => ({
  select: jest.fn().mockReturnThis(),
  where: jest.fn().mockReturnThis(),
  andWhere: jest.fn().mockReturnThis(),
  innerJoin: jest.fn().mockReturnThis(),
  leftJoin: jest.fn().mockReturnThis(),
  orderBy: jest.fn().mockReturnThis(),
  setParameters: jest.fn().mockReturnThis(),
  limit: jest.fn().mockReturnThis(),
  getMany: jest.fn(),
});

const buildRepo = () => {
  const qb = buildQb();
  return {
    createQueryBuilder: jest.fn(() => qb),
    __qb: qb,
  };
};

describe('MappingService', () => {
  let service: MappingService;
  let zoneRepo: ReturnType<typeof buildRepo>;
  let blockRepo: ReturnType<typeof buildRepo>;
  let slotRepo: ReturnType<typeof buildRepo>;

  beforeEach(() => {
    zoneRepo = buildRepo();
    blockRepo = buildRepo();
    slotRepo = buildRepo();
    service = new MappingService(zoneRepo as any, blockRepo as any, slotRepo as any);
    (service as any).logger = { error: jest.fn() };
    (handleDbExceptions as unknown as jest.Mock).mockClear();
  });

  describe('findAllZones', () => {
    it('returns NOT_FOUND when there are no zones', async () => {
      zoneRepo.__qb.getMany.mockResolvedValueOnce([]);
      const result = await service.findAllZones({} as any);
      expect(result).toEqual({ errorCode: ErrorCode.NOT_FOUND, zone: [] });
    });

    it('maps geofence and applies search filter', async () => {
      zoneRepo.__qb.getMany.mockResolvedValueOnce([{ id: 1, geofence: 'raw' }]);

      const result = await service.findAllZones({ search: 'abc' } as any);

      expect(zoneRepo.__qb.andWhere).toHaveBeenCalledWith('z.name ILIKE :search', {
        search: '%abc%',
      });
      expect(result?.errorCode).toBe(ErrorCode.NONE);
      expect((result as any).zone[0].geofence).toEqual({ type: 'MultiPolygon', coordinates: [] });
    });

    it('routes errors through handleDbExceptions', async () => {
      zoneRepo.__qb.getMany.mockRejectedValueOnce(new Error('e'));
      await expect(service.findAllZones({} as any)).rejects.toThrow('e');
    });
  });

  describe('findAllBlock', () => {
    it('returns NOT_FOUND when there are no blocks', async () => {
      blockRepo.__qb.getMany.mockResolvedValueOnce([]);
      const result = await service.findAllBlock({} as any);
      expect(result).toEqual({ errorCode: ErrorCode.NOT_FOUND, blocks: [] });
    });

    it('returns mapped blocks with a currentDate', async () => {
      blockRepo.__qb.getMany.mockResolvedValueOnce([{ id: 1, geofence: 'raw' }]);

      const result: any = await service.findAllBlock({ search: 'q' } as any);

      expect(blockRepo.__qb.andWhere).toHaveBeenCalledWith('bl.name ILIKE :search', {
        search: '%q%',
      });
      expect(result.errorCode).toBe(ErrorCode.NONE);
      expect(result.currentDate).toBeInstanceOf(Date);
    });

    it('routes errors through handleDbExceptions', async () => {
      blockRepo.__qb.getMany.mockRejectedValueOnce(new Error('e'));
      await expect(service.findAllBlock({} as any)).rejects.toThrow('e');
    });
  });

  describe('findAllSlot', () => {
    it('returns NOT_FOUND when there are no slots', async () => {
      slotRepo.__qb.getMany.mockResolvedValueOnce([]);
      const result = await service.findAllSlot({} as any);
      expect(result).toEqual({ errorCode: ErrorCode.NOT_FOUND, slots: [] });
    });

    it('applies search filter and returns slots', async () => {
      slotRepo.__qb.getMany.mockResolvedValueOnce([{ id: 1 }]);

      const result = await service.findAllSlot({ search: 'x' } as any);

      expect(slotRepo.__qb.andWhere).toHaveBeenCalledWith('sl.slot ILIKE :search', {
        search: '%x%',
      });
      expect(result).toEqual({ errorCode: ErrorCode.NONE, slots: [{ id: 1 }] });
    });

    it('routes errors through handleDbExceptions', async () => {
      slotRepo.__qb.getMany.mockRejectedValueOnce(new Error('e'));
      await expect(service.findAllSlot({} as any)).rejects.toThrow('e');
    });
  });

  describe('findSlotNearby', () => {
    it('returns NOT_FOUND when no nearby slots', async () => {
      slotRepo.__qb.getMany.mockResolvedValueOnce([]);
      const result = await service.findSlotNearby(-3.9, -79.2, {} as any);
      expect(result).toEqual({ errorCode: ErrorCode.NOT_FOUND, slots: [] });
    });

    it('applies search filter when provided', async () => {
      slotRepo.__qb.getMany.mockResolvedValueOnce([{ id: 1 }]);

      const result = await service.findSlotNearby(-3.9, -79.2, { search: 'q' } as any);

      expect(slotRepo.__qb.setParameters).toHaveBeenCalledWith({ lat: -3.9, lng: -79.2 });
      expect(slotRepo.__qb.andWhere).toHaveBeenCalledWith('sl.slot ILIKE :search', {
        search: '%q%',
      });
      expect(result).toEqual({ errorCode: ErrorCode.NONE, slots: [{ id: 1 }] });
    });

    it('routes errors through handleDbExceptions', async () => {
      slotRepo.__qb.getMany.mockRejectedValueOnce(new Error('e'));
      await expect(service.findSlotNearby(0, 0, {} as any)).rejects.toThrow('e');
    });
  });
});
