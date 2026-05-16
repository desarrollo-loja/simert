import { FilterDto } from 'src/common/dto/filter.dto';

import { CreateSlotDto } from '../dto/create-slot.dto';
import { UpdateSlotDto } from '../dto/update-slot.dto';
import { SlotController } from '../slot.controller';
import { SlotService } from '../slot.service';

const buildServiceMock = () => ({
  initializeDatabase: jest.fn(),
  create: jest.fn(),
  findAll: jest.fn(),
  findAllByfilter: jest.fn(),
  findAllSlotBlockParking: jest.fn(),
  update: jest.fn(),
  getSlotsByBlockByZone: jest.fn(),
  getSlotsByPolygon: jest.fn(),
  findStatistics: jest.fn(),
});

describe('SlotController', () => {
  let controller: SlotController;
  let service: ReturnType<typeof buildServiceMock>;
  const user: any = {};
  const fakeResult = { ok: true } as any;

  beforeEach(() => {
    service = buildServiceMock();
    controller = new SlotController(service as unknown as SlotService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('initializeDatabase delegates to service', async () => {
    service.initializeDatabase.mockResolvedValue(fakeResult);
    const result = await controller.initializeDatabase();
    expect(service.initializeDatabase).toHaveBeenCalled();
    expect(result).toBe(fakeResult);
  });

  it('create delegates to service.create', async () => {
    service.create.mockResolvedValue(fakeResult);
    const dto = {} as CreateSlotDto;
    const result = await controller.create(user, 1, 'dev', dto);
    expect(service.create).toHaveBeenCalledWith(1, dto);
    expect(result).toBe(fakeResult);
  });

  it('findAll delegates to service.findAll', async () => {
    service.findAll.mockResolvedValue(fakeResult);
    const filter = {} as FilterDto;
    const result = await controller.findAll(user, 1, 'dev', filter);
    expect(service.findAll).toHaveBeenCalledWith(filter);
    expect(result).toBe(fakeResult);
  });

  it('findAllByfilter delegates to service.findAllByfilter', async () => {
    service.findAllByfilter.mockResolvedValue(fakeResult);
    const result = await controller.findAllByfilter(1, 2);
    expect(service.findAllByfilter).toHaveBeenCalledWith(1, 2);
    expect(result).toBe(fakeResult);
  });

  it('findAllSlotBlockParking delegates to service', async () => {
    service.findAllSlotBlockParking.mockResolvedValue(fakeResult);
    const pagination = {} as FilterDto;
    const result = await controller.findAllSlotBlockParking(user, 1, 'dev', 2, 3, 1, pagination);
    expect(service.findAllSlotBlockParking).toHaveBeenCalledWith(2, 3, pagination);
    expect(result).toBe(fakeResult);
  });

  it('update delegates to service.update', async () => {
    service.update.mockResolvedValue(fakeResult);
    const dto = {} as UpdateSlotDto;
    const result = await controller.update(user, 1, 'dev', '7', dto);
    expect(service.update).toHaveBeenCalledWith(1, 7, dto);
    expect(result).toBe(fakeResult);
  });

  it('getSlotsByBlockByZone delegates to service', async () => {
    service.getSlotsByBlockByZone.mockResolvedValue(fakeResult);
    const result = await controller.getSlotsByBlockByZone(user, 1, 2, 3, 'dev', 1);
    expect(service.getSlotsByBlockByZone).toHaveBeenCalledWith(1, 2);
    expect(result).toBe(fakeResult);
  });

  it('getSlotsByPolygon delegates to service', async () => {
    service.getSlotsByPolygon.mockResolvedValue(fakeResult);
    const filter = {} as FilterDto;
    const result = await controller.getSlotsByPolygon(user, 1, 2, 3, 'dev', 1, filter);
    expect(service.getSlotsByPolygon).toHaveBeenCalledWith(filter);
    expect(result).toBe(fakeResult);
  });

  it('findStatistics delegates to service', async () => {
    service.findStatistics.mockResolvedValue(fakeResult);
    const filter = {} as FilterDto;
    const result = await controller.findStatistics(1, 'dev', 1, filter);
    expect(service.findStatistics).toHaveBeenCalledWith(filter);
    expect(result).toBe(fakeResult);
  });
});
