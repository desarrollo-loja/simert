import { CreateIncidentNotificationDto } from '../dto/create-incident-notification.dto';
import { UpdateIncidentNotificationDto } from '../dto/update-incident-notification.dto';
import { IncidentNotificationController } from '../incident-notification.controller';
import { IncidentNotificationService } from '../incident-notification.service';

const buildServiceMock = () => ({
  create: jest.fn(),
  findAll: jest.fn(),
  findOne: jest.fn(),
  update: jest.fn(),
  remove: jest.fn(),
});

describe('IncidentNotificationController', () => {
  let controller: IncidentNotificationController;
  let service: ReturnType<typeof buildServiceMock>;
  const fakeResult = { ok: true } as any;

  beforeEach(() => {
    service = buildServiceMock();
    controller = new IncidentNotificationController(service as unknown as IncidentNotificationService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('create delegates to service.create', async () => {
    service.create.mockResolvedValue(fakeResult);
    const dto = {} as CreateIncidentNotificationDto;

    const result = await controller.create(dto);

    expect(service.create).toHaveBeenCalledWith(dto);
    expect(result).toBe(fakeResult);
  });

  it('findAll delegates to service.findAll', () => {
    service.findAll.mockReturnValue(fakeResult);
    const result = controller.findAll();
    expect(service.findAll).toHaveBeenCalled();
    expect(result).toBe(fakeResult);
  });

  it('findOne parses id and delegates', () => {
    service.findOne.mockReturnValue(fakeResult);
    const result = controller.findOne('3');
    expect(service.findOne).toHaveBeenCalledWith(3);
    expect(result).toBe(fakeResult);
  });

  it('update parses id and delegates', async () => {
    service.update.mockResolvedValue(fakeResult);
    const dto = {} as UpdateIncidentNotificationDto;

    const result = await controller.update('5', dto);

    expect(service.update).toHaveBeenCalledWith(5, dto);
    expect(result).toBe(fakeResult);
  });

  it('remove parses id and delegates', () => {
    service.remove.mockReturnValue(fakeResult);
    const result = controller.remove('7');
    expect(service.remove).toHaveBeenCalledWith(7);
    expect(result).toBe(fakeResult);
  });
});
