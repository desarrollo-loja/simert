/* eslint-disable @typescript-eslint/no-var-requires */
import { ErrorCode } from 'src/common/glob/error';

// Spy on default-exported `handleDbExceptions` so we can assert behavior on
// thrown errors without exercising the real Nest exception classes.
jest.mock('src/common/exceptions/error.db.exception', () => ({
  __esModule: true,
  default: jest.fn((error: any) => {
    throw error;
  }),
}));
import handleDbExceptions from 'src/common/exceptions/error.db.exception';

import { RangeSalePointTransactionService } from '../range-sale-point-transaction.service';

// Chainable QueryBuilder mock; every chainable method returns `this`.
const buildQbMock = () => {
  const qb: any = {
    select: jest.fn().mockReturnThis(),
    from: jest.fn().mockReturnThis(),
    innerJoin: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    setLock: jest.fn().mockReturnThis(),
    getOne: jest.fn(),
  };
  return qb;
};

const buildRepoMock = () => {
  const qb = buildQbMock();
  return {
    create: jest.fn((dto: any) => dto),
    save: jest.fn(async (e: any) => e),
    findOne: jest.fn(),
    query: jest.fn(),
    createQueryBuilder: jest.fn(() => qb),
    __qb: qb,
  };
};

const buildLoggerServiceMock = () => ({
  saveRangeSalePointTransactionLogger: jest.fn(),
});

const buildDataSourceMock = () => {
  const managerQb: any = {
    select: jest.fn().mockReturnThis(),
    from: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    setLock: jest.fn().mockReturnThis(),
    getOne: jest.fn(),
  };
  const queryRunner: any = {
    connect: jest.fn().mockResolvedValue(undefined),
    startTransaction: jest.fn().mockResolvedValue(undefined),
    commitTransaction: jest.fn().mockResolvedValue(undefined),
    rollbackTransaction: jest.fn().mockResolvedValue(undefined),
    release: jest.fn().mockResolvedValue(undefined),
    manager: {
      createQueryBuilder: jest.fn(() => managerQb),
      save: jest.fn(async (e: any) => e),
    },
    __managerQb: managerQb,
  };
  return {
    createQueryRunner: jest.fn(() => queryRunner),
    __queryRunner: queryRunner,
  };
};

describe('RangeSalePointTransactionService', () => {
  let service: RangeSalePointTransactionService;
  let rsptRepo: ReturnType<typeof buildRepoMock>;
  let rspRepo: ReturnType<typeof buildRepoMock>;
  let checkboxRepo: ReturnType<typeof buildRepoMock>;
  let loggerService: ReturnType<typeof buildLoggerServiceMock>;
  let dataSource: ReturnType<typeof buildDataSourceMock>;

  beforeEach(() => {
    rsptRepo = buildRepoMock();
    rspRepo = buildRepoMock();
    checkboxRepo = buildRepoMock();
    loggerService = buildLoggerServiceMock();
    dataSource = buildDataSourceMock();

    service = new RangeSalePointTransactionService(
      rsptRepo as any,
      rspRepo as any,
      checkboxRepo as any,
      loggerService as any,
      dataSource as any,
    );
    (service as any).logger = { error: jest.fn(), log: jest.fn(), warn: jest.fn() };

    (handleDbExceptions as unknown as jest.Mock).mockClear();
  });

  describe('findAll', () => {
    it('queries the main table with no filters and returns rows', async () => {
      rsptRepo.query.mockResolvedValueOnce([{ id: 1 }]);

      const result = await service.findAll({} as any);

      expect(result).toEqual({ errorCode: ErrorCode.NONE, transactions: [{ id: 1 }] });
      const [sql, params] = rsptRepo.query.mock.calls[0];
      expect(sql).toContain('FROM public."rangeSalePointTransaction" rspt');
      expect(sql).not.toContain(' WHERE ');
      expect(params).toEqual([]);
    });

    it('builds conditions for every supported filter', async () => {
      rsptRepo.query.mockResolvedValueOnce([]);

      await service.findAll({
        userId: 1,
        userIdBuy: 2,
        userIdSell: 3,
        rangeSalePointId: 4,
        salePointId: 5,
        dateFrom: '2026-01-01',
        dateTo: '2026-01-31',
      } as any);

      const [sql, params] = rsptRepo.query.mock.calls[0];
      expect(sql).toContain('rspt."userIdBuy" = $1');
      expect(sql).toContain('rspt."userIdBuy" = $2');
      expect(sql).toContain('rspt."userIdSell" = $3');
      expect(sql).toContain('rspt."rangeSalePointId" = $4');
      expect(sql).toContain('rsp."salePointId" = $5');
      expect(sql).toContain('rspt."createdAt" BETWEEN $6 AND $7');
      expect(params).toEqual([1, 2, 3, 4, 5, '2026-01-01', '2026-01-31']);
    });

    it('parameterizes LIMIT and OFFSET (defense-in-depth)', async () => {
      rsptRepo.query.mockResolvedValueOnce([]);

      await service.findAll({ limit: 5, offset: 10 } as any);

      const [sql, params] = rsptRepo.query.mock.calls[0];
      expect(sql).toMatch(/LIMIT \$\d+/);
      expect(sql).toMatch(/OFFSET \$\d+/);
      expect(params[params.length - 2]).toBe(5);
      expect(params[params.length - 1]).toBe(10);
    });

    it('coerces non-numeric / negative limit & offset to 0', async () => {
      rsptRepo.query.mockResolvedValueOnce([]);

      await service.findAll({ limit: 'abc' as any, offset: -5 as any } as any);

      const [, params] = rsptRepo.query.mock.calls[0];
      expect(params[params.length - 2]).toBe(0);
      expect(params[params.length - 1]).toBe(0);
    });

    it('routes errors through handleDbExceptions', async () => {
      rsptRepo.query.mockRejectedValueOnce(new Error('db'));
      await expect(service.findAll({} as any)).rejects.toThrow('db');
      expect(handleDbExceptions).toHaveBeenCalled();
    });
  });

  describe('countAll', () => {
    it('returns total as a number', async () => {
      rsptRepo.query.mockResolvedValueOnce([{ total: '7' }]);

      const result = await service.countAll({} as any);

      expect(result).toEqual({ total: 7, errorCode: ErrorCode.NONE });
    });

    it('returns 0 when nothing returned', async () => {
      rsptRepo.query.mockResolvedValueOnce([]);
      const result = await service.countAll({} as any);
      expect(result).toEqual({ total: 0, errorCode: ErrorCode.NONE });
    });

    it('appends WHERE when filters present', async () => {
      rsptRepo.query.mockResolvedValueOnce([{ total: '1' }]);
      await service.countAll({ userIdBuy: 9 } as any);
      const [sql] = rsptRepo.query.mock.calls[0];
      expect(sql).toContain(' WHERE ');
    });

    it('routes errors through handleDbExceptions', async () => {
      rsptRepo.query.mockRejectedValueOnce(new Error('e'));
      await expect(service.countAll({} as any)).rejects.toThrow('e');
    });
  });

  describe('create (wallet-critical)', () => {
    const baseDto = {
      rangeSalePointId: 1,
      amount: 2,
      userIdBuy: 100,
      userIdSell: 200,
    };

    it('returns NOT_FOUND when the range sale point does not exist', async () => {
      rspRepo.__qb.getOne.mockResolvedValueOnce(null);

      const result = await service.create(1, baseDto as any);

      expect(result).toEqual({
        errorCode: ErrorCode.NOT_FOUND,
        message: 'No se encontro el rango de venta',
      });
      // No transaction must be started or committed.
      expect(dataSource.__queryRunner.startTransaction).not.toHaveBeenCalled();
      expect(dataSource.__queryRunner.commitTransaction).not.toHaveBeenCalled();
    });

    it('returns NOT_FOUND when there are not enough units to sell', async () => {
      rspRepo.__qb.getOne.mockResolvedValueOnce({ id: 1, sold: 1 });

      const result = await service.create(1, baseDto as any);

      expect(result?.errorCode).toBe(ErrorCode.NOT_FOUND);
      expect(dataSource.__queryRunner.startTransaction).not.toHaveBeenCalled();
    });

    it('completes happy path: locks row, persists transaction, decrements sold and INCREMENTS wallet (+=) for existing user', async () => {
      rspRepo.__qb.getOne.mockResolvedValueOnce({ id: 1, sold: 10 });
      dataSource.__queryRunner.__managerQb.getOne.mockResolvedValueOnce({ id: 1, sold: 10 });
      checkboxRepo.findOne.mockResolvedValueOnce({ userId: 100, checkboxes: 50 });

      const result: any = await service.create(1, baseDto as any);

      // pessimistic_write lock must be acquired before any mutation.
      expect(dataSource.__queryRunner.__managerQb.setLock).toHaveBeenCalledWith('pessimistic_write');
      // The transaction record was created with the correct payload.
      expect(rsptRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          userIdBuy: 100,
          userIdSell: 200,
          amount: 2,
        }),
      );
      // sold was decremented on the locked row.
      expect(dataSource.__queryRunner.__managerQb.getOne.mock.results).toHaveLength(1);
      const savedLock = dataSource.__queryRunner.manager.save.mock.calls.find(
        (c: any[]) => c[0] && typeof c[0].sold === 'number',
      );
      expect(savedLock[0].sold).toBe(10 - 2);
      // CheckboxUser balance was INCREMENTED with += (2 amount * 12 = 24 added to existing 50).
      const savedCheckbox = dataSource.__queryRunner.manager.save.mock.calls.find(
        (c: any[]) => c[0] && c[0].checkboxes !== undefined && c[0].userId === 100,
      );
      expect(savedCheckbox[0].checkboxes).toBe(50 + 24);
      // Transaction committed and released.
      expect(dataSource.__queryRunner.commitTransaction).toHaveBeenCalled();
      expect(dataSource.__queryRunner.release).toHaveBeenCalled();
      expect(dataSource.__queryRunner.rollbackTransaction).not.toHaveBeenCalled();
      expect(result.errorCode).toBe(ErrorCode.NONE);
    });

    it('creates a CheckboxUser when one does not exist and credits the full amount', async () => {
      rspRepo.__qb.getOne.mockResolvedValueOnce({ id: 1, sold: 10 });
      dataSource.__queryRunner.__managerQb.getOne.mockResolvedValueOnce({ id: 1, sold: 10 });
      checkboxRepo.findOne.mockResolvedValueOnce(null);
      // Repository .create returns whatever it is given.
      checkboxRepo.create.mockImplementationOnce((e: any) => e);

      const result: any = await service.create(1, baseDto as any);

      expect(checkboxRepo.create).toHaveBeenCalledWith({ userId: 100, checkboxes: 24 });
      expect(dataSource.__queryRunner.manager.save).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 100, checkboxes: 24 }),
      );
      expect(result.errorCode).toBe(ErrorCode.NONE);
    });

    it('throws REJECTED and rolls back when the locked row is missing', async () => {
      rspRepo.__qb.getOne.mockResolvedValueOnce({ id: 1, sold: 10 });
      dataSource.__queryRunner.__managerQb.getOne.mockResolvedValueOnce(null);

      await expect(service.create(1, baseDto as any)).rejects.toThrow('REJECTED');

      expect(dataSource.__queryRunner.rollbackTransaction).toHaveBeenCalled();
      expect(dataSource.__queryRunner.commitTransaction).not.toHaveBeenCalled();
      expect(dataSource.__queryRunner.release).toHaveBeenCalled();
    });

    it('returns NOT_VALID fallback when handleDbExceptions swallows the error', async () => {
      rspRepo.__qb.getOne.mockResolvedValueOnce({ id: 1, sold: 10 });
      dataSource.__queryRunner.__managerQb.getOne.mockResolvedValueOnce({ id: 1, sold: 10 });
      dataSource.__queryRunner.manager.save.mockRejectedValueOnce(new Error('save fail'));
      // Make handleDbExceptions NOT throw on this single invocation so we reach
      // the post-try/catch fallback return statement.
      (handleDbExceptions as unknown as jest.Mock).mockImplementationOnce(() => undefined);

      const result = await service.create(1, baseDto as any);

      expect(result).toEqual({
        errorCode: ErrorCode.NOT_VALID,
        message: 'Ocurrio un error al crear la transaccion',
      });
      expect(dataSource.__queryRunner.rollbackTransaction).toHaveBeenCalled();
      expect(dataSource.__queryRunner.release).toHaveBeenCalled();
    });

    it('rolls back when manager.save fails inside the transaction', async () => {
      rspRepo.__qb.getOne.mockResolvedValueOnce({ id: 1, sold: 10 });
      dataSource.__queryRunner.__managerQb.getOne.mockResolvedValueOnce({ id: 1, sold: 10 });
      dataSource.__queryRunner.manager.save.mockRejectedValueOnce(new Error('save fail'));

      await expect(service.create(1, baseDto as any)).rejects.toThrow('save fail');

      expect(dataSource.__queryRunner.rollbackTransaction).toHaveBeenCalled();
      expect(dataSource.__queryRunner.release).toHaveBeenCalled();
      expect(handleDbExceptions).toHaveBeenCalled();
    });
  });
});
