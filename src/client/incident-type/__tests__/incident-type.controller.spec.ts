import { IncidentTypeController } from '../incident-type.controller';
import { IncidentTypeService } from '../incident-type.service';

describe('IncidentTypeController (client)', () => {
  let controller: IncidentTypeController;
  let service: { getIncidentType: jest.Mock };

  beforeEach(() => {
    service = { getIncidentType: jest.fn() };
    controller = new IncidentTypeController(service as unknown as IncidentTypeService);
  });

  it('delegates to service.getIncidentType', () => {
    const fake = { ok: true } as any;
    service.getIncidentType.mockReturnValue(fake);

    const result = controller.getIncidentType(1, 'device-uuid');

    expect(service.getIncidentType).toHaveBeenCalledWith();
    expect(result).toBe(fake);
  });
});
