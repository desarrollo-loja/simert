import { Body, Controller, Delete, Get, Param, ParseIntPipe, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthWithKeycloak, GetUser } from 'src/auth/decorators';
import { JwtPayload } from 'src/auth/interfaces';

import { CreateIncidentTypeDto } from './dto/create-incident-type.dto';
import { IncidentTypeFilterDto } from './dto/incident-type-filterdto.dto';
import { UpdateIncidentTypeDto } from './dto/update-incident-type.dto';
import { IncidentTypeService } from './incident-type.service';
/**
 * REST controller for managing incident types.
 *
 * Base route: `admin/incident-type`. Delegates all business logic to {@link IncidentTypeService}.
 */
@ApiTags('Admin - Incident Type')
@ApiBearerAuth('keycloak')
@Controller('admin/incident-type')
export class IncidentTypeController {
  constructor(private readonly incidentTypeService: IncidentTypeService) { }

  @ApiOperation({ summary: 'Create a new incident type' })
  // @Auth()
  @Post('create/:userId/:idDevice')
  create(
    // @GetUser() user: JwtPayload,
    @Param('userId', ParseIntPipe) userId: number,
    @Param('idDevice', ParseUUIDPipe) idDevice: string,
    @Body() createIncidentTypeDto: CreateIncidentTypeDto) {
    return this.incidentTypeService.create(userId, createIncidentTypeDto);
  }

  @ApiOperation({ summary: 'List incident types with filters' })
  // @Auth()
  @Patch('find-all/:userId/:idDevice')
  findAll(
    // @GetUser() user: JwtPayload,
    @Param('userId', ParseIntPipe) userId: number,
    @Param('idDevice', ParseUUIDPipe) idDevice: string,
    @Body() filterDto: IncidentTypeFilterDto) {
    return this.incidentTypeService.findAll(filterDto);
  }

  @ApiOperation({ summary: 'Get a single incident type by id' })
  @Get('get-type-incident-by-id/:userId/:idDevice/:id')
  getTypeIncidentById(
    @Param('userId', ParseIntPipe) userId: number,
    @Param('idDevice', ParseUUIDPipe) idDevice: string,
    @Param('id', ParseIntPipe) id: number
  ) {
    return this.incidentTypeService.getTypeIncidentById(id);
  }

  @ApiOperation({ summary: 'Update an incident type by id' })
  // @Auth()
  @Patch('update/:userId/:idDevice/:id')
  update(
    // @GetUser() user: JwtPayload,
    @Param('userId', ParseIntPipe) userId: number,
    @Param('idDevice', ParseUUIDPipe) idDevice: string,
    @Param('id') id: string,
    @Body() updateIncidentTypeDto: UpdateIncidentTypeDto) {
    return this.incidentTypeService.update(userId, +id, updateIncidentTypeDto);
  }

  @ApiOperation({ summary: 'Delete an incident type by id' })
  // @Auth()
  @AuthWithKeycloak()
  @Delete('remove/:userId/:idDevice/:id')
  remove(
    @GetUser() user: JwtPayload,
    @Param('userId', ParseIntPipe) userId: number,
    @Param('idDevice', ParseUUIDPipe) idDevice: string,
    @Param('id') id: string) {
    return this.incidentTypeService.remove(+id);
  }
}
