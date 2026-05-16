import { DataService } from '../data.service';

describe('DataService', () => {
  let service: DataService;
  let dataSource: any;
  const originalEnv = process.env.MASTER_DATA_SERVICE;

  beforeEach(() => {
    dataSource = { createQueryRunner: jest.fn() };
    service = new DataService(dataSource);
    (service as any).logger = { verbose: jest.fn(), error: jest.fn() };
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
    process.env.MASTER_DATA_SERVICE = originalEnv;
  });

  it('is defined', () => {
    expect(service).toBeDefined();
  });

  it('skips interval scheduling when MASTER_DATA_SERVICE is not "TRUE"', async () => {
    process.env.MASTER_DATA_SERVICE = 'FALSE';
    const spy = jest.spyOn(global, 'setInterval');

    await service.onModuleInit();

    expect(spy).not.toHaveBeenCalled();
  });

  it('schedules the transfer interval when MASTER_DATA_SERVICE is "TRUE"', async () => {
    process.env.MASTER_DATA_SERVICE = 'TRUE';
    const spy = jest.spyOn(global, 'setInterval');

    await service.onModuleInit();

    expect(spy).toHaveBeenCalled();
  });
});
