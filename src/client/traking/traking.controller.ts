import { Body, Controller, Get, Param, ParseIntPipe, ParseUUIDPipe, Patch, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';

import { PlotLocationDto } from './dto/plot-location.dto';
import { TrakingService } from './traking.service';
/**
 * REST controller for recording and querying user location tracking from the client app.
 *
 * Base route: `client/traking`. Delegates all business logic to {@link TrakingService}.
 */
@ApiTags('Client - Traking')
@ApiBearerAuth('keycloak')
@Controller('client/traking')
export class TrakingController {
  constructor(private readonly trakingService: TrakingService) { }

  @ApiOperation({ summary: 'Plot (record) the current user location (tracking_controller DB)' })
  @Patch('p/:userId')
  plot(
    @Param('userId', ParseIntPipe) userId: number,
    @Body() plotLocationDto: PlotLocationDto,
  ) {
    return this.trakingService.plot(userId, plotLocationDto);
  }

  @ApiOperation({ summary: 'Get full location tracking history for a user' })
  @Get('tracking-by-user-id/:userId/:idDevice/:version')
  getTrackingByUserId(
    @Param('userId', ParseIntPipe) userId: number,
    @Param('idDevice', ParseUUIDPipe) idDevice: string,
  ) {
    return this.trakingService.getTrackingByUserId(userId);
  }

  @ApiOperation({ summary: 'Get latest location for multiple users (comma-separated userIds)' })
  @Get('trackings/:userIds/:idDevice/:version')
  getTrackings(
    @Param('userIds') userIds: string,
    @Param('idDevice', ParseUUIDPipe) idDevice: string
  ) {
    return this.trakingService.getTrackings(userIds);
  }

  @ApiOperation({ summary: 'Get all tracking records for a user within a date range (from/to)' })
  @Get('all-tracking/:userId/:idDevice/:from/:to/:version')
  getAllTracking(
    @Param('userId', ParseIntPipe) userId: number,
    @Param('idDevice', ParseUUIDPipe) idDevice: string,
    @Param('from') fromString: Date,
    @Param('to') toString: Date,
  ) {
    const from = new Date(fromString);
    const to = new Date(toString);
    return this.trakingService.getAllTracking(userId, from, to);
  }

  /**
   * Historical tracking lookup scoped to a single monthly partition.
   *
   * The frontend's "Histórico" tab forces the user to pick a single
   * year+month, so this endpoint routes directly to the matching
   * `YYYY_MM_traking` table. The `from`/`to` path params still carry
   * the full ISO datetime so the partition query can also apply the
   * day-of-month and hour boundaries within the partition.
   *
   * Kept separate from `all-tracking` so production traffic using the
   * existing route is not affected.
   */
  @ApiOperation({
    summary:
      'Get tracking records for a user within a SINGLE monthly partition (year+month required). Supports optional limit/offset pagination for the table view.'
  })
  @ApiQuery({ name: 'year', required: true, type: Number })
  @ApiQuery({ name: 'month', required: true, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'offset', required: false, type: Number })
  @Get('all-tracking-history/:userId/:idDevice/:from/:to/:version')
  getAllTrackingHistory(
    @Param('userId', ParseIntPipe) userId: number,
    @Param('idDevice', ParseUUIDPipe) idDevice: string,
    @Param('from') fromString: Date,
    @Param('to') toString: Date,
    @Query('year', ParseIntPipe) year: number,
    @Query('month', ParseIntPipe) month: number,
    @Query('limit') limitRaw?: string,
    @Query('offset') offsetRaw?: string,
  ) {
    const from = new Date(fromString);
    const to = new Date(toString);
    const limit = limitRaw !== undefined ? parseInt(limitRaw, 10) : undefined;
    const offset = offsetRaw !== undefined ? parseInt(offsetRaw, 10) : undefined;
    return this.trakingService.getAllTrackingHistory(userId, from, to, year, month, limit, offset);
  }

  /**
   * Lightweight polyline endpoint for the Histórico map. Returns only
   * lat/lng (no metadata, no JSON columns) and applies server-side
   * downsampling so the browser doesn't choke when the partition has
   * tens of thousands of points.
   */
  @ApiOperation({
    summary:
      'Get the downsampled lat/lng polyline for a user in a single monthly partition'
  })
  @ApiQuery({ name: 'year', required: true, type: Number })
  @ApiQuery({ name: 'month', required: true, type: Number })
  @ApiQuery({ name: 'maxPoints', required: false, type: Number })
  @Get('tracking-polyline-history/:userId/:idDevice/:from/:to/:version')
  getTrackingPolylineHistory(
    @Param('userId', ParseIntPipe) userId: number,
    @Param('idDevice', ParseUUIDPipe) idDevice: string,
    @Param('from') fromString: Date,
    @Param('to') toString: Date,
    @Query('year', ParseIntPipe) year: number,
    @Query('month', ParseIntPipe) month: number,
    @Query('maxPoints') maxPointsRaw?: string,
  ) {
    const from = new Date(fromString);
    const to = new Date(toString);
    const maxPoints =
      maxPointsRaw !== undefined ? parseInt(maxPointsRaw, 10) : undefined;
    return this.trakingService.getTrackingPolyline(userId, from, to, year, month, maxPoints);
  }

}
