import { FilterDto } from 'src/common/dto/filter.dto';

import { AgentActivitiesController } from '../agent-activities.controller';
import { AgentActivitiesService } from '../agent-activities.service';

const buildServiceMock = () => ({
  findAll: jest.fn(),
  findAllTotal: jest.fn(),
});

describe('AgentActivitiesController', () => {
  let controller: AgentActivitiesController;
  let service: ReturnType<typeof buildServiceMock>;
  const user: any = { id: 1, roles: ['ADMIN'] };
  const filter = {} as FilterDto;
  const fakeResult = { ok: true } as any;

  beforeEach(() => {
    service = buildServiceMock();
    controller = new AgentActivitiesController(service as unknown as AgentActivitiesService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('findAll delegates to service.findAll with filter only', async () => {
    service.findAll.mockResolvedValue(fakeResult);
    const result = await controller.findAll(user, 1, 'dev', 1, filter);
    expect(service.findAll).toHaveBeenCalledWith(filter);
    expect(result).toBe(fakeResult);
  });

  it('findAllTotal delegates to service.findAllTotal', async () => {
    service.findAllTotal.mockResolvedValue(fakeResult);
    const result = await controller.findAllTotal(user, 1, 'dev', 1, filter);
    expect(service.findAllTotal).toHaveBeenCalledWith(filter);
    expect(result).toBe(fakeResult);
  });
});
