import { CreateRangeSalePointTransactionDto } from '../dto/create-range-sale-point-transaction.dto';
import { RangeSalePointTransactionController } from '../range-sale-point-transaction.controller';
import { RangeSalePointTransactionService } from '../range-sale-point-transaction.service';

// Direct instantiation avoids pulling the Nest DI graph (guards/JwtService).
const buildServiceMock = () => ({
  create: jest.fn(),
  findAll: jest.fn(),
  countAll: jest.fn(),
});

describe('RangeSalePointTransactionController', () => {
  let controller: RangeSalePointTransactionController;
  let service: ReturnType<typeof buildServiceMock>;

  const fakeResult = { ok: true } as any;

  beforeEach(() => {
    service = buildServiceMock();
    controller = new RangeSalePointTransactionController(
      service as unknown as RangeSalePointTransactionService,
    );
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('create', () => {
    it('delegates to service.create with userId and dto', async () => {
      service.create.mockResolvedValue(fakeResult);
      const dto = {
        rangeSalePointId: 1,
        amount: 2,
        userIdBuy: 3,
        userIdSell: 4,
      } as CreateRangeSalePointTransactionDto;

      const result = await controller.create(1, 'dev', 1, dto);

      expect(service.create).toHaveBeenCalledWith(1, dto);
      expect(result).toBe(fakeResult);
    });
  });

  describe('findAll', () => {
    it('delegates to service.findAll with filter', async () => {
      service.findAll.mockResolvedValue(fakeResult);
      const filter: any = { userIdBuy: 1 };

      const result = await controller.findAll(1, 'dev', 1, filter);

      expect(service.findAll).toHaveBeenCalledWith(filter);
      expect(result).toBe(fakeResult);
    });
  });

  describe('countAll', () => {
    it('delegates to service.countAll with filter', async () => {
      service.countAll.mockResolvedValue(fakeResult);
      const filter: any = {};

      const result = await controller.countAll(1, 'dev', 1, filter);

      expect(service.countAll).toHaveBeenCalledWith(filter);
      expect(result).toBe(fakeResult);
    });
  });
});
