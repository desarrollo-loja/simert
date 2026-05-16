import { ErrorCode } from 'src/common/glob/error';

jest.mock('src/common/exceptions/error.db.exception', () => ({
  __esModule: true,
  default: jest.fn((error: any) => {
    throw error;
  }),
}));
import handleDbExceptions from 'src/common/exceptions/error.db.exception';

import { RangeSalePointService } from '../range-sale-point.service';

describe('RangeSalePointService (client)', () => {
  let service: RangeSalePointService;
  let repo: { findOne: jest.Mock };

  beforeEach(() => {
    repo = { findOne: jest.fn() };
    service = new RangeSalePointService(repo as any, {} as any);
    (service as any).logger = { error: jest.fn() };
    (handleDbExceptions as unknown as jest.Mock).mockClear();
  });

  it('returns NONE with an empty object when no row is found', async () => {
    repo.findOne.mockResolvedValueOnce(null);

    const result = await service.getRangeSalePointByUserId(1);

    expect(result).toEqual({ rangeSalePoint: {}, errorCode: ErrorCode.NONE });
  });

  it('returns NONE with the entity when found', async () => {
    repo.findOne.mockResolvedValueOnce({ id: 9, sold: 5 });

    const result = await service.getRangeSalePointByUserId(1);

    expect(result).toEqual({ rangeSalePoint: { id: 9, sold: 5 }, errorCode: ErrorCode.NONE });
  });

  it('routes errors through handleDbExceptions', async () => {
    repo.findOne.mockRejectedValueOnce(new Error('boom'));

    await expect(service.getRangeSalePointByUserId(1)).rejects.toThrow('boom');
    expect(handleDbExceptions).toHaveBeenCalled();
  });
});
