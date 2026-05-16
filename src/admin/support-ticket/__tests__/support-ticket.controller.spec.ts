import { CreateSupportTicketDto } from '../dto/create-support-ticket.dto';
import { SupportTicketFilterDto } from '../dto/support-ticket-filter.dto';
import { UpdateSupportTicketDto } from '../dto/update-support-ticket.dto';
import { SupportTicketController } from '../support-ticket.controller';
import { SupportTicketService } from '../support-ticket.service';

const buildServiceMock = () => ({
  create: jest.fn(),
  findAll: jest.fn(),
  findAllTotal: jest.fn(),
  findOne: jest.fn(),
  update: jest.fn(),
  remove: jest.fn(),
});

describe('SupportTicketController', () => {
  let controller: SupportTicketController;
  let service: ReturnType<typeof buildServiceMock>;
  const user: any = {};
  const fakeResult = { ok: true } as any;

  beforeEach(() => {
    service = buildServiceMock();
    controller = new SupportTicketController(service as unknown as SupportTicketService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('create delegates to service.create', async () => {
    service.create.mockResolvedValue(fakeResult);
    const dto = {} as CreateSupportTicketDto;
    const result = await controller.create(dto);
    expect(service.create).toHaveBeenCalledWith(dto);
    expect(result).toBe(fakeResult);
  });

  it('findAll delegates to service.findAll', async () => {
    service.findAll.mockResolvedValue(fakeResult);
    const filter = {} as SupportTicketFilterDto;
    const result = await controller.findAll(1, 'dev', filter);
    expect(service.findAll).toHaveBeenCalledWith(filter);
    expect(result).toBe(fakeResult);
  });

  it('findAllTotal delegates to service.findAllTotal', async () => {
    service.findAllTotal.mockResolvedValue(fakeResult);
    const filter = {} as SupportTicketFilterDto;
    const result = await controller.findAllTotal(1, 'dev', filter);
    expect(service.findAllTotal).toHaveBeenCalledWith(filter);
    expect(result).toBe(fakeResult);
  });

  it('findOne delegates to service.findOne', async () => {
    service.findOne.mockResolvedValue(fakeResult);
    const result = await controller.findOne(7);
    expect(service.findOne).toHaveBeenCalledWith(7);
    expect(result).toBe(fakeResult);
  });

  it('update delegates to service.update', async () => {
    service.update.mockResolvedValue(fakeResult);
    const dto = {} as UpdateSupportTicketDto;
    const result = await controller.update(1, 'dev', 9, dto);
    expect(service.update).toHaveBeenCalledWith(9, dto);
    expect(result).toBe(fakeResult);
  });

  it('remove delegates to service.remove', async () => {
    service.remove.mockResolvedValue(fakeResult);
    const result = await controller.remove(user, 1, 'dev', 9);
    expect(service.remove).toHaveBeenCalledWith(9);
    expect(result).toBe(fakeResult);
  });
});
