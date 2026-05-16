import { PortalController } from '../portal.controller';
import { PortalService } from '../portal.service';

const buildServiceMock = () => ({
  findAll: jest.fn(),
  findOne: jest.fn(),
});

describe('PortalController', () => {
  let controller: PortalController;
  let service: ReturnType<typeof buildServiceMock>;
  const fakeResult = { ok: true } as any;

  beforeEach(() => {
    service = buildServiceMock();
    controller = new PortalController(service as unknown as PortalService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('findAll delegates to service.findAll', () => {
    service.findAll.mockReturnValue(fakeResult);
    expect(controller.findAll()).toBe(fakeResult);
  });

  it('findOne parses id and delegates', () => {
    service.findOne.mockReturnValue(fakeResult);
    expect(controller.findOne('3')).toBe(fakeResult);
    expect(service.findOne).toHaveBeenCalledWith(3);
  });
});
