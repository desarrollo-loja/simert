import { ErrorCode } from 'src/common/glob/error';

jest.mock('src/common/exceptions/error.db.exception', () => ({
  __esModule: true,
  default: jest.fn((error: any) => {
    throw error;
  }),
}));
import handleDbExceptions from 'src/common/exceptions/error.db.exception';

import { RangeSalePointTransactionService } from '../range-sale-point-transaction.service';

const buildRspQb = () => ({
  select: jest.fn().mockReturnThis(),
  innerJoin: jest.fn().mockReturnThis(),
  where: jest.fn().mockReturnThis(),
  getOne: jest.fn(),
});

const buildLockQb = () => ({
  select: jest.fn().mockReturnThis(),
  from: jest.fn().mockReturnThis(),
  where: jest.fn().mockReturnThis(),
  setLock: jest.fn().mockReturnThis(),
  getOne: jest.fn(),
});

describe('RangeSalePointTransactionService (wallet-critical)', () => {
  let service: RangeSalePointTransactionService;
  let rspRepo: any;
  let checkboxRepo: any;
  let transactionRepo: any;
  let dataSource: any;
  let queryRunner: any;
  let lockQb: ReturnType<typeof buildLockQb>;

  beforeEach(() => {
    const rspQb = buildRspQb();
    rspRepo = {
      createQueryBuilder: jest.fn(() => rspQb),
      __qb: rspQb,
    };

    transactionRepo = {
      create: jest.fn((dto: any) => ({ ...dto })),
    };

    checkboxRepo = {
      findOne: jest.fn(),
      create: jest.fn((dto: any) => ({ ...dto })),
    };

    lockQb = buildLockQb();
    queryRunner = {
      connect: jest.fn(),
      startTransaction: jest.fn(),
      commitTransaction: jest.fn(),
      rollbackTransaction: jest.fn(),
      release: jest.fn(),
      manager: {
        createQueryBuilder: jest.fn(() => lockQb),
        save: jest.fn(async (e: any) => e),
      },
    };
    dataSource = { createQueryRunner: jest.fn(() => queryRunner) };

    service = new RangeSalePointTransactionService(
      transactionRepo,
      rspRepo,
      checkboxRepo,
      {} as any,
      dataSource,
    );
    (service as any).logger = { error: jest.fn() };
    (handleDbExceptions as unknown as jest.Mock).mockClear();
  });

  it('returns NOT_FOUND when rangeSalePoint does not exist', async () => {
    rspRepo.__qb.getOne.mockResolvedValueOnce(null);

    const result = await service.create(1, {
      rangeSalePointId: 9,
      amount: 1,
      userIdBuy: 2,
      userIdSell: 3,
    } as any);

    expect(result?.errorCode).toBe(ErrorCode.NOT_FOUND);
    expect(dataSource.createQueryRunner).toHaveBeenCalled();
    expect(queryRunner.startTransaction).not.toHaveBeenCalled();
  });

  it('returns NOT_FOUND when not enough stock to sell', async () => {
    rspRepo.__qb.getOne.mockResolvedValueOnce({ id: 9, sold: 0 });

    const result = await service.create(1, {
      rangeSalePointId: 9,
      amount: 5,
      userIdBuy: 2,
      userIdSell: 3,
    } as any);

    expect(result?.errorCode).toBe(ErrorCode.NOT_FOUND);
    expect(queryRunner.startTransaction).not.toHaveBeenCalled();
  });

  it('increments checkboxes on existing CheckboxUser (WALLET INCREMENT)', async () => {
    rspRepo.__qb.getOne.mockResolvedValueOnce({ id: 9, sold: 10 });
    lockQb.getOne.mockResolvedValueOnce({ id: 9, sold: 10 });
    const existingCheckbox = { userId: 2, checkboxes: 100 };
    checkboxRepo.findOne.mockResolvedValueOnce(existingCheckbox);

    const result: any = await service.create(1, {
      rangeSalePointId: 9,
      amount: 3,
      userIdBuy: 2,
      userIdSell: 3,
    } as any);

    // 3 cards * 12 spaces = 36 added to checkboxes (100 + 36 = 136).
    expect(existingCheckbox.checkboxes).toBe(136);
    // stock decremented (10 - 3 = 7).
    expect(result.rangeSalePoint.sold).toBe(7);
    expect(lockQb.setLock).toHaveBeenCalledWith('pessimistic_write');
    expect(queryRunner.commitTransaction).toHaveBeenCalled();
    expect(queryRunner.release).toHaveBeenCalled();
    expect(result.errorCode).toBe(ErrorCode.NONE);
  });

  it('creates a new CheckboxUser when one does not exist for the buyer', async () => {
    rspRepo.__qb.getOne.mockResolvedValueOnce({ id: 9, sold: 10 });
    lockQb.getOne.mockResolvedValueOnce({ id: 9, sold: 10 });
    checkboxRepo.findOne.mockResolvedValueOnce(null);

    const result: any = await service.create(1, {
      rangeSalePointId: 9,
      amount: 2,
      userIdBuy: 2,
      userIdSell: 3,
    } as any);

    expect(checkboxRepo.create).toHaveBeenCalledWith({ userId: 2, checkboxes: 24 });
    expect(queryRunner.commitTransaction).toHaveBeenCalled();
    expect(result.errorCode).toBe(ErrorCode.NONE);
  });

  it('rolls back and routes the error when pessimistic_write lock returns nothing', async () => {
    rspRepo.__qb.getOne.mockResolvedValueOnce({ id: 9, sold: 10 });
    lockQb.getOne.mockResolvedValueOnce(null);

    await expect(
      service.create(1, {
        rangeSalePointId: 9,
        amount: 1,
        userIdBuy: 2,
        userIdSell: 3,
      } as any),
    ).rejects.toThrow('REJECTED');
    expect(queryRunner.rollbackTransaction).toHaveBeenCalled();
    expect(queryRunner.release).toHaveBeenCalled();
    expect(handleDbExceptions).toHaveBeenCalled();
  });

  it('returns NOT_VALID when handleDbExceptions silently swallows the error', async () => {
    rspRepo.__qb.getOne.mockResolvedValueOnce({ id: 9, sold: 10 });
    lockQb.getOne.mockResolvedValueOnce(null);
    // Make handleDbExceptions a no-op so the fallthrough return is reached.
    (handleDbExceptions as unknown as jest.Mock).mockImplementationOnce(() => undefined);

    const result = await service.create(1, {
      rangeSalePointId: 9,
      amount: 1,
      userIdBuy: 2,
      userIdSell: 3,
    } as any);

    expect(result).toEqual(
      expect.objectContaining({ errorCode: ErrorCode.NOT_VALID }),
    );
    expect(queryRunner.rollbackTransaction).toHaveBeenCalled();
    expect(queryRunner.release).toHaveBeenCalled();
  });

  describe('_buildConditionsAndParameters', () => {
    it('returns empty arrays when no userId is supplied', () => {
      const result = (service as any)._buildConditionsAndParameters({});
      expect(result).toEqual({ conditions: [], parameters: {} });
    });

    it('pushes a userId condition when supplied', () => {
      const result = (service as any)._buildConditionsAndParameters({ userId: 7 });
      expect(result.conditions).toEqual(['rsp.userId = :userId']);
      expect(result.parameters).toEqual({ userId: 7 });
    });
  });
});
