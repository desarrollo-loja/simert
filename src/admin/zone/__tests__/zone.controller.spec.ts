import { FilterDto } from 'src/common/dto/filter.dto';

import { CreateZoneDto } from '../dto/create-zone.dto';
import { UpdateZoneDto } from '../dto/update-zone.dto';
import { ZoneController } from '../zone.controller';
import { ZoneService } from '../zone.service';

const buildServiceMock = () => ({
  create: jest.fn(),
  findAll: jest.fn(),
  findAllByActive: jest.fn(),
  findAllByActives: jest.fn(),
  findAllByFilterParking: jest.fn(),
  update: jest.fn(),
  remove: jest.fn(),
});

describe('ZoneController', () => {
  let controller: ZoneController;
  let service: ReturnType<typeof buildServiceMock>;
  const user: any = {};
  const fakeResult = { ok: true } as any;

  beforeEach(() => {
    service = buildServiceMock();
    controller = new ZoneController(service as unknown as ZoneService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('createParking delegates to service.create', async () => {
    service.create.mockResolvedValue(fakeResult);
    const dto = {} as CreateZoneDto;
    const result = await controller.createParking(user, 1, 'dev', 1, dto);
    expect(service.create).toHaveBeenCalledWith(1, dto);
    expect(result).toBe(fakeResult);
  });

  it('findAll delegates to service.findAll', async () => {
    service.findAll.mockResolvedValue(fakeResult);
    const filter = {} as FilterDto;
    const result = await controller.findAll(user, 1, 'dev', 1, filter);
    expect(service.findAll).toHaveBeenCalledWith(filter);
    expect(result).toBe(fakeResult);
  });

  it('findAllByActive delegates to service.findAllByActive', async () => {
    service.findAllByActive.mockResolvedValue(fakeResult);
    const filter = {} as FilterDto;
    const result = await controller.findAllByActive(user, 1, 'dev', 1, filter);
    expect(service.findAllByActive).toHaveBeenCalledWith(filter);
    expect(result).toBe(fakeResult);
  });

  it('findAllByActives delegates to service.findAllByActives', async () => {
    service.findAllByActives.mockResolvedValue(fakeResult);
    const filter = {} as FilterDto;
    const result = await controller.findAllByActives(user, 1, 'dev', 1, filter);
    expect(service.findAllByActives).toHaveBeenCalledWith(filter);
    expect(result).toBe(fakeResult);
  });

  it('findAllByfilterParking delegates to service.findAllByFilterParking', async () => {
    service.findAllByFilterParking.mockResolvedValue(fakeResult);
    const filter = {} as FilterDto;
    const result = await controller.findAllByfilterParking(filter);
    expect(service.findAllByFilterParking).toHaveBeenCalledWith(filter);
    expect(result).toBe(fakeResult);
  });

  it('update delegates to service.update', async () => {
    service.update.mockResolvedValue(fakeResult);
    const dto = {} as UpdateZoneDto;
    const result = await controller.update(user, 7, 1, 'dev', 1, dto);
    expect(service.update).toHaveBeenCalledWith(1, 7, dto);
    expect(result).toBe(fakeResult);
  });

  it('remove delegates to service.remove', async () => {
    service.remove.mockResolvedValue(fakeResult);
    const result = await controller.remove(user, 7, 1, 'dev', 1);
    expect(service.remove).toHaveBeenCalledWith(1, 7);
    expect(result).toBe(fakeResult);
  });
});
