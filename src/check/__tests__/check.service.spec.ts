import { CheckService } from '../check.service';

describe('CheckService', () => {
  let service: CheckService;

  beforeEach(() => {
    service = new CheckService(
      { query: jest.fn() } as any,
      {} as any,
      {} as any,
      { query: jest.fn() } as any,
      {} as any,
      {} as any,
      {} as any,
      { get: jest.fn(), set: jest.fn() } as any,
    );
    (service as any).logger = { verbose: jest.fn(), error: jest.fn(), warn: jest.fn() };
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('is defined', () => {
    expect(service).toBeDefined();
  });

  it('schedules the background intervals on module init', async () => {
    const spy = jest.spyOn(global, 'setInterval');
    await service.onModuleInit();
    expect(spy).toHaveBeenCalled();
  });
});
