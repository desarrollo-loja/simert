import { RangeSalePointController } from '../range-sale-point.controller';
import { RangeSalePointService } from '../range-sale-point.service';

describe('RangeSalePointController (client)', () => {
  let controller: RangeSalePointController;
  let service: { getRangeSalePointByUserId: jest.Mock };

  beforeEach(() => {
    service = { getRangeSalePointByUserId: jest.fn() };
    controller = new RangeSalePointController(service as unknown as RangeSalePointService);
  });

  it('parses userId and delegates to the service', () => {
    const fake = { ok: true } as any;
    service.getRangeSalePointByUserId.mockReturnValue(fake);

    const result = controller.getRangeSalePointByUserId('42', 'device-uuid');

    expect(service.getRangeSalePointByUserId).toHaveBeenCalledWith(42);
    expect(result).toBe(fake);
  });
});
