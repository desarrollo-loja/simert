import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { CreateIncidentNotificationDto } from './dto/create-incident-notification.dto';
import { UpdateIncidentNotificationDto } from './dto/update-incident-notification.dto';
import { IncidentNotificationService } from './incident-notification.service';
/**
 * REST controller for managing incident notifications.
 *
 * Base route: `admin/incident-notification`. Delegates all business logic to {@link IncidentNotificationService}.
 */
@ApiTags('Admin - Incident Notification')
@ApiBearerAuth('keycloak')
@Controller('admin/incident-notification')
export class IncidentNotificationController {
  /**
   * Creates the controller with its delegated service.
   *
   * @param incidentNotificationService Service handling incident-notification business logic.
   */
  constructor(
    private readonly incidentNotificationService: IncidentNotificationService,
  ) {}

  /**
   * Creates a new incident notification.
   *
   * @param createIncidentNotificationDto Payload describing the incident notification to create.
   * @returns The result produced by the service for the create operation.
   */
  @ApiOperation({ summary: 'Create a new incident notification' })
  @Post()
  create(@Body() createIncidentNotificationDto: CreateIncidentNotificationDto) {
    return this.incidentNotificationService.create(
      createIncidentNotificationDto,
    );
  }

  /**
   * Lists all incident notifications.
   *
   * @returns The collection of incident notifications returned by the service.
   */
  @ApiOperation({ summary: 'List all incident notifications' })
  @Get()
  findAll() {
    return this.incidentNotificationService.findAll();
  }

  /**
   * Retrieves a single incident notification by its identifier.
   *
   * @param id Identifier of the incident notification to retrieve.
   * @returns The matching incident notification returned by the service.
   */
  @ApiOperation({ summary: 'Get a single incident notification by id' })
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.incidentNotificationService.findOne(+id);
  }

  /**
   * Updates an incident notification by its identifier.
   *
   * @param id Identifier of the incident notification to update.
   * @param updateIncidentNotificationDto Payload describing the fields to update.
   * @returns The result produced by the service for the update operation.
   */
  @ApiOperation({ summary: 'Update an incident notification by id' })
  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() updateIncidentNotificationDto: UpdateIncidentNotificationDto,
  ) {
    return this.incidentNotificationService.update(
      +id,
      updateIncidentNotificationDto,
    );
  }

  /**
   * Deletes an incident notification by its identifier.
   *
   * @param id Identifier of the incident notification to delete.
   * @returns The result produced by the service for the delete operation.
   */
  @ApiOperation({ summary: 'Delete an incident notification by id' })
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.incidentNotificationService.remove(+id);
  }
}
