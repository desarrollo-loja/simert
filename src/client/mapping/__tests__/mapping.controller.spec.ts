import { MappingController } from '../mapping.controller';
import { MappingService } from '../mapping.service';

const buildServiceMock = () => ({
  findAllZones: jest.fn(),
  findAllBlock: jest.fn(),
  findAllSlot: jest.fn(),
  findSlotNearby: jest.fn(),
});

describe('MappingController', () => {
  let controller: MappingController;
  let service: ReturnType<typeof buildServiceMock>;
  const user: any = {};
  const fakeResult = { ok: true } as any;

  beforeEach(() => {
    service = buildServiceMock();
    controller = new MappingController(service as unknown as MappingService);
  });

  it('findAllZones delegates with paginationDto', () => {
    service.findAllZones.mockReturnValue(fakeResult);
    const result = controller.findAllZones(user, 1, 'dev', 1, { search: 'x' } as any);
    expect(service.findAllZones).toHaveBeenCalledWith({ search: 'x' });
    expect(result).toBe(fakeResult);
  });

  it('findAllBlock delegates with paginationDto', () => {
    service.findAllBlock.mockReturnValue(fakeResult);
    const result = controller.findAllBlock(user, 1, 'dev', 1, { search: 'x' } as any);
    expect(service.findAllBlock).toHaveBeenCalledWith({ search: 'x' });
    expect(result).toBe(fakeResult);
  });

  it('findAllSlot delegates with paginationDto', () => {
    service.findAllSlot.mockReturnValue(fakeResult);
    const result = controller.findAllSlot(user, 1, 'dev', 1, { search: 'x' } as any);
    expect(service.findAllSlot).toHaveBeenCalledWith({ search: 'x' });
    expect(result).toBe(fakeResult);
  });

  it('findSlotNearby delegates with coordinates and pagination', () => {
    service.findSlotNearby.mockReturnValue(fakeResult);
    const result = controller.findSlotNearby(user, 1, 'dev', -3.9, -79.2, 1, {} as any);
    expect(service.findSlotNearby).toHaveBeenCalledWith(-3.9, -79.2, {});
    expect(result).toBe(fakeResult);
  });
});
