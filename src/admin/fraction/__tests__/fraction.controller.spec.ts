import { FractionController } from '../fraction.controller';
import { FractionService } from '../fraction.service';

const buildServiceMock = () => ({
  findAll: jest.fn(),
  findFractionHistory: jest.fn(),
  findAllTotalVehicleClientTime: jest.fn(),
  findAllTotalOccupationRotationParking: jest.fn(),
  findAllStatistics: jest.fn(),
  findStatisticsFractions: jest.fn(),
});

describe('FractionController', () => {
  let controller: FractionController;
  let service: ReturnType<typeof buildServiceMock>;
  const fakeResult = { ok: true } as any;

  beforeEach(() => {
    service = buildServiceMock();
    controller = new FractionController(service as unknown as FractionService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('findAll', () => {
    it('delegates to service.findAll', () => {
      service.findAll.mockReturnValue(fakeResult);
      const filter: any = {};
      expect(controller.findAll(1, 'dev', 1, filter)).toBe(fakeResult);
      expect(service.findAll).toHaveBeenCalledWith(filter);
    });
  });

  describe('findAllHistory', () => {
    it('delegates to service.findFractionHistory', () => {
      service.findFractionHistory.mockReturnValue(fakeResult);
      const filter: any = {};
      expect(controller.findAllHistory(1, 'dev', 1, filter)).toBe(fakeResult);
      expect(service.findFractionHistory).toHaveBeenCalledWith(filter);
    });
  });

  describe('findAllTotalVehicleClientTime', () => {
    it('delegates to service', () => {
      service.findAllTotalVehicleClientTime.mockReturnValue(fakeResult);
      const filter: any = {};
      expect(controller.findAllTotalVehicleClientTime(1, 'dev', 1, filter)).toBe(fakeResult);
      expect(service.findAllTotalVehicleClientTime).toHaveBeenCalledWith(filter);
    });
  });

  describe('findAllTotalOccupationRotationParking', () => {
    it('delegates to service', () => {
      service.findAllTotalOccupationRotationParking.mockReturnValue(fakeResult);
      const filter: any = {};
      expect(controller.findAllTotalOccupationRotationParking(1, 'dev', 1, filter)).toBe(
        fakeResult,
      );
      expect(service.findAllTotalOccupationRotationParking).toHaveBeenCalledWith(filter);
    });
  });

  describe('findAllStatistics', () => {
    it('delegates to service', () => {
      service.findAllStatistics.mockReturnValue(fakeResult);
      const filter: any = {};
      expect(controller.findAllStatistics(1, 'dev', 1, filter)).toBe(fakeResult);
      expect(service.findAllStatistics).toHaveBeenCalledWith(filter);
    });
  });

  describe('findStatisticsFractions', () => {
    it('delegates to service', () => {
      service.findStatisticsFractions.mockReturnValue(fakeResult);
      const filter: any = {};
      expect(controller.findStatisticsFractions(1, 'dev', 1, filter)).toBe(fakeResult);
      expect(service.findStatisticsFractions).toHaveBeenCalledWith(filter);
    });
  });
});
