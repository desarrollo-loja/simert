import { Body, Controller, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Auth, GetUser } from 'src/auth/decorators';
import { JwtPayload } from 'src/auth/interfaces';

import { PaidObligationsDto } from './dto/paid-obligations.dto';
import { GimService } from './gim.service';

/**
 * Base route of the SIMERT resources that keep the municipality's own external
 * path (`/api/external/simert/...`, memorando ML-DT-2026-0819-M) instead of the
 * service prefix, so clients consume them under the same URL GIM publishes.
 *
 * Reaching these routes requires the deployment to proxy `/api/external/` to
 * this service. That prefix is not proxied by default: nginx serves it as static
 * SPA files, answering POST with its own 405 and GET with `index.html`, so the
 * resource looks broken even though the route exists here.
 */
export const EXTERNAL_SIMERT_PATH = 'api/external/simert';

/**
 * Full route of the paid-obligations resource. Shared with `main.ts`, which
 * excludes it from the global prefix, so both cannot drift apart.
 */
export const PAID_OBLIGATIONS_ROUTE = `${EXTERNAL_SIMERT_PATH}/paid-obligations`;

/**
 * REST controller exposing the SIMERT resources published under the
 * municipality's external path. Delegates all business logic to
 * {@link GimService}.
 *
 * Base route: `api/external/simert` (excluded from the `api/simert/` global
 * prefix in `main.ts`).
 */
@ApiTags('Api - External Simert')
@ApiBearerAuth('keycloak')
@Controller(EXTERNAL_SIMERT_PATH)
export class ExternalSimertController {
    /**
     * Creates the controller and injects the GIM service.
     *
     * @param gimService Service handling all GIM integration business logic.
     */
    constructor(private readonly gimService: GimService) {}

    /**
     * Lists the GIM credit titles already paid for a SIMERT concept within a
     * date range, used by the Recaudación report to reconcile SIMERT's own
     * collection against the municipality's.
     *
     * POST with the filter in the body, the same verb, URL and payload GIM
     * requires for this resource, so both hops of the proxy match.
     *
     * Unlike the other GIM routes it takes no `userId`/`idDevice` path params:
     * this resource never used them — the caller's identity comes from the JWT.
     *
     * @param _user Authenticated user payload extracted from the JWT.
     * @param paidObligationsDto Date range, SIMERT concept and 0-based pagination.
     * @returns The paid credit titles page for the requested filter.
     */
    @ApiOperation({
        summary:
            'List GIM paid credit titles (obligations) for a SIMERT concept in a date range',
    })
    @Auth()
    @Post('paid-obligations')
    findPaidObligations(
        @GetUser() _user: JwtPayload,
        @Body() paidObligationsDto: PaidObligationsDto,
    ) {
        return this.gimService.findPaidObligations(paidObligationsDto);
    }
}
