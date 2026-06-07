import {
  Body,
  Controller,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthWithKeycloak, GetUser } from 'src/auth/decorators';
import { JwtPayload } from 'src/auth/interfaces';

import { AgentActivitiesService } from './agent-activities.service';
import { CreateAgentActivityDto } from './dto/create-agent-activity.dto';
import { UpdateAgentActivityDto } from './dto/update-agent-activity.dto';
/**
 * REST controller for managing agent activity records from the client app.
 *
 * Base route: `client/agent-activities`. Delegates all business logic to {@link AgentActivitiesService}.
 */
@ApiTags('Client - Agent Activities')
@ApiBearerAuth('keycloak')
@Controller('client/agent-activities')
export class AgentActivitiesController {
  /**
   * Creates the controller and injects the agent activities service.
   *
   * @param agentActivitiesService Service that handles agent activity business logic.
   */
  constructor(
    private readonly agentActivitiesService: AgentActivitiesService,
  ) {}

  /**
   * Creates a new agent activity record for the given user.
   *
   * @param user Authenticated user extracted from the Keycloak token.
   * @param userId Identifier of the user the activity belongs to.
   * @param idDevice Unique device identifier sent by the client.
   * @param version Client application version.
   * @param createAgentActivityDto Payload describing the agent activity to create.
   * @returns Promise resolving to the created agent activity record.
   */
  @ApiOperation({ summary: 'Create a new agent activity record for a user' })
  @AuthWithKeycloak()
  @Post(':userId/:idDevice/:version')
  create(
    @GetUser() user: JwtPayload,
    @Param('userId', ParseIntPipe) userId: number,
    @Param('idDevice', ParseUUIDPipe) idDevice: string,
    @Param('version', ParseIntPipe) version: number,
    @Body() createAgentActivityDto: CreateAgentActivityDto,
  ) {
    return this.agentActivitiesService.create(userId, createAgentActivityDto);
  }

  /**
   * Updates an existing agent activity record by its identifier.
   *
   * @param user Authenticated user extracted from the Keycloak token.
   * @param id Identifier of the agent activity record to update.
   * @param userId Identifier of the user the activity belongs to.
   * @param idDevice Unique device identifier sent by the client.
   * @param version Client application version.
   * @param updateAgentActivityDto Payload describing the fields to update.
   * @returns Promise resolving to the updated agent activity record.
   */
  @ApiOperation({ summary: 'Update an agent activity record by id' })
  @AuthWithKeycloak()
  @Patch(':id/:userId/:idDevice/:version')
  update(
    @GetUser() user: JwtPayload,
    @Param('id', ParseIntPipe) id: number,
    @Param('userId', ParseIntPipe) userId: number,
    @Param('idDevice', ParseUUIDPipe) idDevice: string,
    @Param('version', ParseIntPipe) version: number,
    @Body() updateAgentActivityDto: UpdateAgentActivityDto,
  ) {
    return this.agentActivitiesService.update(
      userId,
      id,
      updateAgentActivityDto,
    );
  }
}
