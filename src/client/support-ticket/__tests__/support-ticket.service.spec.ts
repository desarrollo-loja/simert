import { ErrorCode } from 'src/common/glob/error';
import { SupportTicketStatus } from 'src/common/glob/type/support_ticket_status';

jest.mock('src/common/exceptions/error.db.exception', () => ({
  __esModule: true,
  default: jest.fn((error: any) => {
    throw error;
  }),
}));
import handleDbExceptions from 'src/common/exceptions/error.db.exception';

import { SupportTicketService } from '../support-ticket.service';

const buildRepo = () => ({
  create: jest.fn((dto: any) => ({ ...dto })),
  save: jest.fn(async (e: any) => ({ id: 5, ...e })),
});

describe('SupportTicketService', () => {
  let service: SupportTicketService;
  let repo: ReturnType<typeof buildRepo>;

  beforeEach(() => {
    repo = buildRepo();
    service = new SupportTicketService(repo as any);
    (service as any).logger = { error: jest.fn() };
    (handleDbExceptions as unknown as jest.Mock).mockClear();
  });

  it('defaults userId and status, persists and returns the reference number', async () => {
    const result = await service.create(7, {} as any);

    expect(repo.create).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 7, status: SupportTicketStatus.PENDING }),
    );
    expect(result?.errorCode).toBe(ErrorCode.NONE);
    expect((result as any).ticketNumber).toBe('ST-000005');
    expect((result as any).message).toContain('ST-000005');
  });

  it('preserves user-supplied userId and status', async () => {
    const dto: any = { userId: 99, status: SupportTicketStatus.RESOLVED };

    const result = await service.create(7, dto);

    expect(repo.create).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 99, status: SupportTicketStatus.RESOLVED }),
    );
    expect(result?.errorCode).toBe(ErrorCode.NONE);
  });

  it('routes errors through handleDbExceptions', async () => {
    repo.save.mockRejectedValueOnce(new Error('boom'));

    await expect(service.create(7, {} as any)).rejects.toThrow('boom');
    expect(handleDbExceptions).toHaveBeenCalled();
  });
});
