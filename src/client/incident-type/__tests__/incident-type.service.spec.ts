import { ErrorCode } from 'src/common/glob/error';

jest.mock('src/common/exceptions/error.db.exception', () => ({
  __esModule: true,
  default: jest.fn((error: any) => {
    throw error;
  }),
}));
import handleDbExceptions from 'src/common/exceptions/error.db.exception';

import { IncidentTypeService } from '../incident-type.service';

describe('IncidentTypeService (client)', () => {
  let service: IncidentTypeService;
  let repo: { find: jest.Mock };
  let loggerService: any;

  beforeEach(() => {
    repo = { find: jest.fn() };
    loggerService = {};
    service = new IncidentTypeService(repo as any, loggerService);
    (service as any).logger = { error: jest.fn() };
    (handleDbExceptions as unknown as jest.Mock).mockClear();
  });

  describe('getIncidentType', () => {
    it('returns active incident types ordered by createdAt DESC', async () => {
      repo.find.mockResolvedValueOnce([{ id: 1 }]);

      const result = await service.getIncidentType();

      expect(repo.find).toHaveBeenCalledWith({
        where: { isActivated: true },
        order: { createdAt: 'DESC' },
      });
      expect(result).toEqual({ incidentTypes: [{ id: 1 }], errorCode: ErrorCode.NONE });
    });

    it('routes errors through handleDbExceptions', async () => {
      repo.find.mockRejectedValueOnce(new Error('boom'));

      await expect(service.getIncidentType()).rejects.toThrow('boom');
      expect(handleDbExceptions).toHaveBeenCalled();
    });
  });
});
