import { FilterDto } from 'src/common/dto/filter.dto';

import { LController } from '../l.controller';
import { LService } from '../l.service';

const buildServiceMock = () => ({
  findAllByUser: jest.fn(),
  findByUsers: jest.fn(),
});

describe('LController', () => {
  let controller: LController;
  let service: ReturnType<typeof buildServiceMock>;
  const filter = {} as FilterDto;
  const fakeResult = { ok: true } as any;

  beforeEach(() => {
    service = buildServiceMock();
    controller = new LController(service as unknown as LService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('findAllByUser delegates to service.findAllByUser', async () => {
    service.findAllByUser.mockResolvedValue(fakeResult);
    const result = await controller.findAllByUser(1, 'dev', 1, filter);
    expect(service.findAllByUser).toHaveBeenCalledWith(filter);
    expect(result).toBe(fakeResult);
  });

  it('findByUsers delegates to service.findByUsers', async () => {
    service.findByUsers.mockResolvedValue(fakeResult);
    const result = await controller.findByUsers(1, 'dev', 1, filter);
    expect(service.findByUsers).toHaveBeenCalledWith(filter);
    expect(result).toBe(fakeResult);
  });
});
