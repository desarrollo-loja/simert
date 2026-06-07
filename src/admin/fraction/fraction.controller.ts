import {
  Controller,
  Get,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthWithKeycloak } from 'src/auth/decorators';
import { FilterDto } from 'src/common/dto/filter.dto';

import { FractionService } from './fraction.service';

/**
 * REST controller for querying parking fractions.
 *
 * Base route: `admin/fraction`. Delegates all business logic to {@link FractionService}.
 */
@ApiTags('Admin - Fraction')
@ApiBearerAuth('keycloak')
@Controller('admin/fraction')
export class FractionController {
  /**
   * Creates a new FractionController instance.
   *
   * @param fractionService Service that handles parking fraction queries.
   */
  constructor(private readonly fractionService: FractionService) {}

  /**
   * Lists all parking fractions, optionally narrowed by the provided filters.
   *
   * @param userId Identifier of the requesting user.
   * @param idDevice UUID of the requesting device.
   * @param version Client application version.
   * @param filterDto Query filters applied to the fraction listing.
   * @returns Promise resolving to the list of matching parking fractions.
   */
  @ApiOperation({ summary: 'List all parking fractions with optional filters' })
  @Get('find-all-fractions/:userId/:idDevice/:version')
  findAll(
    @Param('userId', ParseIntPipe) userId: number,
    @Param('idDevice', ParseUUIDPipe) idDevice: string,
    @Param('version', ParseIntPipe) version: number,
    @Query() filterDto: FilterDto,
  ) {
    return this.fractionService.findAll(filterDto);
  }

  /**
   * Lists parking fractions combining live and historical records.
   *
   * @param userId Identifier of the requesting user.
   * @param idDevice UUID of the requesting device.
   * @param version Client application version.
   * @param filterDto Query filters applied to the fraction history listing.
   * @returns Promise resolving to the merged live and historical fractions.
   */
  @ApiOperation({
    summary:
      'List parking fractions from live and historical tables (UNION ALL)',
  })
  @Get('find-all-fractions-history/:userId/:idDevice/:version')
  findAllHistory(
    @Param('userId', ParseIntPipe) userId: number,
    @Param('idDevice', ParseUUIDPipe) idDevice: string,
    @Param('version', ParseIntPipe) version: number,
    @Query() filterDto: FilterDto,
  ) {
    return this.fractionService.findFractionHistory(filterDto);
  }

  /**
   * Aggregates the total vehicle parking time per client for reporting.
   *
   * @param userId Identifier of the requesting user.
   * @param idDevice UUID of the requesting device.
   * @param version Client application version.
   * @param filterDto Query filters applied to the aggregation.
   * @returns Promise resolving to the total vehicle time aggregated per client.
   */
  @ApiOperation({
    summary: 'Aggregate total vehicle time per client (reporting)',
  })
  @Get('find-all-total-vehicle-client-time/:userId/:idDevice/:version')
  findAllTotalVehicleClientTime(
    @Param('userId', ParseIntPipe) userId: number,
    @Param('idDevice', ParseUUIDPipe) idDevice: string,
    @Param('version', ParseIntPipe) version: number,
    @Query() filterDto: FilterDto,
  ) {
    return this.fractionService.findAllTotalVehicleClientTime(filterDto);
  }

  /**
   * Aggregates parking occupation and rotation metrics.
   *
   * @param userId Identifier of the requesting user.
   * @param idDevice UUID of the requesting device.
   * @param version Client application version.
   * @param filterDto Query filters applied to the aggregation.
   * @returns Promise resolving to the occupation and rotation metrics.
   */
  @ApiOperation({
    summary: 'Aggregate parking occupation and rotation metrics',
  })
  @Get('find-all-total-occupation-rotation-parking/:userId/:idDevice/:version')
  findAllTotalOccupationRotationParking(
    @Param('userId', ParseIntPipe) userId: number,
    @Param('idDevice', ParseUUIDPipe) idDevice: string,
    @Param('version', ParseIntPipe) version: number,
    @Query() filterDto: FilterDto,
  ) {
    return this.fractionService.findAllTotalOccupationRotationParking(
      filterDto,
    );
  }

  /**
   * Computes general fraction statistics such as counts and totals.
   *
   * @param userId Identifier of the requesting user.
   * @param idDevice UUID of the requesting device.
   * @param version Client application version.
   * @param filterDto Query filters applied to the statistics.
   * @returns Promise resolving to the general fraction statistics.
   */
  @ApiOperation({
    summary: 'General fraction statistics (counts, totals) with filters',
  })
  @Get('find-all-statistics/:userId/:idDevice/:version')
  findAllStatistics(
    @Param('userId', ParseIntPipe) userId: number,
    @Param('idDevice', ParseUUIDPipe) idDevice: string,
    @Param('version', ParseIntPipe) version: number,
    @Query() filterDto: FilterDto,
  ) {
    return this.fractionService.findAllStatistics(filterDto);
  }

  /**
   * Computes detailed fraction statistics grouped by slot, block and zone.
   *
   * @param userId Identifier of the requesting user.
   * @param idDevice UUID of the requesting device.
   * @param version Client application version.
   * @param filterDto Query filters applied to the statistics.
   * @returns Promise resolving to the detailed fraction statistics.
   */
  @ApiOperation({
    summary: 'Detailed fraction statistics grouped by slot/block/zone',
  })
  @AuthWithKeycloak()
  @Get('find-statistics-fractions/:userId/:idDevice/:version')
  findStatisticsFractions(
    @Param('userId', ParseIntPipe) userId: number,
    @Param('idDevice', ParseUUIDPipe) idDevice: string,
    @Param('version', ParseIntPipe) version: number,
    @Query() filterDto: FilterDto,
  ) {
    return this.fractionService.findStatisticsFractions(filterDto);
  }
}
