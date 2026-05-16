import { AntController } from '../ant.controller';
import { AntService } from '../ant.service';

const buildServiceMock = () => ({
  findAll: jest.fn(),
  getUserDataByPlateAnt: jest.fn(),
});

describe('AntController', () => {
  let controller: AntController;
  let service: ReturnType<typeof buildServiceMock>;
  const fakeResult = { ok: true } as any;

  beforeEach(() => {
    service = buildServiceMock();
    controller = new AntController(service as unknown as AntService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('findAll delegates to service.findAll', async () => {
    service.findAll.mockResolvedValue(fakeResult);
    expect(await controller.findAll()).toBe(fakeResult);
    expect(service.findAll).toHaveBeenCalled();
  });

  it('getUserDataByPlateAnt delegates with plate only', async () => {
    service.getUserDataByPlateAnt.mockResolvedValue(fakeResult);
    const result = await controller.getUserDataByPlateAnt('1', 'dev', 'app', 'ABC-123');
    expect(service.getUserDataByPlateAnt).toHaveBeenCalledWith('ABC-123');
    expect(result).toBe(fakeResult);
  });
});
