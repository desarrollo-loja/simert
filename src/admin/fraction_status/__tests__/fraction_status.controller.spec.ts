import { FractionStatusController } from '../fraction_status.controller';
import { FractionStatusService } from '../fraction_status.service';

const buildServiceMock = () => ({
  findAllFractionState: jest.fn(),
});

describe('FractionStatusController', () => {
  let controller: FractionStatusController;
  let service: ReturnType<typeof buildServiceMock>;
  const fakeResult = { ok: true } as any;

  beforeEach(() => {
    service = buildServiceMock();
    controller = new FractionStatusController(service as unknown as FractionStatusService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('findAll delegates to service.findAllFractionState', async () => {
    service.findAllFractionState.mockResolvedValue(fakeResult);

    const filter: any = { year: 2026, month: 5 };
    const result = await controller.findAll(7 as any, filter);

    expect(service.findAllFractionState).toHaveBeenCalledWith(7, filter);
    expect(result).toBe(fakeResult);
  });
});
