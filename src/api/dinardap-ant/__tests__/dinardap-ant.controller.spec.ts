import { DinardapAntController } from '../dinardap-ant.controller';
import { DinardapAntService } from '../dinardap-ant.service';

const buildServiceMock = () => ({
  getUserDataByPlateAnt: jest.fn(),
});

describe('DinardapAntController', () => {
  let controller: DinardapAntController;
  let service: ReturnType<typeof buildServiceMock>;
  const fakeResult = { ok: true } as any;

  beforeEach(() => {
    service = buildServiceMock();
    controller = new DinardapAntController(service as unknown as DinardapAntService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('getUserDataByPlateAnt delegates with plate only', async () => {
    service.getUserDataByPlateAnt.mockResolvedValue(fakeResult);
    const result = await controller.getUserDataByPlateAnt('1', 'dev', 'app', 'ABC-123');
    expect(service.getUserDataByPlateAnt).toHaveBeenCalledWith('ABC-123');
    expect(result).toBe(fakeResult);
  });
});
