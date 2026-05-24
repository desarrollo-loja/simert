import { Controller, Get, Param } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthWithKeycloak } from 'src/auth/decorators';

import { RangeSalePointService } from './range-sale-point.service';
/**
 * REST controller exposing the user's range sale point assignment to the client app.
 *
 * Base route: `client/range-sale-point`. Delegates all business logic to {@link RangeSalePointService}.
 */
@ApiTags('Client - Range Sale Point')
@ApiBearerAuth('keycloak')
@Controller('client/range-sale-point')
export class RangeSalePointController {
  constructor(private readonly rangeSalePointService: RangeSalePointService) { }

  @ApiOperation({ summary: 'Get the range sale point assignment for the authenticated user' })
  // @Auth()
  @AuthWithKeycloak()
  @Get('get-range-sale-point-by-userid/:userId/:idDevice')
  getRangeSalePointByUserId(
    // @GetUser() user: JwtPayload,
    @Param('userId') userId: string,
    @Param('idDevice') idDevice: string,
  ) {
    return this.rangeSalePointService.getRangeSalePointByUserId(+userId);
  }

}
