import { CreateScheduleDto } from '../dto/create-schedule.dto';
import { UpdateScheduleDto } from '../dto/update-schedule.dto';
import { ScheduleController } from '../schedule.controller';
import { ScheduleService } from '../schedule.service';

const buildServiceMock = () => ({
  create: jest.fn(),
  findAllScheduleByBlock: jest.fn(),
  updateActive: jest.fn(),
  update: jest.fn(),
});

describe('ScheduleController', () => {
  let controller: ScheduleController;
  let service: ReturnType<typeof buildServiceMock>;
  const user: any = { id: 1 };
  const fakeResult = { ok: true } as any;

  beforeEach(() => {
    service = buildServiceMock();
    controller = new ScheduleController(service as unknown as ScheduleService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('create delegates to service.create with userId and dto', async () => {
    service.create.mockResolvedValue(fakeResult);
    const dto = {} as CreateScheduleDto;

    const result = await controller.create(user, 1, 'dev', 1, dto);

    expect(service.create).toHaveBeenCalledWith(1, dto);
    expect(result).toBe(fakeResult);
  });

  it('findAllScheduleByBlock delegates to service', async () => {
    service.findAllScheduleByBlock.mockResolvedValue(fakeResult);
    const result = await controller.findAllScheduleByBlock(user, 5);
    expect(service.findAllScheduleByBlock).toHaveBeenCalledWith(5);
    expect(result).toBe(fakeResult);
  });

  it('updateActive delegates to service.updateActive', async () => {
    service.updateActive.mockResolvedValue(fakeResult);
    const dto = {} as UpdateScheduleDto;

    const result = await controller.updateActive(user, 7, 1, 'dev', 1, dto);

    expect(service.updateActive).toHaveBeenCalledWith(1, 7, dto);
    expect(result).toBe(fakeResult);
  });

  it('update delegates to service.update', async () => {
    service.update.mockResolvedValue(fakeResult);
    const dto = {} as UpdateScheduleDto;

    const result = await controller.update(user, 1, 'dev', 1, dto);

    expect(service.update).toHaveBeenCalledWith(1, dto);
    expect(result).toBe(fakeResult);
  });
});
