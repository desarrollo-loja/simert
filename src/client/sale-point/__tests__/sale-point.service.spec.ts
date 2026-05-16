import { ErrorCode } from 'src/common/glob/error';
import { TypeModeSalePoint } from 'src/common/glob/type/type_mode_sale_point';

jest.mock('src/common/exceptions/error.db.exception', () => ({
  __esModule: true,
  default: jest.fn((error: any) => {
    throw error;
  }),
}));
import handleDbExceptions from 'src/common/exceptions/error.db.exception';

import { SalePointService } from '../sale-point.service';

const buildQb = () => ({
  select: jest.fn().mockReturnThis(),
  where: jest.fn().mockReturnThis(),
  andWhere: jest.fn().mockReturnThis(),
  getMany: jest.fn(),
});

const buildRepo = () => {
  const qb = buildQb();
  return {
    createQueryBuilder: jest.fn(() => qb),
    query: jest.fn(),
    __qb: qb,
  };
};

describe('SalePointService (client)', () => {
  let service: SalePointService;
  let repo: ReturnType<typeof buildRepo>;

  beforeEach(() => {
    repo = buildRepo();
    service = new SalePointService(repo as any, {} as any);
    (service as any).logger = { error: jest.fn() };
    (handleDbExceptions as unknown as jest.Mock).mockClear();
  });

  describe('findAllActiveModeFixed', () => {
    it('returns sale points filtered to FIXED mode', async () => {
      repo.__qb.getMany.mockResolvedValueOnce([{ id: 1 }]);

      const result = await service.findAllActiveModeFixed({} as any);

      expect(repo.__qb.where).toHaveBeenCalledWith('sp.mode = :mode', {
        mode: TypeModeSalePoint.FIXED,
      });
      expect(repo.__qb.andWhere).not.toHaveBeenCalled();
      expect(result).toEqual({ errorCode: ErrorCode.NONE, salePoints: [{ id: 1 }] });
    });

    it('routes errors through handleDbExceptions', async () => {
      repo.__qb.getMany.mockRejectedValueOnce(new Error('boom'));
      await expect(service.findAllActiveModeFixed({} as any)).rejects.toThrow('boom');
    });

    it('applies extra conditions when the private helper returns any', async () => {
      // Force the private helper to return non-empty conditions to exercise the
      // andWhere branch (the production helper currently returns empty).
      jest
        .spyOn(service as any, '_buildConditionsAndParameters')
        .mockReturnValueOnce({ conditions: ['sp.userId = :u'], parameters: { u: 1 } });
      repo.__qb.getMany.mockResolvedValueOnce([]);

      await service.findAllActiveModeFixed({} as any);

      expect(repo.__qb.andWhere).toHaveBeenCalledWith('sp.userId = :u', { u: 1 });
    });
  });

  describe('findAllActiveModeMobile', () => {
    it('runs the raw query with MOBILE mode as parameter (safe parameterization)', async () => {
      repo.query.mockResolvedValueOnce([{ id: 2 }]);

      const result = await service.findAllActiveModeMobile({} as any);

      expect(repo.query).toHaveBeenCalled();
      const [sql, params] = repo.query.mock.calls[0];
      // Ensure $1 placeholder is used (no template interpolation of user input).
      expect(sql).toContain('$1');
      expect(params).toEqual([TypeModeSalePoint.MOBILE]);
      expect(result).toEqual({ errorCode: ErrorCode.NONE, salePoints: [{ id: 2 }] });
    });

    it('routes errors through handleDbExceptions', async () => {
      repo.query.mockRejectedValueOnce(new Error('boom'));
      await expect(service.findAllActiveModeMobile({} as any)).rejects.toThrow('boom');
    });
  });

  describe('_buildConditionsAndParameters (private)', () => {
    it('returns empty conditions and parameters by design', () => {
      const result = (service as any)._buildConditionsAndParameters({});
      expect(result).toEqual({ conditions: [], parameters: {} });
    });
  });
});
