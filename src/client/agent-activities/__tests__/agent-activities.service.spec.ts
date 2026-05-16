import { ErrorCode } from 'src/common/glob/error';
import { TypeActivity } from 'src/common/glob/type/type_activity';
import { TypeOperation } from 'src/common/glob/type/type_operation';

jest.mock('src/common/exceptions/error.db.exception', () => ({
  __esModule: true,
  default: jest.fn((error: any) => {
    throw error;
  }),
}));
import handleDbExceptions from 'src/common/exceptions/error.db.exception';

import { AgentActivitiesService } from '../agent-activities.service';

const buildQb = () => ({
  select: jest.fn().mockReturnThis(),
  where: jest.fn().mockReturnThis(),
  getOne: jest.fn(),
});

const buildAgentRepo = () => ({
  create: jest.fn((dto: any) => ({ ...dto })),
  save: jest.fn(async (e: any) => ({ id: 10, ...e })),
  preload: jest.fn(),
});

const buildBlockOperatorRepo = () => {
  const qb = buildQb();
  return {
    createQueryBuilder: jest.fn(() => qb),
    preload: jest.fn(),
    save: jest.fn(async (e: any) => e),
    __qb: qb,
  };
};

const buildLoggerService = () => ({
  saveAgentActivitiesLogger: jest.fn(),
  saveBlockOperatorLogger: jest.fn(),
});

describe('AgentActivitiesService', () => {
  let service: AgentActivitiesService;
  let agentRepo: ReturnType<typeof buildAgentRepo>;
  let blockOperatorRepo: ReturnType<typeof buildBlockOperatorRepo>;
  let loggerService: ReturnType<typeof buildLoggerService>;

  beforeEach(() => {
    agentRepo = buildAgentRepo();
    blockOperatorRepo = buildBlockOperatorRepo();
    loggerService = buildLoggerService();
    service = new AgentActivitiesService(
      agentRepo as any,
      blockOperatorRepo as any,
      loggerService as any,
    );
    (service as any).logger = { error: jest.fn() };
    (handleDbExceptions as unknown as jest.Mock).mockClear();
  });

  describe('findOneByBlockOperatorId', () => {
    it('returns the operator wrapped with NONE', async () => {
      blockOperatorRepo.__qb.getOne.mockResolvedValueOnce({ id: 1 });

      const result = await service.findOneByBlockOperatorId({ blockOperatorId: 1 } as any);

      expect(result).toEqual({ errorCode: ErrorCode.NONE, blockOperator: { id: 1 } });
    });

    it('routes errors through handleDbExceptions', async () => {
      blockOperatorRepo.__qb.getOne.mockRejectedValueOnce(new Error('e'));
      await expect(
        service.findOneByBlockOperatorId({ blockOperatorId: 1 } as any),
      ).rejects.toThrow('e');
    });
  });

  describe('create', () => {
    it('returns NOT_FOUND when blockOperator is missing', async () => {
      blockOperatorRepo.__qb.getOne.mockResolvedValueOnce(null);

      const result = await service.create(1, { blockOperatorId: 5 } as any);

      expect(result).toEqual({ errorCode: ErrorCode.NOT_FOUND });
      expect(agentRepo.save).not.toHaveBeenCalled();
    });

    it('rejects START_SHIFT when operator is already finalized', async () => {
      blockOperatorRepo.__qb.getOne.mockResolvedValueOnce({
        id: 5,
        isFinalized: true,
        isInitialized: true,
      });

      const result = await service.create(1, {
        blockOperatorId: 5,
        type: TypeActivity.START_SHIFT,
      } as any);

      expect(result).toEqual({ errorCode: ErrorCode.BLOCK_OPERATOR_ALREADY_FINALIZED });
      expect(agentRepo.save).not.toHaveBeenCalled();
    });

    it('rejects END_SHIFT when operator is already initialized and finalized', async () => {
      blockOperatorRepo.__qb.getOne.mockResolvedValueOnce({
        id: 5,
        isFinalized: true,
        isInitialized: true,
      });

      const result = await service.create(1, {
        blockOperatorId: 5,
        type: TypeActivity.END_SHIFT,
      } as any);

      expect(result).toEqual({
        errorCode: ErrorCode.BLOCK_OPERATOR_ALREADY_INITIALIZED_AND_FINALIZED,
      });
    });

    it('creates activity, marks block operator as initialized on START_SHIFT', async () => {
      blockOperatorRepo.__qb.getOne.mockResolvedValueOnce({
        id: 5,
        isFinalized: false,
        isInitialized: false,
      });
      blockOperatorRepo.preload.mockImplementationOnce(async (e: any) => e);

      const result = await service.create(1, {
        blockOperatorId: 5,
        type: TypeActivity.START_SHIFT,
      } as any);

      expect(agentRepo.save).toHaveBeenCalled();
      expect(loggerService.saveAgentActivitiesLogger).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 1, typeOperation: TypeOperation.CREATE }),
      );
      expect(blockOperatorRepo.preload).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 5,
          isInitialized: true,
          isFinalized: false,
          dateInitialized: expect.any(Date),
        }),
      );
      expect(blockOperatorRepo.save).toHaveBeenCalled();
      expect(loggerService.saveBlockOperatorLogger).toHaveBeenCalled();
      expect(result?.errorCode).toBe(ErrorCode.NONE);
    });

    it('marks block operator as finalized on END_SHIFT when initialized', async () => {
      blockOperatorRepo.__qb.getOne.mockResolvedValueOnce({
        id: 5,
        isFinalized: false,
        isInitialized: true,
      });
      blockOperatorRepo.preload.mockImplementationOnce(async (e: any) => e);

      const result = await service.create(1, {
        blockOperatorId: 5,
        type: TypeActivity.END_SHIFT,
      } as any);

      expect(blockOperatorRepo.preload).toHaveBeenCalledWith(
        expect.objectContaining({
          isFinalized: true,
          dateFinalized: expect.any(Date),
        }),
      );
      expect(result?.errorCode).toBe(ErrorCode.NONE);
    });

    it('skips block operator update when preload returns nothing', async () => {
      blockOperatorRepo.__qb.getOne.mockResolvedValueOnce({
        id: 5,
        isFinalized: false,
        isInitialized: false,
      });
      blockOperatorRepo.preload.mockResolvedValueOnce(undefined);

      const result = await service.create(1, {
        blockOperatorId: 5,
        type: TypeActivity.START_SHIFT,
      } as any);

      expect(blockOperatorRepo.save).not.toHaveBeenCalled();
      expect(result?.errorCode).toBe(ErrorCode.NONE);
    });

    it('returns NOT_FOUND when findOneByBlockOperatorId returns non-NONE', async () => {
      // Force findOneByBlockOperatorId to throw -> handled, but we want to also
      // exercise the explicit non-NONE branch. Spy on the method directly.
      const spy = jest
        .spyOn(service, 'findOneByBlockOperatorId')
        .mockResolvedValueOnce({ errorCode: ErrorCode.NOT_FOUND } as any);

      const result = await service.create(1, { blockOperatorId: 5 } as any);

      expect(result).toEqual({ errorCode: ErrorCode.NOT_FOUND });
      spy.mockRestore();
    });

    it('routes save errors through handleDbExceptions', async () => {
      blockOperatorRepo.__qb.getOne.mockResolvedValueOnce({
        id: 5,
        isFinalized: false,
        isInitialized: false,
      });
      agentRepo.save.mockRejectedValueOnce(new Error('boom'));

      await expect(
        service.create(1, { blockOperatorId: 5, type: TypeActivity.START_SHIFT } as any),
      ).rejects.toThrow('boom');
    });
  });

  describe('update', () => {
    it('saves preloaded activity and returns NONE', async () => {
      agentRepo.preload.mockResolvedValueOnce({ id: 7 });

      const result = await service.update(1, 7, {} as any);

      expect(agentRepo.save).toHaveBeenCalled();
      expect(loggerService.saveAgentActivitiesLogger).toHaveBeenCalledWith(
        expect.objectContaining({ id: 7, userId: 1, typeOperation: TypeOperation.UPDATE }),
      );
      expect(result?.errorCode).toBe(ErrorCode.NONE);
    });

    it('returns undefined when preload yields nothing', async () => {
      agentRepo.preload.mockResolvedValueOnce(undefined);
      const result = await service.update(1, 7, {} as any);
      expect(result).toBeUndefined();
    });

    it('routes errors through handleDbExceptions', async () => {
      agentRepo.preload.mockRejectedValueOnce(new Error('e'));
      await expect(service.update(1, 7, {} as any)).rejects.toThrow('e');
    });
  });
});
