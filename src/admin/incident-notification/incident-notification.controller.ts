import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
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
  constructor(private readonly incidentNotificationService: IncidentNotificationService) { }

  @ApiOperation({ summary: 'Create a new incident notification' })
  @Post()
  create(@Body() createIncidentNotificationDto: CreateIncidentNotificationDto) {
    return this.incidentNotificationService.create(createIncidentNotificationDto);
  }

  @ApiOperation({ summary: 'List all incident notifications' })
  @Get()
  findAll() {
    return this.incidentNotificationService.findAll();
  }

  @ApiOperation({ summary: 'Get a single incident notification by id' })
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.incidentNotificationService.findOne(+id);
  }

  @ApiOperation({ summary: 'Update an incident notification by id' })
  @Patch(':id')
  update(@Param('id') id: string, @Body() updateIncidentNotificationDto: UpdateIncidentNotificationDto) {
    return this.incidentNotificationService.update(+id, updateIncidentNotificationDto);
  }

  @ApiOperation({ summary: 'Delete an incident notification by id' })
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.incidentNotificationService.remove(+id);
  }
}
