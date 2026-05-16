import { ErrorCode } from 'src/common/glob/error';

jest.mock('src/common/exceptions/error.db.exception', () => ({
  __esModule: true,
  default: jest.fn((error: any) => {
    throw error;
  }),
}));
import handleDbExceptions from 'src/common/exceptions/error.db.exception';

import { AdminService } from '../admin.service';

const buildQb = () => ({
  select: jest.fn().mockReturnThis(),
  innerJoin: jest.fn().mockReturnThis(),
  limit: jest.fn().mockReturnThis(),
  orderBy: jest.fn().mockReturnThis(),
  setParameters: jest.fn().mockReturnThis(),
  getMany: jest.fn(),
});

const buildRepo = () => {
  const qb = buildQb();
  return {
    delete: jest.fn(),
    create: jest.fn((dto: any) => ({ ...dto })),
    save: jest.fn(async (e: any) => ({ id: 1, ...e })),
    createQueryBuilder: jest.fn(() => qb),
    __qb: qb,
  };
};

describe('AdminService (client)', () => {
  let service: AdminService;
  let repo: ReturnType<typeof buildRepo>;

  beforeEach(() => {
    repo = buildRepo();
    service = new AdminService(repo as any);
    (service as any).logger = { error: jest.fn() };
    (handleDbExceptions as unknown as jest.Mock).mockClear();
  });

  describe('delete', () => {
    it('removes the slot and returns NONE', async () => {
      repo.delete.mockResolvedValueOnce(undefined);

      const result = await service.delete(7);

      expect(repo.delete).toHaveBeenCalledWith(7);
      expect(result).toEqual({ errorCode: ErrorCode.NONE });
    });

    it('routes errors through handleDbExceptions', async () => {
      repo.delete.mockRejectedValueOnce(new Error('boom'));

      await expect(service.delete(7)).rejects.toThrow('boom');
      expect(handleDbExceptions).toHaveBeenCalled();
    });
  });

  describe('create', () => {
    it('persists the slot and returns NONE with the saved row', async () => {
      const dto: any = { slot: 'A1' };

      const result = await service.create(dto);

      expect(repo.create).toHaveBeenCalledWith({ ...dto });
      expect(repo.save).toHaveBeenCalled();
      expect(result).toEqual({ errorCode: ErrorCode.NONE, slot: { id: 1, slot: 'A1' } });
    });

    it('routes errors through handleDbExceptions', async () => {
      repo.save.mockRejectedValueOnce(new Error('boom'));

      await expect(service.create({} as any)).rejects.toThrow('boom');
      expect(handleDbExceptions).toHaveBeenCalled();
    });
  });

  describe('findAllSlots', () => {
    it('returns slots from the query builder with NONE error code', async () => {
      repo.__qb.getMany.mockResolvedValueOnce([{ id: 1 }]);

      const result = await service.findAllSlots(-3.99, -79.2);

      expect(repo.__qb.setParameters).toHaveBeenCalledWith({ lat: -3.99, lng: -79.2 });
      expect(result).toEqual({ errorCode: ErrorCode.NONE, slots: [{ id: 1 }] });
    });

    it('routes errors through handleDbExceptions', async () => {
      repo.__qb.getMany.mockRejectedValueOnce(new Error('e'));

      await expect(service.findAllSlots(0, 0)).rejects.toThrow('e');
      expect(handleDbExceptions).toHaveBeenCalled();
    });
  });
});
