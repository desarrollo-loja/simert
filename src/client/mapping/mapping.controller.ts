import { Controller, Get, Param, ParseFloatPipe, ParseIntPipe, ParseUUIDPipe, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Block } from 'src/admin/block/entities/block.entity';
import { Slot } from 'src/admin/slot/entities/slot.entity';
import { Zone } from 'src/admin/zone/entities/zone.entity';
import { AuthWithKeycloak, GetUser } from 'src/auth/decorators';
import { JwtPayload } from 'src/auth/interfaces';
import { ApiStandardResponse } from 'src/common/decorators/api-standard-response.decorator';
import { FilterDto } from 'src/common/dto/filter.dto';
import { ErrorCode } from 'src/common/glob/error';

import { MappingService } from './mapping.service';
/**
 * REST controller serving zone/block/slot map data to the client app.
 *
 * Base route: `client/mapping`. Delegates all business logic to {@link MappingService}.
 */
@ApiTags('Client - Mapping')
@ApiBearerAuth('keycloak')
@Controller('client/mapping')
export class MappingController {
  constructor(private readonly mappingService: MappingService) { }

  // @Auth()
  @ApiOperation({ summary: 'List all activated zones with parsed geofence' })
  @ApiStandardResponse({
    description: 'Active zones list. `zone` empty array if no results.',
    errorCodes: [ErrorCode.NONE, ErrorCode.NOT_FOUND],
    data: {
      zone: { model: Zone, isArray: true },
    },
  })
  @AuthWithKeycloak()
  @Get('find-all-zone/:userId/:idDevice/:version')
  findAllZones(
    @GetUser() user: JwtPayload,
    @Param('userId', ParseIntPipe) userId: number,
    @Param('idDevice', ParseUUIDPipe) idDevice: string,
    @Param('version') version: number,
    @Query() paginationDto: FilterDto,
  ) {
    return this.mappingService.findAllZones(paginationDto);
  }

  // @Auth()
  @ApiOperation({ summary: 'List all blocks with zone, schedules and parsed geofence' })
  @ApiStandardResponse({
    description: 'Blocks list with zone and schedules. `blocks` empty if no results.',
    errorCodes: [ErrorCode.NONE, ErrorCode.NOT_FOUND],
    data: {
      blocks: { model: Block, isArray: true },
      currentDate: { type: 'string', example: '2026-04-24T12:00:00.000Z' },
    },
  })
  @AuthWithKeycloak()
  @Get('find-all-block/:userId/:idDevice/:version')
  findAllBlock(
    @GetUser() user: JwtPayload,
    @Param('userId', ParseIntPipe) userId: number,
    @Param('idDevice', ParseUUIDPipe) idDevice: string,
    @Param('version') version: number,
    @Query() paginationDto: FilterDto,
  ) {
    return this.mappingService.findAllBlock(paginationDto);
  }

  // @Auth()
  @ApiOperation({ summary: 'List all slots with zone and block (excluding 0/0 coordinates)' })
  @ApiStandardResponse({
    description: 'Slots list with zone and block. `slots` empty if no results.',
    errorCodes: [ErrorCode.NONE, ErrorCode.NOT_FOUND],
    data: {
      slots: { model: Slot, isArray: true },
    },
  })
  @AuthWithKeycloak()
  @Get('find-all-slot/:userId/:idDevice/:version')
  findAllSlot(
    @GetUser() user: JwtPayload,
    @Param('userId', ParseIntPipe) userId: number,
    @Param('idDevice', ParseUUIDPipe) idDevice: string,
    @Param('version') version: number,
    @Query() paginationDto: FilterDto,
  ) {
    return this.mappingService.findAllSlot(paginationDto);
  }

  // @Auth()
  @ApiOperation({ summary: 'Find slots near a latitude/longitude (ordered by distance, limit 50)' })
  @ApiStandardResponse({
    description: 'Nearby slots ordered by distance. `slots` empty if no results.',
    errorCodes: [ErrorCode.NONE, ErrorCode.NOT_FOUND],
    data: {
      slots: { model: Slot, isArray: true },
    },
  })
  @AuthWithKeycloak()
  @Get('find-slot-nearby/:userId/:idDevice/:latitude/:longitude/:version')
  findSlotNearby(
    @GetUser() user: JwtPayload,
    @Param('userId', ParseIntPipe) userId: number,
    @Param('idDevice', ParseUUIDPipe) idDevice: string,
    @Param('latitude', ParseFloatPipe) latitude: number,
    @Param('longitude', ParseFloatPipe) longitude: number,
    @Param('version') version: number,
    @Query() paginationDto: FilterDto,
  ) {
    return this.mappingService.findSlotNearby(latitude, longitude, paginationDto);
  }
}
