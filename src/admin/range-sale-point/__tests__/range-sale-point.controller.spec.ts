import { CreateRangeSalePointDto } from '../dto/create-range-sale-point.dto';
import { UpdateRangeSalePointDto } from '../dto/update-range-sale-point.dto';
import { RangeSalePointController } from '../range-sale-point.controller';
import { RangeSalePointService } from '../range-sale-point.service';

// Direct instantiation avoids pulling the Nest DI graph (guards/JwtService).
const buildServiceMock = () => ({
  create: jest.fn(),
  findAll: jest.fn(),
  getAvailable: jest.fn(),
  findAllTotal: jest.fn(),
  findOne: jest.fn(),
  update: jest.fn(),
});

describe('RangeSalePointController', () => {
  let controller: RangeSalePointController;
  let service: ReturnType<typeof buildServiceMock>;

  const fakeResult = { ok: true } as any;

  beforeEach(() => {
    service = buildServiceMock();
    controller = new RangeSalePointController(service as unknown as RangeSalePointService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('create', () => {
    it('delegates to service.create with userId and dto', async () => {
      service.create.mockResolvedValue(fakeResult);
      const dto = { sold: 5 } as CreateRangeSalePointDto;

      const result = await controller.create(1, 'dev', 1, dto);

      expect(service.create).toHaveBeenCalledWith(1, dto);
      expect(result).toBe(fakeResult);
    });
  });

  describe('findAll', () => {
    it('delegates to service.findAll with filter', async () => {
      service.findAll.mockResolvedValue(fakeResult);
      const filter: any = { userId: 1 };

      const result = await controller.findAll(1, 'dev', 1, filter);

      expect(service.findAll).toHaveBeenCalledWith(filter);
      expect(result).toBe(fakeResult);
    });
  });

  describe('getAvailable', () => {
    it('delegates to service.getAvailable with filter', async () => {
      service.getAvailable.mockResolvedValue(fakeResult);
      const filter: any = { salePointId: 2 };

      const result = await controller.getAvailable(1, 'dev', 1, filter);

      expect(service.getAvailable).toHaveBeenCalledWith(filter);
      expect(result).toBe(fakeResult);
    });
  });

  describe('findAllTotal', () => {
    it('delegates to service.findAllTotal with filter', async () => {
      service.findAllTotal.mockResolvedValue(fakeResult);
      const filter: any = {};

      const result = await controller.findAllTotal(1, 'dev', 1, filter);

      expect(service.findAllTotal).toHaveBeenCalledWith(filter);
      expect(result).toBe(fakeResult);
    });
  });

  describe('findOne', () => {
    it('delegates to service.findOne with id', async () => {
      service.findOne.mockResolvedValue(fakeResult);

      const result = await controller.findOne(7, 1, 'dev', 1);

      expect(service.findOne).toHaveBeenCalledWith(7);
      expect(result).toBe(fakeResult);
    });
  });

  describe('update', () => {
    it('delegates to service.update with userId, id and dto', async () => {
      service.update.mockResolvedValue(fakeResult);
      const dto = { sold: 3 } as UpdateRangeSalePointDto;

      const result = await controller.update(7, 1, 'dev', 1, dto);

      expect(service.update).toHaveBeenCalledWith(1, 7, dto);
      expect(result).toBe(fakeResult);
    });
  });
});
