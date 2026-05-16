import { CreateSupportTicketDto } from '../dto/create-support-ticket.dto';
import { SupportTicketController } from '../support-ticket.controller';
import { SupportTicketService } from '../support-ticket.service';

describe('SupportTicketController', () => {
  let controller: SupportTicketController;
  let service: { create: jest.Mock };

  beforeEach(() => {
    service = { create: jest.fn() };
    controller = new SupportTicketController(service as unknown as SupportTicketService);
  });

  it('delegates to service.create with userId and dto', () => {
    const fake = { ok: true } as any;
    service.create.mockReturnValue(fake);
    const dto = { description: 'x' } as unknown as CreateSupportTicketDto;

    const result = controller.create(dto, 7, 'device-uuid');

    expect(service.create).toHaveBeenCalledWith(7, dto);
    expect(result).toBe(fake);
  });
});
