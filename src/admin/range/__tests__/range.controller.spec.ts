import { FilterDto } from 'src/common/dto/filter.dto';

import { CreateRangeDto } from '../dto/create-range.dto';
import { UpdateRangeDto } from '../dto/update-range.dto';
import { RangeController } from '../range.controller';
import { RangeService } from '../range.service';

const buildServiceMock = () => ({
  create: jest.fn(),
  update: jest.fn(),
  findAll: jest.fn(),
  findAllTotal: jest.fn(),
  verifyRange: jest.fn(),
});

describe('RangeController', () => {
  let controller: RangeController;
  let service: ReturnType<typeof buildServiceMock>;
  const user: any = { id: 1 };
  const fake = { ok: true } as any;

  beforeEach(() => {
    service = buildServiceMock();
    controller = new RangeController(service as unknown as RangeService);
  });

  it('is defined', () => {
    expect(controller).toBeDefined();
  });

  it('create delegates with userId and dto', async () => {
    service.create.mockResolvedValue(fake);
    const dto = { from: '1' } as CreateRangeDto;

    const result = await controller.create(user, 1, 'dev', 1, dto);

    expect(service.create).toHaveBeenCalledWith(1, dto);
    expect(result).toBe(fake);
  });

  it('update parses id and delegates', async () => {
    service.update.mockResolvedValue(fake);
    const dto = {} as UpdateRangeDto;

    const result = await controller.update(user, 1, 'dev', '5', 1, dto);

    expect(service.update).toHaveBeenCalledWith(1, 5, dto);
    expect(result).toBe(fake);
  });

  it('findAll delegates filter to service', async () => {
    service.findAll.mockResolvedValue(fake);
    const filter = { search: 'q' } as FilterDto;

    const result = await controller.findAll(user, 1, 'dev', 1, filter);

    expect(service.findAll).toHaveBeenCalledWith(filter);
    expect(result).toBe(fake);
  });

  it('findAllTotal delegates filter to service', async () => {
    service.findAllTotal.mockResolvedValue(fake);
    const filter = {} as FilterDto;

    const result = await controller.findAllTotal(user, 1, 'dev', filter);

    expect(service.findAllTotal).toHaveBeenCalledWith(filter);
    expect(result).toBe(fake);
  });

  it('verifyRange delegates filter to service', async () => {
    service.verifyRange.mockResolvedValue(fake);
    const filter = { from: 1, to: 10 } as FilterDto;

    const result = await controller.verifyRange(user, 1, 'dev', 1, filter);

    expect(service.verifyRange).toHaveBeenCalledWith(filter);
    expect(result).toBe(fake);
  });
});
