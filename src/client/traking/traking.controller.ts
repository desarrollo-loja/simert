import { Body, Controller, Get, Param, ParseIntPipe, ParseUUIDPipe, Patch } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

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

}
