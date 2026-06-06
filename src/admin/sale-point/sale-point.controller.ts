import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { FilterDto } from 'src/common/dto/filter.dto';

import { CreateSalePointDto } from './dto/create-sale-point.dto';
import { UpdateSalePointDto } from './dto/update-sale-point.dto';
import { SalePointService } from './sale-point.service';

/**
 * REST controller for managing sale points.
 *
 * Base route: `admin/sale-point`. Delegates all business logic to {@link SalePointService}.
 */
@ApiTags('Admin - Sale Point')
@ApiBearerAuth('keycloak')
@Controller('admin/sale-point')
export class SalePointController {
  /**
   *
   * @param salePointService
   */
  constructor(private readonly salePointService: SalePointService) {}

  /**
   *
   * @param userId
   * @param idDevice
   * @param version
   * @param createSalePointDto
   */
  @ApiOperation({ summary: 'Create a new sale point linked to a user' })
  @Post(':userId/:idDevice/:version')
  create(
    @Param('userId', ParseIntPipe) userId: number,
    @Param('idDevice', ParseUUIDPipe) idDevice: string,
    @Param('version', ParseIntPipe) version: number,
    @Body() createSalePointDto: CreateSalePointDto,
  ) {
    return this.salePointService.create(userId, createSalePointDto);
  }

  /**
   *
   * @param userId
   * @param idDevice
   * @param version
   * @param filterDto
   */
  @ApiOperation({ summary: 'List sale points with optional filters' })
  @Get(':userId/:idDevice/:version')
  findAll(
    @Param('userId', ParseIntPipe) userId: number,
    @Param('idDevice', ParseUUIDPipe) idDevice: string,
    @Param('version', ParseIntPipe) version: number,
    @Query() filterDto: FilterDto,
  ) {
    return this.salePointService.findAll(filterDto);
  }

  /**
   *
   * @param userId
   * @param idDevice
   * @param version
   * @param filterDto
   */
  @ApiOperation({
    summary: 'List sale points applying additional filter criteria',
  })
  @Get('filter/:userId/:idDevice/:version')
  findAllFilter(
    @Param('userId', ParseIntPipe) userId: number,
    @Param('idDevice', ParseUUIDPipe) idDevice: string,
    @Param('version', ParseIntPipe) version: number,
    @Query() filterDto: FilterDto,
  ) {
    return this.salePointService.findAllFilter(filterDto);
  }

  /**
   *
   * @param userId
   * @param idDevice
   * @param version
   * @param filterDto
   */
  @ApiOperation({ summary: 'Count total sale points matching filters' })
  @Get('total/:userId/:idDevice/:version')
  findAllTotal(
    @Param('userId', ParseIntPipe) userId: number,
    @Param('idDevice', ParseUUIDPipe) idDevice: string,
    @Param('version', ParseIntPipe) version: number,
    @Query() filterDto: FilterDto,
  ) {
    return this.salePointService.findAllTotal(filterDto);
  }

  /**
   *
   * @param id
   * @param userId
   * @param idDevice
   * @param version
   * @param updateSalePointDto
   */
  @ApiOperation({ summary: 'Update a sale point by id' })
  @Patch(':id/:userId/:idDevice/:version')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Param('userId', ParseIntPipe) userId: number,
    @Param('idDevice', ParseUUIDPipe) idDevice: string,
    @Param('version', ParseIntPipe) version: number,
    @Body() updateSalePointDto: UpdateSalePointDto,
  ) {
    return this.salePointService.update(userId, id, updateSalePointDto);
  }

  /**
   *
   * @param targetUserId
   * @param _userId
   * @param _idDevice
   * @param _version
   */
  @ApiOperation({
    summary: 'Check whether a sale point exists for a given userId',
  })
  @Get('exists/:targetUserId/:userId/:idDevice/:version')
  existsByUserId(
    @Param('targetUserId', ParseIntPipe) targetUserId: number,
    @Param('userId', ParseIntPipe) _userId: number,
    @Param('idDevice', ParseUUIDPipe) _idDevice: string,
    @Param('version', ParseIntPipe) _version: number,
  ) {
    return this.salePointService.existsByUserId(targetUserId);
  }
}
