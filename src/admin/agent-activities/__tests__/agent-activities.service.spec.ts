import { ErrorCode } from 'src/common/glob/error';

jest.mock('src/common/exceptions/error.db.exception', () => ({
  __esModule: true,
  default: jest.fn((error: any) => {
    throw error;
  }),
}));
import handleDbExceptions from 'src/common/exceptions/error.db.exception';

import { AgentActivitiesService } from '../agent-activities.service';

const buildRepoMock = () => ({
  query: jest.fn(),
});

describe('AgentActivitiesService', () => {
  let service: AgentActivitiesService;
  let repo: ReturnType<typeof buildRepoMock>;

  beforeEach(() => {
    repo = buildRepoMock();
    service = new AgentActivitiesService(repo as any);
    (service as any).logger = { error: jest.fn() };
    (handleDbExceptions as unknown as jest.Mock).mockClear();
  });

  describe('findAll', () => {
    it('queries with default limit/offset when filter empty', async () => {
      repo.query.mockResolvedValueOnce([{ id: 1 }]);

      const result = await service.findAll({} as any);

      const [sql, params] = repo.query.mock.calls[0];
      expect(sql).toContain('FROM agent_activity AS aa');
      expect(sql).not.toContain('WHERE');
      expect(sql).toMatch(/LIMIT \$\d+ OFFSET \$\d+/);
      expect(params).toEqual([10, 0]);
      expect(result).toEqual({ errorCode: ErrorCode.NONE, agentActivities: [{ id: 1 }] });
    });

    it('appends userId and date range conditions when provided', async () => {
      repo.query.mockResolvedValueOnce([]);

      await service.findAll({
        userId: 5,
        dateFrom: '2026-01-01',
        dateTo: '2026-01-31',
        limit: 50,
        offset: 5,
      } as any);

      const [sql, params] = repo.query.mock.calls[0];
      expect(sql).toContain('aa."userId" =');
      expect(sql).toContain('BETWEEN');
      expect(params).toEqual([5, '2026-01-01', '2026-01-31', 50, 5]);
    });

    it('does not add BETWEEN when only one date is provided', async () => {
      repo.query.mockResolvedValueOnce([]);
      await service.findAll({ dateFrom: '2026-01-01' } as any);
      expect(repo.query.mock.calls[0][0]).not.toContain('BETWEEN');
    });

    it('routes errors through handleDbExceptions', async () => {
      repo.query.mockRejectedValueOnce(new Error('e'));
      await expect(service.findAll({} as any)).rejects.toThrow('e');
      expect(handleDbExceptions).toHaveBeenCalled();
    });
  });

  describe('findAllTotal', () => {
    it('returns the total row from the count query', async () => {
      repo.query.mockResolvedValueOnce([{ total: '7' }]);

      const result = await service.findAllTotal({} as any);

      expect(result).toEqual({ errorCode: ErrorCode.NONE, total: '7' });
    });

    it('includes WHERE clause when filters provided', async () => {
      repo.query.mockResolvedValueOnce([{ total: '0' }]);

      await service.findAllTotal({ userId: 1 } as any);

      expect(repo.query.mock.calls[0][0]).toContain('WHERE');
    });

    it('routes errors through handleDbExceptions', async () => {
      repo.query.mockRejectedValueOnce(new Error('e'));
      await expect(service.findAllTotal({} as any)).rejects.toThrow('e');
    });
  });
});
