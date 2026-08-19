import { RequestMethod } from '@nestjs/common';
import { addLeadingSlash } from '@nestjs/common/utils/shared.utils';
import { isRouteExcluded } from '@nestjs/core/router/utils';
import { mapToExcludeRoute } from '@nestjs/core/middleware/utils';

import { PaidObligationsDto } from '../dto/paid-obligations.dto';
import {
  EXTERNAL_SIMERT_PATH,
  ExternalSimertController,
  PAID_OBLIGATIONS_ROUTE,
} from '../external-simert.controller';
import { GimService } from '../gim.service';
import { ConceptPaidObligation } from '../interfaces/gim-responses.interfaces';

// Direct instantiation avoids pulling the Nest DI graph (guards/JwtService).
const buildServiceMock = () => ({
  findPaidObligations: jest.fn(),
});

describe('ExternalSimertController', () => {
  let controller: ExternalSimertController;
  let service: ReturnType<typeof buildServiceMock>;
  const fakeResult = { errorCode: 0 } as any;

  beforeEach(() => {
    service = buildServiceMock();
    controller = new ExternalSimertController(service as unknown as GimService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('findPaidObligations delegates the body to the service', async () => {
    service.findPaidObligations.mockResolvedValue(fakeResult);
    const dto = {
      startDate: '2026-07-01',
      endDate: '2026-07-15',
      concept: ConceptPaidObligation.FINE,
    } as PaidObligationsDto;

    const result = await controller.findPaidObligations({} as any, dto, 'u', 'd');

    expect(service.findPaidObligations).toHaveBeenCalledWith(dto);
    expect(result).toBe(fakeResult);
  });

  it('keeps the municipality path the clients call', () => {
    expect(EXTERNAL_SIMERT_PATH).toBe('api/external/simert');
    expect(PAID_OBLIGATIONS_ROUTE).toBe(
      'api/external/simert/paid-obligations/:userId/:idDevice',
    );
  });

  // The route only resolves to `/api/external/simert/...` while `main.ts`
  // excludes it from the `api/simert/` global prefix, so the exclusion is
  // asserted with the very matcher Nest applies at bootstrap. The method must
  // be POST: GIM requires the filter in the body and the exclusion is
  // registered per method, so a GET exclusion would leave the route prefixed.
  it('is excluded from the global prefix for POST, and only itself', () => {
    const excluded = mapToExcludeRoute([
      { path: PAID_OBLIGATIONS_ROUTE, method: RequestMethod.POST },
    ]);
    const declaredRoute = addLeadingSlash(
      `${EXTERNAL_SIMERT_PATH}/paid-obligations/:userId/:idDevice`,
    );

    expect(
      isRouteExcluded(excluded, declaredRoute, RequestMethod.POST),
    ).toBeTruthy();
    expect(
      isRouteExcluded(excluded, declaredRoute, RequestMethod.GET),
    ).toBeFalsy();
    expect(
      isRouteExcluded(
        excluded,
        '/api/gim/find-obligations/:userId/:idDevice',
        RequestMethod.POST,
      ),
    ).toBeFalsy();
  });
});
