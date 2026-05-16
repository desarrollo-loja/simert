import { BlockOperatorController } from '../block_operator.controller';
import { BlockOperatorService } from '../block_operator.service';

const buildServiceMock = () => ({
  create: jest.fn(),
  findAll: jest.fn(),
  findAllActiveByUserId: jest.fn(),
  findAllByBlockId: jest.fn(),
  update: jest.fn(),
  findUniqueUsers: jest.fn(),
  getBlockOperator: jest.fn(),
});

describe('BlockOperatorController', () => {
  let controller: BlockOperatorController;
  let service: ReturnType<typeof buildServiceMock>;
  const fakeResult = { ok: true } as any;
  const user: any = { id: 1 };

  beforeEach(() => {
    service = buildServiceMock();
    controller = new BlockOperatorController(service as unknown as BlockOperatorService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('create', () => {
    it('delegates to service.create with userId and dto', () => {
      service.create.mockReturnValue(fakeResult);
      const dto: any = { blockId: 1 };
      expect(controller.create(user, 1, 'dev', 1, dto)).toBe(fakeResult);
      expect(service.create).toHaveBeenCalledWith(1, dto);
    });
  });

  describe('findAll', () => {
    it('delegates to service.findAll', () => {
      service.findAll.mockReturnValue(fakeResult);
      const filter: any = { blockId: 1 };
      expect(controller.findAll(user, 1, 'dev', 1, filter)).toBe(fakeResult);
      expect(service.findAll).toHaveBeenCalledWith(filter);
    });
  });

  describe('findAllActiveByUserId', () => {
    it('delegates to service.findAllActiveByUserId', () => {
      service.findAllActiveByUserId.mockReturnValue(fakeResult);
      const filter: any = { userId: 1 };
      expect(controller.findAllActiveByUserId(user, 1, 'dev', 1, filter)).toBe(fakeResult);
      expect(service.findAllActiveByUserId).toHaveBeenCalledWith(filter);
    });
  });

  describe('findAllByBlockId', () => {
    it('delegates to service.findAllByBlockId', () => {
      service.findAllByBlockId.mockReturnValue(fakeResult);
      const filter: any = { blockId: 1 };
      expect(controller.findAllByBlockId(user, 1, 'dev', 1, filter)).toBe(fakeResult);
      expect(service.findAllByBlockId).toHaveBeenCalledWith(filter);
    });
  });

  describe('update', () => {
    it('delegates with id and userId', () => {
      service.update.mockReturnValue(fakeResult);
      const dto: any = { isInitialized: true };
      expect(controller.update(5, 1, 'dev', 1, dto)).toBe(fakeResult);
      expect(service.update).toHaveBeenCalledWith(1, 5, dto);
    });
  });

  describe('findUniqueUsers', () => {
    it('delegates body DTO', () => {
      service.findUniqueUsers.mockReturnValue(fakeResult);
      const dto: any = { blockIds: [1, 2] };
      expect(controller.findUniqueUsers(user, 1, 'dev', 1, dto)).toBe(fakeResult);
      expect(service.findUniqueUsers).toHaveBeenCalledWith(dto);
    });
  });

  describe('getBlockOperator', () => {
    it('delegates with no args', () => {
      service.getBlockOperator.mockReturnValue(fakeResult);
      expect(controller.getBlockOperator(1, 'dev', 1)).toBe(fakeResult);
      expect(service.getBlockOperator).toHaveBeenCalledWith();
    });
  });
});
