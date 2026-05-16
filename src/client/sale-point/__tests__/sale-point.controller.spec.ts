import { SalePointController } from '../sale-point.controller';
import { SalePointService } from '../sale-point.service';

const buildServiceMock = () => ({
  findAllActiveModeFixed: jest.fn(),
  findAllActiveModeMobile: jest.fn(),
});

describe('SalePointController (client)', () => {
  let controller: SalePointController;
  let service: ReturnType<typeof buildServiceMock>;
  const fakeResult = { ok: true } as any;

  beforeEach(() => {
    service = buildServiceMock();
    controller = new SalePointController(service as unknown as SalePointService);
  });

  it('findAllActiveModeFixed delegates with filter dto', () => {
    service.findAllActiveModeFixed.mockReturnValue(fakeResult);
    const result = controller.findAllActiveModeFixed(1, 'dev', 1, { search: 'x' } as any);
    expect(service.findAllActiveModeFixed).toHaveBeenCalledWith({ search: 'x' });
    expect(result).toBe(fakeResult);
  });

  it('findAllActiveModeMobile delegates with filter dto', () => {
    service.findAllActiveModeMobile.mockReturnValue(fakeResult);
    const result = controller.findAllActiveModeMobile(1, 'dev', 1, { search: 'x' } as any);
    expect(service.findAllActiveModeMobile).toHaveBeenCalledWith({ search: 'x' });
    expect(result).toBe(fakeResult);
  });
});
