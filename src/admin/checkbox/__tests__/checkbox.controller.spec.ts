import { FilterDto } from 'src/common/dto/filter.dto';

import { CheckboxController } from '../checkbox.controller';
import { CheckboxService } from '../checkbox.service';

// Direct instantiation avoids pulling the Nest DI graph (guards/JwtService).
const buildServiceMock = () => ({
  findAll: jest.fn(),
  findAllByTransactionId: jest.fn(),
  findPaidWithoutIncident: jest.fn(),
  findPaidWithPendingIncident: jest.fn(),
  updateCheckboxById: jest.fn(),
  moveCheckboxToHistory: jest.fn(),
});

describe('CheckboxController', () => {
  let controller: CheckboxController;
  let service: ReturnType<typeof buildServiceMock>;

  const user: any = { id: 1, roles: ['ADMIN'] };
  const fakeResult = { ok: true } as any;

  beforeEach(() => {
    service = buildServiceMock();
    controller = new CheckboxController(service as unknown as CheckboxService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('findAll', () => {
    it('delegates to service.findAll with the filter dto', async () => {
      service.findAll.mockResolvedValue(fakeResult);
      const filter = { search: 'q' } as FilterDto;

      const result = await controller.findAll(user, 1, 'dev', 1, filter);

      expect(service.findAll).toHaveBeenCalledWith(filter);
      expect(result).toBe(fakeResult);
    });
  });

  describe('findAllByTransactionId', () => {
    it('delegates to service.findAllByTransactionId with the filter dto', async () => {
      service.findAllByTransactionId.mockResolvedValue(fakeResult);
      const filter = { transactionIds: ['a', 'b'] } as FilterDto;

      const result = await controller.findAllByTransactionId(user, filter);

      expect(service.findAllByTransactionId).toHaveBeenCalledWith(filter);
      expect(result).toBe(fakeResult);
    });
  });

  describe('findPaidWithoutIncident', () => {
    it('delegates to service.findPaidWithoutIncident', async () => {
      service.findPaidWithoutIncident.mockResolvedValue(fakeResult);

      const result = await controller.findPaidWithoutIncident();

      expect(service.findPaidWithoutIncident).toHaveBeenCalled();
      expect(result).toBe(fakeResult);
    });
  });

  describe('findPaidWithPendingIncident', () => {
    it('delegates to service.findPaidWithPendingIncident', async () => {
      service.findPaidWithPendingIncident.mockResolvedValue(fakeResult);

      const result = await controller.findPaidWithPendingIncident();

      expect(service.findPaidWithPendingIncident).toHaveBeenCalled();
      expect(result).toBe(fakeResult);
    });
  });

  describe('updateCheckboxById', () => {
    it('delegates to service.updateCheckboxById with id and fields', async () => {
      service.updateCheckboxById.mockResolvedValue(fakeResult);
      const fields = { amount: 5 };

      const result = await controller.updateCheckboxById(7, fields);

      expect(service.updateCheckboxById).toHaveBeenCalledWith(7, fields);
      expect(result).toBe(fakeResult);
    });
  });

  describe('moveCheckboxToHistory', () => {
    it('delegates to service.moveCheckboxToHistory with id', async () => {
      service.moveCheckboxToHistory.mockResolvedValue(fakeResult);

      const result = await controller.moveCheckboxToHistory(11);

      expect(service.moveCheckboxToHistory).toHaveBeenCalledWith(11);
      expect(result).toBe(fakeResult);
    });
  });
});
