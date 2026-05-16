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
  save: jest.fn(async (e: any) => ({ id: 1, ...e })),
  preload: jest.fn(),
  findOne: jest.fn(),
  query: jest.fn(),
});

describe('SupportTicketService', () => {
  let service: SupportTicketService;
  let repo: ReturnType<typeof buildRepo>;

  beforeEach(() => {
    repo = buildRepo();
    service = new SupportTicketService(repo as any);
    (service as any).logger = { error: jest.fn(), log: jest.fn() };
    (handleDbExceptions as unknown as jest.Mock).mockClear();
  });

  describe('create', () => {
    it('defaults status to PENDING and builds ticket number', async () => {
      const result: any = await service.create({} as any);
      expect(repo.save).toHaveBeenCalled();
      expect(result.errorCode).toBe(ErrorCode.NONE);
      expect(result.ticketNumber).toBe('ST-000001');
      expect(result.supportTicket.status).toBe(SupportTicketStatus.PENDING);
    });

    it('preserves a provided status', async () => {
      const result: any = await service.create({ status: SupportTicketStatus.RESOLVED } as any);
      expect(result.supportTicket.status).toBe(SupportTicketStatus.RESOLVED);
    });

    it('routes errors through handleDbExceptions', async () => {
      repo.save.mockRejectedValueOnce(new Error('e'));
      await expect(service.create({} as any)).rejects.toThrow('e');
    });
  });

  describe('findAll', () => {
    it('builds a query without WHERE/LIMIT/OFFSET when filter is empty', async () => {
      repo.query.mockResolvedValueOnce([]);
      const result = await service.findAll({} as any);
      expect(result).toEqual({ supportTickets: [], errorCode: ErrorCode.NONE });
      const [sql, params] = repo.query.mock.calls[0];
      expect(sql).not.toContain('WHERE');
      expect(sql).not.toContain('LIMIT');
      expect(sql).not.toContain('OFFSET');
      expect(params).toEqual([]);
    });

    it('builds a WHERE clause for every supported filter', async () => {
      repo.query.mockResolvedValueOnce([]);
      await service.findAll({
        userId: 1,
        requestType: 'A',
        status: SupportTicketStatus.PENDING,
        emailClient: 'a@b',
        typeTicket: 't',
        search: 'q',
        dateFrom: '2026-01-01',
        dateTo: '2026-01-31',
      } as any);
      const [sql, params] = repo.query.mock.calls[0];
      expect(sql).toContain('WHERE');
      expect(sql).toContain('st."userId"');
      expect(sql).toContain('st."requestType"');
      expect(sql).toContain('st."status"');
      expect(sql).toContain('st."emailClient"');
      expect(sql).toContain('st."typeTicket"');
      expect(sql).toContain('st."message"');
      expect(sql).toContain('BETWEEN');
      expect(params).toEqual(
        expect.arrayContaining([1, 'A', SupportTicketStatus.PENDING, '%a@b%', 't', '%q%', '2026-01-01', '2026-01-31']),
      );
    });

    it('ignores literal "undefined" / "null" / whitespace search', async () => {
      repo.query.mockResolvedValueOnce([]);
      await service.findAll({ search: 'undefined' } as any);
      expect(repo.query.mock.calls[0][1]).toEqual([]);

      repo.query.mockResolvedValueOnce([]);
      await service.findAll({ search: 'null' } as any);
      expect(repo.query.mock.calls[1][1]).toEqual([]);

      repo.query.mockResolvedValueOnce([]);
      await service.findAll({ search: '   ' } as any);
      expect(repo.query.mock.calls[2][1]).toEqual([]);
    });

    it('applies parameterized LIMIT and OFFSET when provided', async () => {
      repo.query.mockResolvedValueOnce([]);
      await service.findAll({ limit: 5, offset: 10 } as any);
      const [sql, params] = repo.query.mock.calls[0];
      expect(sql).toMatch(/LIMIT \$\d+/);
      expect(sql).toMatch(/OFFSET \$\d+/);
      expect(params).toEqual([5, 10]);
    });

    it('skips LIMIT/OFFSET when values are non-positive or non-numeric (defense-in-depth)', async () => {
      repo.query.mockResolvedValueOnce([]);
      await service.findAll({ limit: -1, offset: -1 } as any);
      let [sql] = repo.query.mock.calls[0];
      expect(sql).not.toMatch(/LIMIT/);
      expect(sql).not.toMatch(/OFFSET/);

      repo.query.mockResolvedValueOnce([]);
      await service.findAll({ limit: 'abc' as any, offset: 'xyz' as any } as any);
      [sql] = repo.query.mock.calls[1];
      expect(sql).not.toMatch(/LIMIT/);
      expect(sql).not.toMatch(/OFFSET/);
    });

    it('routes errors through handleDbExceptions', async () => {
      repo.query.mockRejectedValueOnce(new Error('e'));
      await expect(service.findAll({} as any)).rejects.toThrow('e');
    });
  });

  describe('findAllTotal', () => {
    it('returns the count as a number', async () => {
      repo.query.mockResolvedValueOnce([{ total: '42' }]);
      const result = await service.findAllTotal({} as any);
      expect(result).toEqual({ total: 42, errorCode: ErrorCode.NONE });
    });

    it('returns 0 when no rows', async () => {
      repo.query.mockResolvedValueOnce([{}]);
      const result = await service.findAllTotal({} as any);
      expect(result).toEqual({ total: 0, errorCode: ErrorCode.NONE });
    });

    it('returns 0 when result is empty', async () => {
      repo.query.mockResolvedValueOnce([]);
      const result = await service.findAllTotal({} as any);
      expect(result).toEqual({ total: 0, errorCode: ErrorCode.NONE });
    });

    it('appends WHERE when filters provided', async () => {
      repo.query.mockResolvedValueOnce([{ total: '1' }]);
      await service.findAllTotal({ userId: 1 } as any);
      expect(repo.query.mock.calls[0][0]).toContain('WHERE');
    });

    it('routes errors through handleDbExceptions', async () => {
      repo.query.mockRejectedValueOnce(new Error('e'));
      await expect(service.findAllTotal({} as any)).rejects.toThrow('e');
    });
  });

  describe('findOne', () => {
    it('returns the ticket when found', async () => {
      repo.findOne.mockResolvedValueOnce({ id: 1 });
      const result = await service.findOne(1);
      expect(result).toEqual({ supportTicket: { id: 1 }, errorCode: ErrorCode.NONE });
    });

    it('returns NOT_FOUND when not found', async () => {
      repo.findOne.mockResolvedValueOnce(null);
      const result = await service.findOne(1);
      expect(result).toEqual({ errorCode: ErrorCode.NOT_FOUND, supportTicket: null });
    });

    it('routes errors through handleDbExceptions', async () => {
      repo.findOne.mockRejectedValueOnce(new Error('e'));
      await expect(service.findOne(1)).rejects.toThrow('e');
    });
  });

  describe('update', () => {
    it('saves and returns the updated ticket', async () => {
      repo.preload.mockResolvedValueOnce({ id: 1 });
      const result = await service.update(1, {} as any);
      expect(repo.save).toHaveBeenCalled();
      expect(result).toEqual({ supportTicket: { id: 1 }, errorCode: ErrorCode.NONE });
    });

    it('returns NOT_FOUND when preload yields nothing', async () => {
      repo.preload.mockResolvedValueOnce(undefined);
      const result = await service.update(1, {} as any);
      expect(result).toEqual({ errorCode: ErrorCode.NOT_FOUND, supportTicket: null });
    });

    it('routes errors through handleDbExceptions', async () => {
      repo.preload.mockRejectedValueOnce(new Error('e'));
      await expect(service.update(1, {} as any)).rejects.toThrow('e');
    });
  });

  describe('remove', () => {
    it('soft-deletes by switching status to REJECTED', async () => {
      repo.findOne.mockResolvedValueOnce({ id: 1, status: SupportTicketStatus.PENDING });
      const result: any = await service.remove(1);
      expect(repo.save).toHaveBeenCalledWith(
        expect.objectContaining({ status: SupportTicketStatus.REJECTED }),
      );
      expect(result.errorCode).toBe(ErrorCode.NONE);
    });

    it('returns NOT_FOUND when ticket does not exist', async () => {
      repo.findOne.mockResolvedValueOnce(null);
      const result = await service.remove(1);
      expect(result).toEqual({ errorCode: ErrorCode.NOT_FOUND, supportTicket: null });
    });

    it('routes errors through handleDbExceptions', async () => {
      repo.findOne.mockRejectedValueOnce(new Error('e'));
      await expect(service.remove(1)).rejects.toThrow('e');
    });
  });
});
