import { FilterDto } from 'src/common/dto/filter.dto';

import { CreateSalePointDto } from '../dto/create-sale-point.dto';
import { UpdateSalePointDto } from '../dto/update-sale-point.dto';
import { SalePointController } from '../sale-point.controller';
import { SalePointService } from '../sale-point.service';

// Direct instantiation avoids pulling the Nest DI graph (guards/JwtService).
const buildServiceMock = () => ({
  create: jest.fn(),
  findAll: jest.fn(),
  findAllFilter: jest.fn(),
  findAllTotal: jest.fn(),
  update: jest.fn(),
  existsByUserId: jest.fn(),
});

describe('SalePointController', () => {
  let controller: SalePointController;
  let service: ReturnType<typeof buildServiceMock>;
  const fakeResult = { ok: true } as any;

  beforeEach(() => {
    service = buildServiceMock();
    controller = new SalePointController(service as unknown as SalePointService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('create delegates to service.create', async () => {
    service.create.mockResolvedValue(fakeResult);
    const dto = {} as CreateSalePointDto;

    const result = await controller.create(1, 'dev', 1, dto);

    expect(service.create).toHaveBeenCalledWith(1, dto);
    expect(result).toBe(fakeResult);
  });

  it('findAll delegates to service.findAll', async () => {
    service.findAll.mockResolvedValue(fakeResult);
    const filter = {} as FilterDto;

    const result = await controller.findAll(1, 'dev', 1, filter);

    expect(service.findAll).toHaveBeenCalledWith(filter);
    expect(result).toBe(fakeResult);
  });

  it('findAllFilter delegates to service.findAllFilter', async () => {
    service.findAllFilter.mockResolvedValue(fakeResult);
    const filter = {} as FilterDto;

    const result = await controller.findAllFilter(1, 'dev', 1, filter);

    expect(service.findAllFilter).toHaveBeenCalledWith(filter);
    expect(result).toBe(fakeResult);
  });

  it('findAllTotal delegates to service.findAllTotal', async () => {
    service.findAllTotal.mockResolvedValue(fakeResult);
    const filter = {} as FilterDto;

    const result = await controller.findAllTotal(1, 'dev', 1, filter);

    expect(service.findAllTotal).toHaveBeenCalledWith(filter);
    expect(result).toBe(fakeResult);
  });

  it('update delegates to service.update', async () => {
    service.update.mockResolvedValue(fakeResult);
    const dto = {} as UpdateSalePointDto;

    const result = await controller.update(7, 1, 'dev', 1, dto);

    expect(service.update).toHaveBeenCalledWith(1, 7, dto);
    expect(result).toBe(fakeResult);
  });

  it('existsByUserId delegates to service.existsByUserId', async () => {
    service.existsByUserId.mockResolvedValue(fakeResult);

    const result = await controller.existsByUserId(9, 1, 'dev', 1);

    expect(service.existsByUserId).toHaveBeenCalledWith(9);
    expect(result).toBe(fakeResult);
  });
});
