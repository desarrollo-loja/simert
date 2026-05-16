import { ErrorCode } from 'src/common/glob/error';

jest.mock('src/common/exceptions/error.db.exception', () => ({
  __esModule: true,
  default: jest.fn((error: any) => {
    throw error;
  }),
}));
import handleDbExceptions from 'src/common/exceptions/error.db.exception';

import { IncidentNotificationService } from '../incident-notification.service';

const buildRepoMock = () => ({
  create: jest.fn((dto: any) => dto),
  save: jest.fn(async (e: any) => e),
  preload: jest.fn(),
});

describe('IncidentNotificationService', () => {
  let service: IncidentNotificationService;
  let repo: ReturnType<typeof buildRepoMock>;

  beforeEach(() => {
    repo = buildRepoMock();
    service = new IncidentNotificationService(repo as any);
    (service as any).logger = { error: jest.fn() };
    (handleDbExceptions as unknown as jest.Mock).mockClear();
  });

  describe('create', () => {
    it('returns the new entity wrapped with NONE error code', async () => {
      const dto: any = { title: 't' };

      const result = await service.create(dto);

      expect(repo.create).toHaveBeenCalledWith({ ...dto });
      expect(result).toEqual({ incidentNotification: dto, errorCode: ErrorCode.NONE });
    });

    it('routes errors through handleDbExceptions', async () => {
      repo.create.mockImplementationOnce(() => {
        throw new Error('boom');
      });

      await expect(service.create({} as any)).rejects.toThrow('boom');
      expect(handleDbExceptions).toHaveBeenCalled();
    });
  });

  describe('findAll', () => {
    it('returns stub message', () => {
      expect(service.findAll()).toBe('This action returns all incidentNotification');
    });
  });

  describe('findOne', () => {
    it('returns stub message with id', () => {
      expect(service.findOne(1)).toBe('This action returns a #1 incidentNotification');
    });
  });

  describe('update', () => {
    it('saves the preloaded entity when found', async () => {
      repo.preload.mockResolvedValueOnce({ id: 1, title: 't' });

      const result = await service.update(1, { title: 't' } as any);

      expect(repo.save).toHaveBeenCalled();
      expect(result).toEqual({ errorCode: ErrorCode.NONE, incidentNotification: { id: 1, title: 't' } });
    });

    it('returns undefined when preload yields nothing', async () => {
      repo.preload.mockResolvedValueOnce(undefined);

      const result = await service.update(1, {} as any);

      expect(result).toBeUndefined();
    });

    it('routes errors through handleDbExceptions', async () => {
      repo.preload.mockRejectedValueOnce(new Error('e'));

      await expect(service.update(1, {} as any)).rejects.toThrow('e');
    });
  });

  describe('remove', () => {
    it('returns stub message with id', () => {
      expect(service.remove(1)).toBe('This action removes a #1 incidentNotification');
    });
  });
});
