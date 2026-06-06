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
   *
   * @param fractionService
   */
  constructor(private readonly fractionService: FractionService) {}

  /**
   *
   * @param userId
   * @param idDevice
   * @param version
   * @param filterDto
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
   *
   * @param userId
   * @param idDevice
   * @param version
   * @param filterDto
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
   *
   * @param userId
   * @param idDevice
   * @param version
   * @param filterDto
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
   *
   * @param userId
   * @param idDevice
   * @param version
   * @param filterDto
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
   *
   * @param userId
   * @param idDevice
   * @param version
   * @param filterDto
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
   *
   * @param userId
   * @param idDevice
   * @param version
   * @param filterDto
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
