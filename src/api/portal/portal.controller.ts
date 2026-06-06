import { Controller, Get, Param } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiStandardResponse } from 'src/common/decorators/api-standard-response.decorator';

import { PortalService } from './portal.service';
// TODO: ADD THE PORTAL ENDPOINTS HERE AND VERIFY WHETHER THE USER HAS ALREADY BEEN REGISTERED OR NOT
/**
 * REST controller exposing portal entry operations.
 *
 * Base route: `portal`. Delegates all business logic to {@link PortalService}.
 */
@ApiTags('Api - Portal')
@ApiBearerAuth('keycloak')
@Controller('portal')
export class PortalController {
  /**
   *
   * @param portalService
   */
  constructor(private readonly portalService: PortalService) {}

  /**
   *
   */
  @ApiOperation({ summary: 'Placeholder: list all portal entries' })
  @ApiStandardResponse({
    description: 'Static placeholder message (not implemented)',
    data: {
      message: { type: 'string', example: 'This action returns all portal' },
    },
  })
  @Get()
  findAll() {
    return this.portalService.findAll();
  }

  /**
   *
   * @param id
   */
  @ApiOperation({ summary: 'Placeholder: get a portal entry by id' })
  @ApiStandardResponse({
    description: 'Static placeholder message (not implemented)',
    data: {
      message: { type: 'string', example: 'This action returns a #1 portal' },
    },
  })
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.portalService.findOne(+id);
  }
}
