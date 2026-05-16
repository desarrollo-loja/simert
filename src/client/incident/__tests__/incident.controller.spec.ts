import { IncidentController } from '../incident.controller';
import { IncidentService } from '../incident.service';

// Direct instantiation avoids pulling the Nest DI graph (guards/JwtService).
const buildServiceMock = () => ({
  checkMyFractionsOutstanding: jest.fn(),
  findSanctionByFraction: jest.fn(),
  findSanctionByIdentityCard: jest.fn(),
  pay: jest.fn(),
  onResponsePay: jest.fn(),
  onResponsePayError: jest.fn(),
  getTransactionsByReference: jest.fn(),
});

describe('IncidentController (client)', () => {
  let controller: IncidentController;
  let service: ReturnType<typeof buildServiceMock>;

  const user: any = { id: 1, roles: ['CLIENT'] };
  const fakeResult = { ok: true } as any;

  beforeEach(() => {
    service = buildServiceMock();
    controller = new IncidentController(service as unknown as IncidentService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('checkMyIncidentsOutstanding', () => {
    it('delegates plate/identityCard to service.checkMyFractionsOutstanding', async () => {
      service.checkMyFractionsOutstanding.mockResolvedValue(fakeResult);

      const result = await controller.checkMyIncidentsOutstanding(1, 'dev', 1, 'ABC123', '0102030405');

      expect(service.checkMyFractionsOutstanding).toHaveBeenCalledWith('ABC123', '0102030405');
      expect(result).toBe(fakeResult);
    });
  });

  describe('findSanctionByFraction', () => {
    it('delegates fractionId to service.findSanctionByFraction', async () => {
      service.findSanctionByFraction.mockResolvedValue(fakeResult);

      const result = await controller.findSanctionByFraction(user, 1, 'dev', 7, 1, {} as any);

      expect(service.findSanctionByFraction).toHaveBeenCalledWith(7);
      expect(result).toBe(fakeResult);
    });
  });

  describe('findSanctionByIdentityCard', () => {
    it('delegates parameters to service.findSanctionByIdentityCard', async () => {
      service.findSanctionByIdentityCard.mockResolvedValue(fakeResult);
      const dto: any = { foo: 'bar' };

      const result = await controller.findSanctionByIdentityCard(1, 'dev', '0102030405', 1, dto);

      expect(service.findSanctionByIdentityCard).toHaveBeenCalledWith(1, 'dev', '0102030405', dto);
      expect(result).toBe(fakeResult);
    });
  });

  describe('pay', () => {
    it('delegates to service.pay with idDevice and dto', async () => {
      service.pay.mockResolvedValue(fakeResult);
      const dto: any = { amount: 10 };

      const result = await controller.pay(user, 1, 'dev', 1, dto);

      expect(service.pay).toHaveBeenCalledWith('dev', dto);
      expect(result).toBe(fakeResult);
    });
  });

  describe('onResponse', () => {
    it('delegates webhook params to service.onResponsePay', async () => {
      service.onResponsePay.mockResolvedValue(fakeResult);

      const result = await controller.onResponse(1, 2, 5000, 'ref-1', 'dev', '2026-05-15', 'C');

      expect(service.onResponsePay).toHaveBeenCalledWith('dev', 1, 'ref-1', 5000, '2026-05-15', 2);
      expect(result).toBe(fakeResult);
    });
  });

  describe('onResponsePayError', () => {
    it('delegates webhook params to service.onResponsePayError', async () => {
      service.onResponsePayError.mockResolvedValue(fakeResult);

      const result = await controller.onResponsePayError(1, 2, 5000, 'ref-1', 'dev', '2026-05-15', 'C');

      expect(service.onResponsePayError).toHaveBeenCalledWith('dev', 1, 'ref-1', 5000, '2026-05-15', 2);
      expect(result).toBe(fakeResult);
    });
  });

  describe('getTransactionsByReference', () => {
    it('delegates to service.getTransactionsByReference', async () => {
      service.getTransactionsByReference.mockResolvedValue(fakeResult);

      const result = await controller.getTransactionsByReference(user, 1, 'dev', 'ref-1');

      expect(service.getTransactionsByReference).toHaveBeenCalledWith(1, 'ref-1');
      expect(result).toBe(fakeResult);
    });
  });
});
