import { ErrorCode } from 'src/common/glob/error';
import { TypeOperation } from 'src/common/glob/type/type_operation';

jest.mock('src/common/exceptions/error.db.exception', () => ({
  __esModule: true,
  default: jest.fn((error: any) => {
    throw error;
  }),
}));
import handleDbExceptions from 'src/common/exceptions/error.db.exception';

import { BlockOperatorService } from '../block_operator.service';

const buildQb = () => ({
  select: jest.fn().mockReturnThis(),
  addSelect: jest.fn().mockReturnThis(),
  innerJoin: jest.fn().mockReturnThis(),
  where: jest.fn().mockReturnThis(),
  andWhere: jest.fn().mockReturnThis(),
  groupBy: jest.fn().mockReturnThis(),
  addGroupBy: jest.fn().mockReturnThis(),
  getMany: jest.fn(),
  getRawMany: jest.fn(),
  getRawAndEntities: jest.fn(),
});

const buildRepo = () => {
  const qb = buildQb();
  return {
    create: jest.fn((dto: any) => ({ ...dto })),
    save: jest.fn(async (e: any) => ({ id: 1, ...e })),
    preload: jest.fn(),
    find: jest.fn(),
    createQueryBuilder: jest.fn(() => qb),
    __qb: qb,
  };
};

describe('BlockOperatorService', () => {
  let service: BlockOperatorService;
  let repo: ReturnType<typeof buildRepo>;
  let loggerService: any;

  beforeEach(() => {
    repo = buildRepo();
    loggerService = { saveBlockOperatorLogger: jest.fn() };
    service = new BlockOperatorService(repo as any, loggerService);
    (service as any).logger = { error: jest.fn(), log: jest.fn(), warn: jest.fn() };
    (handleDbExceptions as unknown as jest.Mock).mockClear();
  });

  describe('create', () => {
    it('saves, logs and returns NONE', async () => {
      const dto: any = { blockId: 1 };
      const result = await service.create(1, dto);
      expect(repo.save).toHaveBeenCalled();
      expect(loggerService.saveBlockOperatorLogger).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 1, typeOperation: TypeOperation.CREATE }),
      );
      expect(result).toEqual({
        errorCode: ErrorCode.NONE,
        blockOperator: expect.objectContaining({ blockId: 1 }),
      });
    });

    it('routes errors', async () => {
      repo.save.mockRejectedValueOnce(new Error('e'));
      await expect(service.create(1, {} as any)).rejects.toThrow('e');
    });
  });

  describe('findAll', () => {
    it('queries by blockId and date and returns NONE', async () => {
      repo.__qb.getRawAndEntities.mockResolvedValueOnce({
        entities: [{ id: 1 }],
        raw: [{}],
      });
      const result = await service.findAll({ blockId: 1, date: '2026-01-01' } as any);
      expect(repo.__qb.where).toHaveBeenCalledWith('bo.blockId = :blockId', { blockId: 1 });
      expect(result).toEqual({
        errorCode: ErrorCode.NONE,
        blockOperators: [
          { id: 1, from: null, to: null, dateInitialized: null, dateFinalized: null },
        ],
      });
    });

    it('adds userId filter when provided', async () => {
      repo.__qb.getRawAndEntities.mockResolvedValueOnce({ entities: [], raw: [] });
      await service.findAll({ blockId: 1, date: '2026-01-01', userId: 9 } as any);
      expect(repo.__qb.andWhere).toHaveBeenCalledWith('bo.userId = :userId', { userId: 9 });
    });

    it('routes errors', async () => {
      repo.__qb.getRawAndEntities.mockRejectedValueOnce(new Error('e'));
      await expect(service.findAll({} as any)).rejects.toThrow('e');
    });
  });

  describe('findAllActiveByUserId', () => {
    it('queries with defaults', async () => {
      repo.__qb.getRawAndEntities.mockResolvedValueOnce({
        entities: [{ id: 1 }],
        raw: [{}],
      });
      const result = await service.findAllActiveByUserId({ userId: 1 } as any);
      expect(repo.__qb.where).toHaveBeenCalledWith('bo.userId = :userId', { userId: 1 });
      expect(repo.__qb.andWhere).toHaveBeenCalledWith(
        'bo.isInitialized = :isInitialized',
        { isInitialized: false },
      );
      expect(repo.__qb.andWhere).toHaveBeenCalledWith(
        'bo.isFinalized = :isFinalized',
        { isFinalized: false },
      );
      expect(result).toEqual({
        errorCode: ErrorCode.NONE,
        blockOperators: [{ id: 1, from: null, to: null }],
      });
    });

    it('uses provided isInitialized/isFinalized', async () => {
      repo.__qb.getRawAndEntities.mockResolvedValueOnce({ entities: [], raw: [] });
      await service.findAllActiveByUserId({
        userId: 1,
        isInitialized: true,
        isFinalized: true,
      } as any);
      expect(repo.__qb.andWhere).toHaveBeenCalledWith(
        'bo.isInitialized = :isInitialized',
        { isInitialized: true },
      );
    });

    it('routes errors', async () => {
      repo.__qb.getRawAndEntities.mockRejectedValueOnce(new Error('e'));
      await expect(service.findAllActiveByUserId({} as any)).rejects.toThrow('e');
    });
  });

  describe('findAllByBlockId', () => {
    it('queries with blockId only', async () => {
      repo.__qb.getRawAndEntities.mockResolvedValueOnce({
        entities: [{ id: 1 }],
        raw: [{}],
      });
      const result = await service.findAllByBlockId({ blockId: 1 } as any);
      expect(repo.__qb.where).toHaveBeenCalledWith('bo.blockId = :blockId', { blockId: 1 });
      expect(result.errorCode).toBe(ErrorCode.NONE);
    });

    it('appends dateFrom and dateTo filters', async () => {
      repo.__qb.getRawAndEntities.mockResolvedValueOnce({ entities: [], raw: [] });
      await service.findAllByBlockId({
        blockId: 1,
        dateFrom: '2026-01-01',
        dateTo: '2026-01-31',
      } as any);
      expect(repo.__qb.andWhere).toHaveBeenCalledWith(
        'DATE(bo.to) >= DATE(:dateFrom)',
        { dateFrom: '2026-01-01' },
      );
      expect(repo.__qb.andWhere).toHaveBeenCalledWith(
        'DATE(bo.from) <= DATE(:dateTo)',
        { dateTo: '2026-01-31' },
      );
    });

    it('routes errors', async () => {
      repo.__qb.getRawAndEntities.mockRejectedValueOnce(new Error('e'));
      await expect(service.findAllByBlockId({} as any)).rejects.toThrow('e');
    });
  });

  describe('update', () => {
    it('saves preloaded entity and logs', async () => {
      repo.preload.mockResolvedValueOnce({ id: 1 });
      const result = await service.update(1, 1, { isInitialized: true } as any);
      expect(repo.save).toHaveBeenCalled();
      expect(loggerService.saveBlockOperatorLogger).toHaveBeenCalledWith(
        expect.objectContaining({ typeOperation: TypeOperation.UPDATE }),
      );
      expect(result).toEqual({
        errorCode: ErrorCode.NONE,
        blockOperator: { id: 1 },
      });
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

  describe('findUniqueUsers', () => {
    it('returns rows from getRawMany', async () => {
      repo.__qb.getRawMany.mockResolvedValueOnce([
        { userId: 1, blockId: 2, blockName: 'B', zoneId: 1, zoneName: 'Z' },
      ]);
      const result = await service.findUniqueUsers({} as any);
      expect(result?.errorCode).toBe(ErrorCode.NONE);
      expect(result?.users).toHaveLength(1);
    });

    it('applies blockIds filter when present', async () => {
      repo.__qb.getRawMany.mockResolvedValueOnce([]);
      await service.findUniqueUsers({ blockIds: [1, 2] } as any);
      expect(repo.__qb.andWhere).toHaveBeenCalledWith('bo.blockId IN (:...blockIds)', {
        blockIds: [1, 2],
      });
    });

    it('applies userId filter when present', async () => {
      repo.__qb.getRawMany.mockResolvedValueOnce([]);
      await service.findUniqueUsers({ userId: 7 } as any);
      expect(repo.__qb.andWhere).toHaveBeenCalledWith('bo.userId = :userId', {
        userId: 7,
      });
    });

    it('routes errors', async () => {
      repo.__qb.getRawMany.mockRejectedValueOnce(new Error('e'));
      await expect(service.findUniqueUsers({} as any)).rejects.toThrow('e');
    });
  });

  describe('getBlockOperator', () => {
    it('maps records to name/label/id/value', async () => {
      repo.find.mockResolvedValueOnce([
        { id: 1, from: '2024-01-01', to: '2024-01-02' },
      ]);
      const result = await service.getBlockOperator();
      expect(result).toEqual({
        errorCode: ErrorCode.NONE,
        blockOperators: [
          { name: '2024-01-01 - 2024-01-02', label: '2024-01-01 - 2024-01-02', id: 1, value: 1 },
        ],
      });
    });

    it('routes errors', async () => {
      repo.find.mockRejectedValueOnce(new Error('e'));
      await expect(service.getBlockOperator()).rejects.toThrow('e');
    });
  });
});
