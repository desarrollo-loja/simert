import { FilterDto } from 'src/common/dto/filter.dto';

import { PhysicsController } from '../physics.controller';
import { PhysicsService } from '../physics.service';

const buildServiceMock = () => ({
  findAll: jest.fn(),
  findAllTotal: jest.fn(),
  findAllTotalUnique: jest.fn(),
});

describe('PhysicsController', () => {
  let controller: PhysicsController;
  let service: ReturnType<typeof buildServiceMock>;
  const filter = {} as FilterDto;
  const fakeResult = { ok: true } as any;

  beforeEach(() => {
    service = buildServiceMock();
    controller = new PhysicsController(service as unknown as PhysicsService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('findAll delegates to service.findAll', async () => {
    service.findAll.mockResolvedValue(fakeResult);
    const result = await controller.findAll(1, 'dev', 1, filter);
    expect(service.findAll).toHaveBeenCalledWith(filter);
    expect(result).toBe(fakeResult);
  });

  it('findAllTotal delegates to service.findAllTotal', async () => {
    service.findAllTotal.mockResolvedValue(fakeResult);
    const result = await controller.findAllTotal(1, 'dev', 1, filter);
    expect(service.findAllTotal).toHaveBeenCalledWith(filter);
    expect(result).toBe(fakeResult);
  });

  it('findAllTotalUnique delegates to service.findAllTotalUnique', async () => {
    service.findAllTotalUnique.mockResolvedValue(fakeResult);
    const result = await controller.findAllTotalUnique(1, 'dev', 1, filter);
    expect(service.findAllTotalUnique).toHaveBeenCalledWith(filter);
    expect(result).toBe(fakeResult);
  });
});
