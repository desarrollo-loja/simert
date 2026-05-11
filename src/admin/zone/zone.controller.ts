import { Body, Controller, Get, Param, ParseIntPipe, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { GetUser } from 'src/auth/decorators';
import { JwtPayload } from 'src/auth/interfaces';
import { ApiStandardResponse } from 'src/common/decorators/api-standard-response.decorator';
import { FilterDto } from 'src/common/dto/filter.dto';
import { ErrorCode } from 'src/common/glob/error';

import { CreateZoneDto } from './dto/create-zone.dto';
import { UpdateZoneDto } from './dto/update-zone.dto';
import { Zone } from './entities/zone.entity';
import { ZoneService } from './zone.service';
@ApiTags('Admin - Zone')
@ApiBearerAuth('keycloak')
@Controller('admin/zone')
export class ZoneController {

  constructor(private readonly zoneService: ZoneService) { }

  @ApiOperation({ summary: 'Create a new zone' })
  @ApiStandardResponse({
    description: 'Zone created or unique-name violation',
    errorCodes: [ErrorCode.NONE, ErrorCode.NAMEUNIQUE],
    data: { zone: { model: Zone } },
  })

  // @AuthWithKeycloak()
  @Post(':userId/:idDevice/:version')
  createParking(
    @GetUser() user: JwtPayload,
    @Param('userId', ParseIntPipe) userId: number,
    @Param('idDevice', ParseUUIDPipe) idDevice: string,
    @Param('version', ParseIntPipe) version: number,
    @Body() createZoneDto: CreateZoneDto
  ) {
    return this.zoneService.create(userId, createZoneDto);
  }

  @ApiOperation({ summary: 'List all zones (full payload, parsed geofence)' })
  @ApiStandardResponse({
    description: 'List of zones with parsed geofence',
    errorCodes: [ErrorCode.NONE],
    data: { zones: { model: Zone, isArray: true } },
  })

  // @AuthWithKeycloak()
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

  // @AuthWithKeycloak()
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

  // @AuthWithKeycloak()
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

  @ApiOperation({ summary: 'Zones for parking map (id, name, geofence, color)' })
  @ApiStandardResponse({
    description: 'Zones with parsed geofence for parking map',
    data: { zones: { model: Zone, isArray: true } },
  })
  @Get('filter/parking')
  findAllByfilterParking(
    @Query() paginationDto: FilterDto,
  ) {
    return this.zoneService.findAllByFilterParking(paginationDto);
  }

  @ApiOperation({ summary: 'Update a zone' })
  @ApiStandardResponse({
    description: 'Zone updated or unique-name violation. Empty object when id is not found.',
    errorCodes: [ErrorCode.NONE, ErrorCode.NAMEUNIQUE],
    data: { zone: { model: Zone } },
  })

  // @AuthWithKeycloak()
  @Patch(':id/:userId/:idDevice/:version')
  update(
    @GetUser() user: JwtPayload,
    @Param('id', ParseIntPipe) id: number,
    @Param('userId', ParseIntPipe) userId: number,
    @Param('idDevice', ParseUUIDPipe) idDevice: string,
    @Param('version', ParseIntPipe) version: number,
    @Body() updateZoneDto: UpdateZoneDto
  ) {
    return this.zoneService.update(userId, id, updateZoneDto);
  }
}
