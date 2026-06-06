import { BadRequestException } from '@nestjs/common';

import { ErrorCode } from 'src/common/glob/error';
import { TypeOperation } from 'src/common/glob/type/type_operation';

// Spy on handleDbExceptions so we can assert error routing.
jest.mock('src/common/exceptions/error.db.exception', () => ({
  __esModule: true,
  default: jest.fn((error: any) => {
    throw error;
  }),
}));
import handleDbExceptions from 'src/common/exceptions/error.db.exception';

import { IncidentTypeService } from '../incident-type.service';

const buildRepoMock = () => ({
  findOne: jest.fn(),
  create: jest.fn((dto: any) => dto),
  save: jest.fn(async (e: any) => e),
  preload: jest.fn(),
  query: jest.fn(),
});

const buildLoggerServiceMock = () => ({
  saveIncidentTypeLoggerModel: jest.fn(),
});

describe('IncidentTypeService', () => {
  let service: IncidentTypeService;
  let repo: ReturnType<typeof buildRepoMock>;
  let loggerService: ReturnType<typeof buildLoggerServiceMock>;

  beforeEach(() => {
    repo = buildRepoMock();
    loggerService = buildLoggerServiceMock();
    service = new IncidentTypeService(repo as any, loggerService as any);
    (service as any).logger = { error: jest.fn(), log: jest.fn(), warn: jest.fn() };

    (handleDbExceptions as unknown as jest.Mock).mockClear();
  });

  describe('create', () => {
    it('rejects when code already exists', async () => {
      repo.findOne.mockResolvedValueOnce({ id: 1 });

      const result = await service.create(1, { code: 'C', name: 'N' } as any);

      expect(result).toEqual({
        errorCode: ErrorCode.NAMEUNIQUE,
        message: 'El código ya existe',
      });
      expect(repo.save).not.toHaveBeenCalled();
    });

    it('rejects when name already exists', async () => {
      repo.findOne
        .mockResolvedValueOnce(null) // code check ok
        .mockResolvedValueOnce({ id: 2 }); // name exists

      await expect(
        service.create(1, { code: 'C', name: 'N' } as any),
      ).rejects.toThrow(BadRequestException);
      expect(repo.save).not.toHaveBeenCalled();
    });

    it('creates and logs when both checks pass', async () => {
      repo.findOne.mockResolvedValue(null);
      repo.save.mockResolvedValueOnce({ id: 10, code: 'C', name: 'N' });

      const result = await service.create(1, { code: 'C', name: 'N' } as any);

      expect(repo.save).toHaveBeenCalled();
      expect(loggerService.saveIncidentTypeLoggerModel).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 10,
          userId: 1,
          typeOperation: TypeOperation.CREATE,
        }),
      );
      expect(result).toEqual({
        incidentType: { id: 10, code: 'C', name: 'N' },
        errorCode: ErrorCode.NONE,
      });
    });

    it('routes save errors through handleDbExceptions', async () => {
      repo.findOne.mockResolvedValue(null);
      repo.save.mockRejectedValueOnce(new Error('boom'));

      await expect(service.create(1, {} as any)).rejects.toThrow('boom');
      expect(handleDbExceptions).toHaveBeenCalled();
    });
  });

  describe('findAll', () => {
    it('queries with no conditions when filter is empty', async () => {
      repo.query.mockResolvedValueOnce([{ id: 1 }]);

      const result = await service.findAll({} as any);

      expect(result).toEqual({ incidentTypes: [{ id: 1 }], errorCode: ErrorCode.NONE });
      const [sql, params] = repo.query.mock.calls[0];
      expect(sql).toContain('FROM public."incidentType" it');
      expect(sql).not.toContain('WHERE');
      expect(params).toEqual([]);
    });

    it('builds ILIKE clause when search provided', async () => {
      repo.query.mockResolvedValueOnce([]);

      await service.findAll({ search: 'abc' } as any);

      const [sql, params] = repo.query.mock.calls[0];
      expect(sql).toContain('ILIKE');
      expect(params).toContain('%abc%');
    });

    it('ignores literal "undefined"/"null"/whitespace search strings', async () => {
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

    it('adds BETWEEN clause when both dateFrom/dateTo provided', async () => {
      repo.query.mockResolvedValueOnce([]);

      await service.findAll({ dateFrom: '2026-01-01', dateTo: '2026-01-31' } as any);

      const [sql, params] = repo.query.mock.calls[0];
      expect(sql).toContain('BETWEEN');
      expect(params).toEqual(['2026-01-01', '2026-01-31']);
    });

    it('does not add BETWEEN when only one date is provided', async () => {
      repo.query.mockResolvedValueOnce([]);
      await service.findAll({ dateFrom: '2026-01-01' } as any);
      expect(repo.query.mock.calls[0][0]).not.toContain('BETWEEN');
    });

    it('routes errors through handleDbExceptions', async () => {
      repo.query.mockRejectedValueOnce(new Error('db'));

      await expect(service.findAll({} as any)).rejects.toThrow('db');
      expect(handleDbExceptions).toHaveBeenCalled();
    });
  });

  describe('update', () => {
    it('rejects when another record has the same name', async () => {
      repo.findOne.mockResolvedValueOnce({ id: 99 });

      await expect(
        service.update(1, 1, { name: 'N' } as any),
      ).rejects.toThrow(BadRequestException);
      expect(repo.save).not.toHaveBeenCalled();
    });

    it('returns NAMEUNIQUE when another record has the same code', async () => {
      repo.findOne
        .mockResolvedValueOnce(null) // name check passes
        .mockResolvedValueOnce({ id: 99 }); // code conflict

      const result = await service.update(1, 1, { code: 'C' } as any);

      expect(result).toEqual({
        errorCode: ErrorCode.NAMEUNIQUE,
        message: 'El código ya existe',
      });
      expect(repo.save).not.toHaveBeenCalled();
    });

    it('saves and logs when preload returns an entity', async () => {
      repo.findOne.mockResolvedValue(null);
      repo.preload.mockResolvedValueOnce({ id: 1, name: 'X' });

      const result = await service.update(1, 1, { name: 'X' } as any);

      expect(repo.save).toHaveBeenCalled();
      expect(loggerService.saveIncidentTypeLoggerModel).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 1,
          userId: 1,
          typeOperation: TypeOperation.UPDATE,
        }),
      );
      expect(result).toEqual({
        errorCode: ErrorCode.NONE,
        incidentType: { id: 1, name: 'X' },
      });
    });

    it('returns NOT_FOUND when preload yields nothing', async () => {
      repo.findOne.mockResolvedValue(null);
      repo.preload.mockResolvedValueOnce(undefined);

      const result = await service.update(1, 1, {} as any);

      expect(result?.errorCode).toBe(ErrorCode.NOT_FOUND);
    });

    it('routes unexpected errors through handleDbExceptions', async () => {
      repo.findOne.mockRejectedValueOnce(new Error('e'));

      await expect(service.update(1, 1, {} as any)).rejects.toThrow('e');
    });
  });

  describe('getTypeIncidentById', () => {
    it('returns the entity wrapped with NONE when found', async () => {
      repo.findOne.mockResolvedValueOnce({ id: 1 });

      const result = await service.getTypeIncidentById(1);

      expect(result).toEqual({ incidentType: { id: 1 }, errorCode: ErrorCode.NONE });
    });

    it('returns NOT_FOUND when no entity matches', async () => {
      repo.findOne.mockResolvedValueOnce(null);

      const result = await service.getTypeIncidentById(1);

      expect(result?.errorCode).toBe(ErrorCode.NOT_FOUND);
    });

    it('returns NOT_FOUND when repository throws', async () => {
      repo.findOne.mockRejectedValueOnce(new Error('e'));

      const result = await service.getTypeIncidentById(1);

      expect(result?.errorCode).toBe(ErrorCode.NOT_FOUND);
    });
  });

  describe('remove', () => {
    it('soft-deletes when entity exists', async () => {
      repo.findOne.mockResolvedValueOnce({ id: 1, isActivated: true });

      const result = await service.remove(1);

      expect(repo.save).toHaveBeenCalledWith(
        expect.objectContaining({ isActivated: false }),
      );
      expect(result).toEqual({ incidentType: { id: 1, isActivated: false } });
    });

    it('returns undefined when entity does not exist', async () => {
      repo.findOne.mockResolvedValueOnce(null);
      const result = await service.remove(1);
      expect(result).toBeUndefined();
    });

    it('routes errors through handleDbExceptions', async () => {
      repo.findOne.mockRejectedValueOnce(new Error('e'));
      await expect(service.remove(1)).rejects.toThrow('e');
    });
  });
});
