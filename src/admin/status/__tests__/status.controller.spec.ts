import { StatusController } from '../status.controller';
import { StatusService } from '../status.service';

const buildServiceMock = () => ({
  initializeDatabase: jest.fn(),
  findAllByfilter: jest.fn(),
});

describe('StatusController', () => {
  let controller: StatusController;
  let service: ReturnType<typeof buildServiceMock>;
  const fakeResult = { ok: true } as any;

  beforeEach(() => {
    service = buildServiceMock();
    controller = new StatusController(service as unknown as StatusService);
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

  it('findAllByfilter delegates to service', async () => {
    service.findAllByfilter.mockResolvedValue(fakeResult);
    const result = await controller.findAllByfilter();
    expect(service.findAllByfilter).toHaveBeenCalled();
    expect(result).toBe(fakeResult);
  });
});
