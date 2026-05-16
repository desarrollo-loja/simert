import { FilterDto } from 'src/common/dto/filter.dto';

import { CatalogController } from '../catalog.controller';
import { CatalogService } from '../catalog.service';
import { CreateCatalogDto } from '../dto/create-catalog.dto';
import { UpdateCatalogDto } from '../dto/update-catalog.dto';

const buildServiceMock = () => ({
  create: jest.fn(),
  findAll: jest.fn(),
  update: jest.fn(),
});

describe('CatalogController', () => {
  let controller: CatalogController;
  let service: ReturnType<typeof buildServiceMock>;
  const filter = {} as FilterDto;
  const fakeResult = { ok: true } as any;

  beforeEach(() => {
    service = buildServiceMock();
    controller = new CatalogController(service as unknown as CatalogService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('create delegates with userId and dto', async () => {
    service.create.mockResolvedValue(fakeResult);
    const dto = {} as CreateCatalogDto;
    const result = await controller.create(1, 'dev', 1, dto);
    expect(service.create).toHaveBeenCalledWith(1, dto);
    expect(result).toBe(fakeResult);
  });

  it('findAll delegates to service.findAll', async () => {
    service.findAll.mockResolvedValue(fakeResult);
    const result = await controller.findAll(1, 'dev', 1, filter);
    expect(service.findAll).toHaveBeenCalledWith(filter);
    expect(result).toBe(fakeResult);
  });

  it('update parses id and delegates', async () => {
    service.update.mockResolvedValue(fakeResult);
    const dto = {} as UpdateCatalogDto;
    const result = await controller.update('5', 1, 'dev', 1, dto);
    expect(service.update).toHaveBeenCalledWith(5, 1, dto);
    expect(result).toBe(fakeResult);
  });
});
