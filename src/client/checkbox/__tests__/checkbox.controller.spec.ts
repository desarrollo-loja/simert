import { CheckboxController } from '../checkbox.controller';
import { CheckboxService } from '../checkbox.service';
import { CreateCheckboxDto } from '../dto/create-checkbox.dto';

// Direct instantiation avoids pulling the Nest DI graph (Keycloak guards/JwtService).
const buildServiceMock = () => ({
  getTransactions: jest.fn(),
  getTransactionsById: jest.fn(),
  buyCheckboxs: jest.fn(),
  getCardsAndCheckboxes: jest.fn(),
  onResponsePay: jest.fn(),
  onResponsePayError: jest.fn(),
});

describe('CheckboxController', () => {
  let controller: CheckboxController;
  let service: ReturnType<typeof buildServiceMock>;

  const user: any = { id: 1, roles: ['USER'] };
  const fakeResult = { ok: true } as any;

  beforeEach(() => {
    service = buildServiceMock();
    controller = new CheckboxController(service as unknown as CheckboxService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('getTransactions', () => {
    it('delegates to service.getTransactions with userId, dto and pagination', async () => {
      service.getTransactions.mockResolvedValue(fakeResult);
      const dto: any = { year: 2025, month: 5, currentMonth: true };
      const pag: any = { limit: 10, offset: 0 };

      const result = await controller.getTransactions(user, 1, 'dev', dto, pag);

      expect(service.getTransactions).toHaveBeenCalledWith(1, dto, pag);
      expect(result).toBe(fakeResult);
    });
  });

  describe('getTransactionsById', () => {
    it('delegates to service.getTransactionsById', async () => {
      service.getTransactionsById.mockResolvedValue(fakeResult);

      const result = await controller.getTransactionsById(user, 1, 'dev', 7);

      expect(service.getTransactionsById).toHaveBeenCalledWith(1, 7);
      expect(result).toBe(fakeResult);
    });
  });

  describe('parking (buy checkboxes)', () => {
    it('delegates to service.buyCheckboxs', async () => {
      service.buyCheckboxs.mockResolvedValue(fakeResult);
      const dto = { checkboxes: 2, amount: 5 } as unknown as CreateCheckboxDto;

      const result = await controller.parking(user, 1, 'dev', 1, dto);

      expect(service.buyCheckboxs).toHaveBeenCalledWith('dev', dto);
      expect(result).toBe(fakeResult);
    });
  });

  describe('getCardsAndCheckboxes', () => {
    it('delegates to service.getCardsAndCheckboxes', async () => {
      service.getCardsAndCheckboxes.mockResolvedValue(fakeResult);

      const result = await controller.getCardsAndCheckboxes(user, 1, 'dev', 1);

      expect(service.getCardsAndCheckboxes).toHaveBeenCalledWith(1);
      expect(result).toBe(fakeResult);
    });
  });

  describe('onResponse (success webhook)', () => {
    it('delegates to service.onResponsePay', async () => {
      service.onResponsePay.mockResolvedValue(fakeResult);

      const result = await controller.onResponse(1, 2, 5000, 7, 'dev', 'REG');

      expect(service.onResponsePay).toHaveBeenCalledWith('dev', 1, 7, 5000, 'REG', 2);
      expect(result).toBe(fakeResult);
    });
  });

  describe('onResponsePayError (error webhook)', () => {
    it('delegates to service.onResponsePayError', async () => {
      service.onResponsePayError.mockResolvedValue(fakeResult);

      const result = await controller.onResponsePayError(1, 2, 5000, 7, 'dev', 'REG', 'CONCEPT');

      expect(service.onResponsePayError).toHaveBeenCalledWith('dev', 1, 7, 5000, 'REG', 2);
      expect(result).toBe(fakeResult);
    });
  });
});
