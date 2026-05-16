import { CreateRangeSalePointTransactionDto } from '../dto/create-range-sale-point-transaction.dto';
import { RangeSalePointTransactionController } from '../range-sale-point-transaction.controller';
import { RangeSalePointTransactionService } from '../range-sale-point-transaction.service';

describe('RangeSalePointTransactionController', () => {
  let controller: RangeSalePointTransactionController;
  let service: { create: jest.Mock };

  beforeEach(() => {
    service = { create: jest.fn() };
    controller = new RangeSalePointTransactionController(
      service as unknown as RangeSalePointTransactionService,
    );
  });

  it('delegates create to the service with userId and dto', () => {
    const fake = { ok: true } as any;
    service.create.mockReturnValue(fake);
    const dto = { rangeSalePointId: 1, amount: 2 } as CreateRangeSalePointTransactionDto;

    const result = controller.create(7, 'device-uuid', 1, dto);

    expect(service.create).toHaveBeenCalledWith(7, dto);
    expect(result).toBe(fake);
  });
});
