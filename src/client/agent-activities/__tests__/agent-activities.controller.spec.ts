import { AgentActivitiesController } from '../agent-activities.controller';
import { AgentActivitiesService } from '../agent-activities.service';
import { CreateAgentActivityDto } from '../dto/create-agent-activity.dto';
import { UpdateAgentActivityDto } from '../dto/update-agent-activity.dto';

const buildServiceMock = () => ({
  create: jest.fn(),
  update: jest.fn(),
});

describe('AgentActivitiesController', () => {
  let controller: AgentActivitiesController;
  let service: ReturnType<typeof buildServiceMock>;
  const user: any = { id: 1 };
  const fakeResult = { ok: true } as any;

  beforeEach(() => {
    service = buildServiceMock();
    controller = new AgentActivitiesController(service as unknown as AgentActivitiesService);
  });

  describe('create', () => {
    it('delegates to service.create with userId and dto', () => {
      service.create.mockReturnValue(fakeResult);
      const dto = { blockOperatorId: 5 } as CreateAgentActivityDto;

      const result = controller.create(user, 1, 'dev', 1, dto);

      expect(service.create).toHaveBeenCalledWith(1, dto);
      expect(result).toBe(fakeResult);
    });
  });

  describe('update', () => {
    it('delegates to service.update with userId, id and dto', () => {
      service.update.mockReturnValue(fakeResult);
      const dto = {} as UpdateAgentActivityDto;

      const result = controller.update(user, 7, 1, 'dev', 1, dto);

      expect(service.update).toHaveBeenCalledWith(1, 7, dto);
      expect(result).toBe(fakeResult);
    });
  });
});
