import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthWithKeycloak, GetUser } from 'src/auth/decorators';
import { JwtPayload } from 'src/auth/interfaces';
import { ApiStandardResponse } from 'src/common/decorators/api-standard-response.decorator';
import { FilterDto } from 'src/common/dto/filter.dto';
import { ErrorCode } from 'src/common/glob/error';

import { CreateZoneDto } from './dto/create-zone.dto';
import { UpdateZoneDto } from './dto/update-zone.dto';
import { Zone } from './entities/zone.entity';
import { ZoneService } from './zone.service';
/**
 * REST controller for managing parking zones (top of the Zone → Block → Slot hierarchy).
 *
 * Base route: `admin/zone`. Delegates all business logic to {@link ZoneService}.
 */
@ApiTags('Admin - Zone')
@ApiBearerAuth('keycloak')
@Controller('admin/zone')
export class ZoneController {
  /**
   * Creates the controller and injects its dependencies.
   *
   * @param zoneService Service that handles zone business logic.
   */
  constructor(private readonly zoneService: ZoneService) {}

  /**
   * Creates a new parking zone.
   *
   * @param user Authenticated user extracted from the Keycloak token.
   * @param userId Identifier of the user performing the operation.
   * @param idDevice Identifier of the device originating the request.
   * @param version Client application version.
   * @param createZoneDto Payload describing the zone to create.
   * @returns Promise resolving to the standard response with the created zone.
   */
  @ApiOperation({ summary: 'Create a new zone' })
  @ApiStandardResponse({
    description: 'Zone created or unique-name violation',
    errorCodes: [ErrorCode.NONE, ErrorCode.NAMEUNIQUE],
    data: { zone: { model: Zone } },
  })
  @AuthWithKeycloak()
  @Post(':userId/:idDevice/:version')
  createParking(
    @GetUser() user: JwtPayload,
    @Param('userId', ParseIntPipe) userId: number,
    @Param('idDevice', ParseUUIDPipe) idDevice: string,
    @Param('version', ParseIntPipe) version: number,
    @Body() createZoneDto: CreateZoneDto,
  ) {
    return this.zoneService.create(userId, createZoneDto);
  }

  /**
   * Lists all zones with their full payload and parsed geofence.
   *
   * @param user Authenticated user extracted from the Keycloak token.
   * @param userId Identifier of the user performing the operation.
   * @param idDevice Identifier of the device originating the request.
   * @param version Client application version.
   * @param filterDto Filter criteria applied to the zone list.
   * @returns Promise resolving to the standard response with the list of zones.
   */
  @ApiOperation({ summary: 'List all zones (full payload, parsed geofence)' })
  @ApiStandardResponse({
    description: 'List of zones with parsed geofence',
    errorCodes: [ErrorCode.NONE],
    data: { zones: { model: Zone, isArray: true } },
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
    return this.zoneService.findAll(filterDto);
  }

  /**
   * Lists active zones returning only their id and name.
   *
   * @param user Authenticated user extracted from the Keycloak token.
   * @param userId Identifier of the user performing the operation.
   * @param idDevice Identifier of the device originating the request.
   * @param version Client application version.
   * @param filterDto Filter criteria applied to the zone list.
   * @returns Promise resolving to the standard response with the reduced active zones list.
   */
  @ApiOperation({ summary: 'List active zones (id, name only)' })
  @ApiStandardResponse({
    description: 'Active zones reduced list',
    errorCodes: [ErrorCode.NONE],
    data: {
      zones: {
        isArray: true,
        type: 'object',
        example: [{ id: 1, name: 'Zone A' }],
      },
    },
  })
  @AuthWithKeycloak()
  @Get('find-all-active/:userId/:idDevice/:version')
  findAllByActive(
    @GetUser() user: JwtPayload,
    @Param('userId', ParseIntPipe) userId: number,
    @Param('idDevice', ParseUUIDPipe) idDevice: string,
    @Param('version', ParseIntPipe) version: number,
    @Query() filterDto: FilterDto,
  ) {
    return this.zoneService.findAllByActive(filterDto);
  }

  /**
   * Lists active zones (alias endpoint) returning only their id and name.
   *
   * @param user Authenticated user extracted from the Keycloak token.
   * @param userId Identifier of the user performing the operation.
   * @param idDevice Identifier of the device originating the request.
   * @param version Client application version.
   * @param filterDto Filter criteria applied to the zone list.
   * @returns Promise resolving to the standard response with the reduced active zones list.
   */
  @ApiOperation({ summary: 'List active zones (alias)' })
  @ApiStandardResponse({
    description: 'Active zones reduced list',
    errorCodes: [ErrorCode.NONE],
    data: {
      zones: {
        isArray: true,
        type: 'object',
        example: [{ id: 1, name: 'Zone A' }],
      },
    },
  })
  @AuthWithKeycloak()
  @Get('find-all-actives/:userId/:idDevice/:version')
  findAllByActives(
    @GetUser() user: JwtPayload,
    @Param('userId', ParseIntPipe) userId: number,
    @Param('idDevice', ParseUUIDPipe) idDevice: string,
    @Param('version', ParseIntPipe) version: number,
    @Query() filterDto: FilterDto,
  ) {
    return this.zoneService.findAllByActives(filterDto);
  }

  /**
   * Lists zones for the parking map, including id, name, geofence and color.
   *
   * @param paginationDto Filter and pagination criteria applied to the zone list.
   * @returns Promise resolving to the standard response with zones for the parking map.
   */
  @ApiOperation({
    summary: 'Zones for parking map (id, name, geofence, color)',
  })
  @ApiStandardResponse({
    description: 'Zones with parsed geofence for parking map',
    data: { zones: { model: Zone, isArray: true } },
  })
  @Get('filter/parking')
  findAllByfilterParking(@Query() paginationDto: FilterDto) {
    return this.zoneService.findAllByFilterParking(paginationDto);
  }

  /**
   * Updates an existing zone identified by its id.
   *
   * @param user Authenticated user extracted from the Keycloak token.
   * @param id Identifier of the zone to update.
   * @param userId Identifier of the user performing the operation.
   * @param idDevice Identifier of the device originating the request.
   * @param version Client application version.
   * @param updateZoneDto Payload describing the changes to apply.
   * @returns Promise resolving to the standard response with the updated zone.
   */
  @ApiOperation({ summary: 'Update a zone' })
  @ApiStandardResponse({
    description:
      'Zone updated or unique-name violation. Empty object when id is not found.',
    errorCodes: [ErrorCode.NONE, ErrorCode.NAMEUNIQUE],
    data: { zone: { model: Zone } },
  })
  @AuthWithKeycloak()
  @Patch(':id/:userId/:idDevice/:version')
  update(
    @GetUser() user: JwtPayload,
    @Param('id', ParseIntPipe) id: number,
    @Param('userId', ParseIntPipe) userId: number,
    @Param('idDevice', ParseUUIDPipe) idDevice: string,
    @Param('version', ParseIntPipe) version: number,
    @Body() updateZoneDto: UpdateZoneDto,
  ) {
    return this.zoneService.update(userId, id, updateZoneDto);
  }

  /**
   * Soft deletes a zone identified by its id.
   *
   * @param user Authenticated user extracted from the Keycloak token.
   * @param id Identifier of the zone to delete.
   * @param userId Identifier of the user performing the operation.
   * @param _idDevice Identifier of the device originating the request (unused).
   * @param _version Client application version (unused).
   * @returns Promise resolving to the standard response with the deleted zone.
   */
  @ApiOperation({ summary: 'Delete a zone by id (soft delete)' })
  @ApiStandardResponse({
    description: 'Zone deleted. Empty object when id is not found.',
    errorCodes: [ErrorCode.NONE],
    data: { zone: { model: Zone } },
  })
  @AuthWithKeycloak()
  @Delete(':id/:userId/:idDevice/:version')
  remove(
    @GetUser() user: JwtPayload,
    @Param('id', ParseIntPipe) id: number,
    @Param('userId', ParseIntPipe) userId: number,
    @Param('idDevice', ParseUUIDPipe) _idDevice: string,
    @Param('version', ParseIntPipe) _version: number,
  ) {
    return this.zoneService.remove(userId, id);
  }
}
