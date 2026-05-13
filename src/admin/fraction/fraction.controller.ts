import { Controller, Get, Param, ParseIntPipe, ParseUUIDPipe, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthWithKeycloak } from 'src/auth/decorators';
import { FilterDto } from 'src/common/dto/filter.dto';

import { FractionService } from './fraction.service';
@ApiTags('Admin - Fraction')
@ApiBearerAuth('keycloak')
@Controller('admin/fraction')
export class FractionController {
  constructor(private readonly fractionService: FractionService) { }

  @ApiOperation({ summary: 'List all parking fractions with optional filters' })
  // @Auth(TypeRol.ADMIN)
  @Get('find-all-fractions/:userId/:idDevice/:version')
  findAll(
    // @GetUser() user: JwtPayload,
    @Param('userId', ParseIntPipe) userId: number,
    @Param('idDevice', ParseUUIDPipe) idDevice: string,
    @Param('version', ParseIntPipe) version: number,
    @Query() filterDto: FilterDto,
  ) {
    return this.fractionService.findAll(filterDto);
  }

  @ApiOperation({ summary: 'List all parking fractions with optional filters' })
  // @Auth(TypeRol.ADMIN)
  @Get('find-all-fractions-history/:userId/:idDevice/:version')
  findAllHistory(
    // @GetUser() user: JwtPayload,
    @Param('userId', ParseIntPipe) userId: number,
    @Param('idDevice', ParseUUIDPipe) idDevice: string,
    @Param('version', ParseIntPipe) version: number,
    @Query() filterDto: FilterDto,
  ) {
    return this.fractionService.findFractionHistory(filterDto);
  }

  @ApiOperation({ summary: 'Aggregate total vehicle time per client (reporting)' })
  // @Auth(TypeRol.ADMIN)
  @Get('find-all-total-vehicle-client-time/:userId/:idDevice/:version')
  findAllTotalVehicleClientTime(
    // @GetUser() user: JwtPayload,
    @Param('userId', ParseIntPipe) userId: number,
    @Param('idDevice', ParseUUIDPipe) idDevice: string,
    @Param('version', ParseIntPipe) version: number,
    @Query() filterDto: FilterDto,
  ) {
    return this.fractionService.findAllTotalVehicleClientTime(filterDto);
  }

  @ApiOperation({ summary: 'Aggregate parking occupation and rotation metrics' })
  // @Auth(TypeRol.ADMIN)
  @Get('find-all-total-occupation-rotation-parking/:userId/:idDevice/:version')
  findAllTotalOccupationRotationParking(
    // @GetUser() user: JwtPayload,
    @Param('userId', ParseIntPipe) userId: number,
    @Param('idDevice', ParseUUIDPipe) idDevice: string,
    @Param('version', ParseIntPipe) version: number,
    @Query() filterDto: FilterDto,
  ) {
    return this.fractionService.findAllTotalOccupationRotationParking(filterDto);
  }

  @ApiOperation({ summary: 'General fraction statistics (counts, totals) with filters' })
  // @Auth(TypeRol.ADMIN)
  @Get('find-all-statistics/:userId/:idDevice/:version')
  findAllStatistics(
    // @GetUser() user: JwtPayload,
    @Param('userId', ParseIntPipe) userId: number,
    @Param('idDevice', ParseUUIDPipe) idDevice: string,
    @Param('version', ParseIntPipe) version: number,
    @Query() filterDto: FilterDto,
  ) {
    return this.fractionService.findAllStatistics(filterDto);
  }

  @ApiOperation({ summary: 'Detailed fraction statistics grouped by slot/block/zone' })
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
