import { PlotLocationDto } from '../dto/plot-location.dto';
import { TrakingController } from '../traking.controller';
import { TrakingService } from '../traking.service';

// Direct instantiation avoids pulling the Nest DI graph (guards/JwtService).
const buildServiceMock = () => ({
  plot: jest.fn(),
  getTrackingByUserId: jest.fn(),
  getTrackings: jest.fn(),
  getAllTracking: jest.fn(),
});

describe('TrakingController', () => {
  let controller: TrakingController;
  let service: ReturnType<typeof buildServiceMock>;

  const fakeResult = { ok: true } as any;

  beforeEach(() => {
    service = buildServiceMock();
    controller = new TrakingController(service as unknown as TrakingService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('plot', () => {
    it('delegates to service.plot with userId and dto', async () => {
      service.plot.mockResolvedValue(fakeResult);
      const dto = { p: '1,2,3', l: 'poly', t: 4 } as unknown as PlotLocationDto;

      const result = await controller.plot(7, dto);

      expect(service.plot).toHaveBeenCalledWith(7, dto);
      expect(result).toBe(fakeResult);
    });
  });

  describe('getTrackingByUserId', () => {
    it('delegates to service.getTrackingByUserId with userId only', async () => {
      service.getTrackingByUserId.mockResolvedValue(fakeResult);

      const result = await controller.getTrackingByUserId(7, 'device-uuid');

      expect(service.getTrackingByUserId).toHaveBeenCalledWith(7);
      expect(result).toBe(fakeResult);
    });
  });

  describe('getTrackings', () => {
    it('delegates to service.getTrackings with userIds string', async () => {
      service.getTrackings.mockResolvedValue(fakeResult);

      const result = await controller.getTrackings('1,2,3', 'device-uuid');

      expect(service.getTrackings).toHaveBeenCalledWith('1,2,3');
      expect(result).toBe(fakeResult);
    });
  });

  describe('getAllTracking', () => {
    it('parses from/to into Date instances and delegates to service.getAllTracking', async () => {
      service.getAllTracking.mockResolvedValue(fakeResult);
      const from = '2026-01-01T00:00:00.000Z';
      const to = '2026-01-02T23:59:59.000Z';

      const result = await controller.getAllTracking(
        7,
        'device-uuid',
        from as unknown as Date,
        to as unknown as Date,
      );

      expect(service.getAllTracking).toHaveBeenCalledTimes(1);
      const [userIdArg, fromArg, toArg] = service.getAllTracking.mock.calls[0];
      expect(userIdArg).toBe(7);
      expect(fromArg).toBeInstanceOf(Date);
      expect(toArg).toBeInstanceOf(Date);
      expect((fromArg as Date).toISOString()).toBe(new Date(from).toISOString());
      expect((toArg as Date).toISOString()).toBe(new Date(to).toISOString());
      expect(result).toBe(fakeResult);
    });
  });
});
