import {
  Controller,
  Get,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthWithKeycloak, GetUser } from 'src/auth/decorators';
import { JwtPayload } from 'src/auth/interfaces';
import { FilterDto } from 'src/common/dto/filter.dto';

import { AgentActivitiesService } from './agent-activities.service';

/**
 * REST controller for querying field agent activity records.
 *
 * Base route: `admin/agent-activities`. Delegates all business logic to {@link AgentActivitiesService}.
 */
@ApiTags('Admin - Agent Activities')
@ApiBearerAuth('keycloak')
@Controller('admin/agent-activities')
export class AgentActivitiesController {
  /**
   *
   * @param agentActivitiesService
   */
  constructor(
    private readonly agentActivitiesService: AgentActivitiesService,
  ) {}

  /**
   * Returns a paginated list of agent activity records, optionally filtered
   * by userId and date range via {@link FilterDto}.
   *
   * @param user - Keycloak JWT payload of the authenticated caller.
   * @param userId - Route param: ID of the requesting user (audit/version handshake).
   * @param idDevice - Route param: device UUID (audit/version handshake).
   * @param version - Route param: client version (audit/version handshake).
   * @param filterDto - Optional query filters (userId, dateFrom, dateTo, limit, offset).
   * @returns Paginated agent activity rows joined with block name.
   */
  @ApiOperation({
    summary: 'List agent activity records with optional filters',
  })
  @AuthWithKeycloak()
  @Get(':userId/:idDevice/:version')
  findAll(
    @GetUser() user: JwtPayload,
    @Param('userId', ParseIntPipe) userId: number,
    @Param('idDevice', ParseUUIDPipe) idDevice: string,
    @Param('version', ParseIntPipe) version: number,
    @Query() filterDto: FilterDto,
  ) {
    return this.agentActivitiesService.findAll(filterDto);
  }

  /**
   * Returns the total count of agent activity records matching the given filters.
   *
   * @param user - Keycloak JWT payload of the authenticated caller.
   * @param userId - Route param: ID of the requesting user (audit/version handshake).
   * @param idDevice - Route param: device UUID (audit/version handshake).
   * @param version - Route param: client version (audit/version handshake).
   * @param filterDto - Optional query filters (userId, dateFrom, dateTo).
   * @returns Object containing the total count.
   */
  @ApiOperation({
    summary: 'Count total agent activity records matching filters',
  })
  @AuthWithKeycloak()
  @Get('total/:userId/:idDevice/:version')
  findAllTotal(
    @GetUser() user: JwtPayload,
    @Param('userId', ParseIntPipe) userId: number,
    @Param('idDevice', ParseUUIDPipe) idDevice: string,
    @Param('version', ParseIntPipe) version: number,
    @Query() filterDto: FilterDto,
  ) {
    return this.agentActivitiesService.findAllTotal(filterDto);
  }
}
