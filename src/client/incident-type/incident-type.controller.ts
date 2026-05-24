import { Controller, Get, Param, ParseIntPipe, ParseUUIDPipe } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { IncidentType } from 'src/admin/incident-type/entities/incident-type.entity';
import { ApiStandardResponse } from 'src/common/decorators/api-standard-response.decorator';
import { ErrorCode } from 'src/common/glob/error';

// import { Auth, GetUser } from 'src/auth/decorators';
// import { JwtPayload } from 'src/auth/interfaces';
import { IncidentTypeService } from './incident-type.service';

/**
 * REST controller exposing the catalog of incident types to the client app.
 *
 * Base route: `client/incident-type`. Delegates all business logic to {@link IncidentTypeService}.
 */
@ApiTags('Client - Incident Type')

@ApiBearerAuth('keycloak')

@Controller('client/incident-type')
export class IncidentTypeController {
  constructor(private readonly incidentTypeService: IncidentTypeService) { }

  // @Auth()
  @ApiOperation({ summary: 'Get all activated incident types' })
  @ApiStandardResponse({
    description: 'Active incident types ordered by creation date',
    errorCodes: [ErrorCode.NONE],
    data: {
      incidentTypes: { model: IncidentType, isArray: true },
    },
  })
  @Get('get-incident-type/:userId/:idDevice')
  getIncidentType(
    // @GetUser() user: JwtPayload,
    @Param('userId', ParseIntPipe) userId: number,
    @Param('idDevice', ParseUUIDPipe) idDevice: string) {
    return this.incidentTypeService.getIncidentType();
  }

}
