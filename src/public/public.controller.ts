import {
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Query,
} from '@nestjs/common';
import {
  ApiExtraModels,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';

import {
  OccupancySummaryResponseDto,
} from './dto/availability-response.dto';
import {
  SectorAvailabilityResponseDto,
  ZoneAvailabilityResponseDto,
} from './dto/availability-response.dto';
import { MapDataResponseDto } from './dto/map-response.dto';
import { PublicFilterDto } from './dto/public-filter.dto';
import { ScheduleListResponseDto } from './dto/schedule-response.dto';
import {
  SectorDetailResponseDto,
  SectorListResponseDto,
} from './dto/sector-response.dto';
import {
  ZoneDetailResponseDto,
  ZoneListResponseDto,
} from './dto/zone-response.dto';
import { PublicService } from './public.service';

/**
 * Public read-only REST controller for parking data.
 *
 * All endpoints are unauthenticated and return only non-sensitive information
 * suitable for third-party consumers, mobile apps, maps and public portals.
 *
 * Base route: `public`
 */
@ApiTags('Public')
@ApiExtraModels(
  ZoneListResponseDto,
  ZoneDetailResponseDto,
  SectorListResponseDto,
  SectorDetailResponseDto,
  ScheduleListResponseDto,
  SectorAvailabilityResponseDto,
  ZoneAvailabilityResponseDto,
  OccupancySummaryResponseDto,
  MapDataResponseDto,
)
@Controller('public')
export class PublicController {
  constructor(private readonly publicService: PublicService) {}

  // ─── Zones ───────────────────────────────────────────────────────

  @Get('zones')
  @ApiOperation({
    summary: 'List all active zones',
    description:
      'Returns a paginated list of all active parking zones with basic display information. ' +
      'Supports optional name search via the `search` query parameter. ' +
      'Use this endpoint to populate zone selectors, dropdowns, or list views.',
  })
  @ApiQuery({ name: 'search', required: false, description: 'Case-insensitive search on zone name', example: 'centro' })
  @ApiQuery({ name: 'limit', required: false, description: 'Max records to return (1-100, default 50)', example: 20 })
  @ApiQuery({ name: 'offset', required: false, description: 'Records to skip for pagination (default 0)', example: 0 })
  @ApiResponse({
    status: 200,
    description: 'List of active zones with total count',
    type: ZoneListResponseDto,
  })
  findAllZones(@Query() filter: PublicFilterDto) {
    return this.publicService.findAllZones(filter);
  }

  @Get('zones/availability/summary')
  @ApiOperation({
    summary: 'General occupancy summary',
    description:
      'Returns a system-wide occupancy summary across all active zones, ' +
      'including total counts, per-status breakdowns, occupancy rates, and per-zone summaries. ' +
      'Ideal for dashboards, analytics widgets, and monitoring panels.',
  })
  @ApiResponse({
    status: 200,
    description: 'Global occupancy summary with per-zone breakdown',
    type: OccupancySummaryResponseDto,
  })
  findOccupancySummary() {
    return this.publicService.findOccupancySummary();
  }

  @Get('zones/:id')
  @ApiOperation({
    summary: 'Get zone detail',
    description:
      'Returns detailed information for a single zone including its description, ' +
      'the number of sectors it contains, total slot count, and real-time availability. ' +
      'Returns `null` for the zone field when the ID is not found or the zone is inactive.',
  })
  @ApiParam({ name: 'id', description: 'Zone ID', example: 1 })
  @ApiResponse({
    status: 200,
    description: 'Zone detail with sector and slot summaries',
    type: ZoneDetailResponseDto,
  })
  findZoneById(@Param('id', ParseIntPipe) id: number) {
    return this.publicService.findZoneById(id);
  }

  @Get('zones/:id/availability')
  @ApiOperation({
    summary: 'Zone availability with sector breakdown',
    description:
      'Returns real-time slot availability consolidated for a zone, broken down by status ' +
      '(available, occupied, exceeded, grace time, out of service, PCD). ' +
      'Includes a per-sector availability summary within the zone. ' +
      'Use this endpoint for zone-level availability displays and heatmaps.',
  })
  @ApiParam({ name: 'id', description: 'Zone ID', example: 1 })
  @ApiResponse({
    status: 200,
    description: 'Zone availability with per-sector breakdown',
    type: ZoneAvailabilityResponseDto,
  })
  findZoneAvailability(@Param('id', ParseIntPipe) id: number) {
    return this.publicService.findZoneAvailability(id);
  }

  // ─── Sectors ─────────────────────────────────────────────────────

  @Get('sectors')
  @ApiOperation({
    summary: 'List all active sectors',
    description:
      'Returns a paginated list of all active parking sectors (blocks) with their parent zone context. ' +
      'Supports filtering by zone ID and name search. ' +
      'Results are sorted by priority (ascending), then name. ' +
      'Each sector includes timing configuration (time limit, grace period, fraction duration), ' +
      'location data (neighborhood, streets), and display properties.',
  })
  @ApiQuery({ name: 'search', required: false, description: 'Case-insensitive search on sector name', example: 'parque' })
  @ApiQuery({ name: 'zoneId', required: false, description: 'Filter by parent zone ID', example: 1 })
  @ApiQuery({ name: 'limit', required: false, description: 'Max records to return (1-100, default 50)', example: 20 })
  @ApiQuery({ name: 'offset', required: false, description: 'Records to skip for pagination (default 0)', example: 0 })
  @ApiResponse({
    status: 200,
    description: 'List of active sectors with total count',
    type: SectorListResponseDto,
  })
  findAllSectors(@Query() filter: PublicFilterDto) {
    return this.publicService.findAllSectors(filter);
  }

  @Get('sectors/:id')
  @ApiOperation({
    summary: 'Get sector detail',
    description:
      'Returns detailed information for a single sector including its description, ' +
      'operating schedules, total slot count, and real-time availability. ' +
      'Schedules indicate the days and hours when paid parking is in effect. ' +
      'Returns `null` for the sector field when the ID is not found or the sector is inactive.',
  })
  @ApiParam({ name: 'id', description: 'Sector ID', example: 1 })
  @ApiResponse({
    status: 200,
    description: 'Sector detail with schedules and slot counts',
    type: SectorDetailResponseDto,
  })
  findSectorById(@Param('id', ParseIntPipe) id: number) {
    return this.publicService.findSectorById(id);
  }

  @Get('sectors/:id/schedules')
  @ApiOperation({
    summary: 'Get sector operating schedules',
    description:
      'Returns the active operating schedules configured for a sector. ' +
      'Each schedule defines a range of days (0=Sunday through 6=Saturday) and ' +
      'opening/closing times during which paid parking is enforced. ' +
      'A sector may have multiple schedule rules (e.g., weekdays 08:00-18:00 and Saturday 08:00-13:00).',
  })
  @ApiParam({ name: 'id', description: 'Sector ID', example: 1 })
  @ApiResponse({
    status: 200,
    description: 'List of active schedules for the sector',
    type: ScheduleListResponseDto,
  })
  findSchedulesBySector(@Param('id', ParseIntPipe) id: number) {
    return this.publicService.findSchedulesBySector(id);
  }

  @Get('sectors/:id/availability')
  @ApiOperation({
    summary: 'Sector slot availability',
    description:
      'Returns real-time slot availability for a single sector, broken down by slot status: ' +
      'available (100), occupied (200), exceeded (301), grace time (500), ' +
      'out of service (700), and PCD/disabled reserved (600). ' +
      'Use this endpoint for detailed sector-level availability in mobile apps and portals.',
  })
  @ApiParam({ name: 'id', description: 'Sector ID', example: 1 })
  @ApiResponse({
    status: 200,
    description: 'Sector availability breakdown by slot status',
    type: SectorAvailabilityResponseDto,
  })
  findSectorAvailability(@Param('id', ParseIntPipe) id: number) {
    return this.publicService.findSectorAvailability(id);
  }

  // ─── Map ─────────────────────────────────────────────────────────

  @Get('map')
  @ApiOperation({
    summary: 'Map-optimized zone and sector data',
    description:
      'Returns zones and their sectors with parsed geofence polygons and real-time slot availability, ' +
      'optimized for map rendering in web and mobile applications. ' +
      'Geofences are returned as arrays of coordinate rings (lat/lng objects), ' +
      'ready for direct use with mapping libraries (Google Maps, Leaflet, Mapbox). ' +
      'Supports filtering by zone ID or name search.',
  })
  @ApiQuery({ name: 'search', required: false, description: 'Case-insensitive search on zone name', example: 'centro' })
  @ApiQuery({ name: 'zoneId', required: false, description: 'Filter to a specific zone', example: 1 })
  @ApiResponse({
    status: 200,
    description: 'Zones with sectors, geofences and availability for map rendering',
    type: MapDataResponseDto,
  })
  findMapData(@Query() filter: PublicFilterDto) {
    return this.publicService.findMapData(filter);
  }
}
