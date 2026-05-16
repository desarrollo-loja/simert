import { ErrorCode } from 'src/common/glob/error';
import { TypeOperation } from 'src/common/glob/type/type_operation';

jest.mock('src/common/exceptions/error.db.exception', () => ({
  __esModule: true,
  default: jest.fn((error: any) => {
    throw error;
  }),
}));
import handleDbExceptions from 'src/common/exceptions/error.db.exception';

import { ScheduleService } from '../schedule.service';

const buildRepoMock = () => ({
  create: jest.fn((dto: any) => ({ ...dto })),
  save: jest.fn(async (e: any) => e),
  preload: jest.fn(),
});

const buildLoggerMock = () => ({
  saveScheduleBlockLogger: jest.fn(),
});

describe('ScheduleService', () => {
  let service: ScheduleService;
  let repo: ReturnType<typeof buildRepoMock>;
  let loggerService: ReturnType<typeof buildLoggerMock>;

  beforeEach(() => {
    repo = buildRepoMock();
    loggerService = buildLoggerMock();
    service = new ScheduleService(repo as any, loggerService as any);
    (service as any).logger = { error: jest.fn() };
    (handleDbExceptions as unknown as jest.Mock).mockClear();
  });

  describe('create', () => {
    it('creates one schedule per dataSchedules entry and logs each', async () => {
      const dto: any = { dataSchedules: [{ a: 1 }, { a: 2 }] };

      const result = await service.create(1, dto);

      expect(repo.create).toHaveBeenCalledTimes(2);
      expect(loggerService.saveScheduleBlockLogger).toHaveBeenCalledTimes(2);
      expect(loggerService.saveScheduleBlockLogger).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 1, typeOperation: TypeOperation.CREATE }),
      );
      expect(result).toEqual({ errorCode: ErrorCode.NONE });
    });

    it('routes errors through handleDbExceptions', async () => {
      const dto: any = { dataSchedules: null };

      await expect(service.create(1, dto)).rejects.toThrow();
      expect(handleDbExceptions).toHaveBeenCalled();
    });
  });

  describe('findAllScheduleByBlock', () => {
    it('returns NONE when at least one row is found', async () => {
      const qb: any = {
        select: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([{ id: 1 }]),
      };
      (repo as any).createQueryBuilder = jest.fn(() => qb);

      const result = await service.findAllScheduleByBlock(1);

      expect(result).toEqual({ errorCode: ErrorCode.NONE, blockSchedule: [{ id: 1 }] });
    });

    it('returns NOT_FOUND when result set is empty', async () => {
      const qb: any = {
        select: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([]),
      };
      (repo as any).createQueryBuilder = jest.fn(() => qb);

      const result = await service.findAllScheduleByBlock(1);

      expect(result?.errorCode).toBe(ErrorCode.NOT_FOUND);
    });

    it('routes errors through handleDbExceptions', async () => {
      (repo as any).createQueryBuilder = jest.fn(() => {
        throw new Error('e');
      });

      await expect(service.findAllScheduleByBlock(1)).rejects.toThrow('e');
    });
  });

  describe('updateActive', () => {
    it('saves and logs when preload returns entity', async () => {
      repo.preload.mockResolvedValueOnce({ id: 1, isActivated: true });

      const result = await service.updateActive(1, 1, {} as any);

      expect(repo.save).toHaveBeenCalled();
      expect(loggerService.saveScheduleBlockLogger).toHaveBeenCalled();
      expect(result?.errorCode).toBe(ErrorCode.NONE);
    });

    it('returns NOT_FOUND when preload yields nothing', async () => {
      repo.preload.mockResolvedValueOnce(undefined);
      const result = await service.updateActive(1, 1, {} as any);
      expect(result?.errorCode).toBe(ErrorCode.NOT_FOUND);
    });

    it('routes errors through handleDbExceptions', async () => {
      repo.preload.mockRejectedValueOnce(new Error('e'));
      await expect(service.updateActive(1, 1, {} as any)).rejects.toThrow('e');
    });
  });

  describe('update', () => {
    it('preloads and saves each schedule entry found', async () => {
      repo.preload
        .mockResolvedValueOnce({ id: 1 })
        .mockResolvedValueOnce(undefined);

      const dto: any = { dataSchedules: [{ id: 1 }, { id: 2 }] };
      const result = await service.update(1, dto);

      // Wait for inner async work.
      await new Promise(setImmediate);

      expect(repo.preload).toHaveBeenCalledTimes(2);
      expect(repo.save).toHaveBeenCalledTimes(1);
      expect(result).toEqual({ errorCode: ErrorCode.NONE });
    });

    it('routes errors through handleDbExceptions', async () => {
      const dto: any = { dataSchedules: null };
      await expect(service.update(1, dto)).rejects.toThrow();
    });
  });
});
