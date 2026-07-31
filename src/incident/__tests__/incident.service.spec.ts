import { IncidentService } from '../incident.service';

describe('IncidentService (root worker)', () => {
  let service: IncidentService;
  let repo: any;
  let gim: any;
  let common: any;

  beforeEach(() => {
    repo = { find: jest.fn(), save: jest.fn() };
    gim = { validateOpenTill: jest.fn(), registerDeposit: jest.fn() };
    common = { syncOnResponseExternal: jest.fn() };
    service = new IncidentService(repo, gim, common);
    (service as any).logger = { verbose: jest.fn(), error: jest.fn(), warn: jest.fn() };
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('is defined', () => {
    expect(service).toBeDefined();
  });

  it('schedules the deposit-validation interval on module init', async () => {
    const spy = jest.spyOn(global, 'setInterval');
    await service.onModuleInit();
    expect(spy).toHaveBeenCalled();
  });
});
