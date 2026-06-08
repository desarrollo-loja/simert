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

import { CreateRangeSalePointDto } from './dto/create-range-sale-point.dto';
import { UpdateRangeSalePointDto } from './dto/update-range-sale-point.dto';
import { RangeSalePointService } from './range-sale-point.service';
/**
 * REST controller for managing range sale point assignments.
 *
 * Base route: `admin/range-sale-point`. Delegates all business logic to {@link RangeSalePointService}.
 */
@ApiTags('Admin - Range Sale Point')
@ApiBearerAuth('keycloak')
@Controller('admin/range-sale-point')
export class RangeSalePointController {
  /**
   * Creates the controller and injects the range sale point service.
   *
   * @param rangeSalePointService Service handling range sale point business logic.
   */
  constructor(private readonly rangeSalePointService: RangeSalePointService) { }

  /**
   * Creates a new range sale point assignment.
   *
   * @param userId Identifier of the user performing the request.
   * @param idDevice Identifier of the device issuing the request.
   * @param version Client application version.
   * @param createRangeSalePointDto Payload describing the range sale point to create.
   * @returns Promise resolving to the created range sale point.
   */
  @ApiOperation({ summary: 'Create a new range sale point assignment' })
  @Post(':userId/:idDevice/:version')
  create(
    @Param('userId', ParseIntPipe) userId: number,
    @Param('idDevice', ParseUUIDPipe) idDevice: string,
    @Param('version', ParseIntPipe) version: number,
    @Body() createRangeSalePointDto: CreateRangeSalePointDto,
  ) {
    return this.rangeSalePointService.create(userId, createRangeSalePointDto);
  }

  /**
   * Lists range sale points matching the provided filters.
   *
   * @param userId Identifier of the user performing the request.
   * @param idDevice Identifier of the device issuing the request.
   * @param version Client application version.
   * @param filterDto Pagination and filtering options.
   * @returns Promise resolving to the list of matching range sale points.
   */
  @ApiOperation({ summary: 'List range sale points with optional filters' })
  @Get(':userId/:idDevice/:version')
  findAll(
    @Param('userId', ParseIntPipe) userId: number,
    @Param('idDevice', ParseUUIDPipe) idDevice: string,
    @Param('version', ParseIntPipe) version: number,
    @Query() filterDto: FilterDto,
  ) {
    return this.rangeSalePointService.findAll(filterDto);
  }

  /**
   * Lists available (unassigned) range sale points matching the provided filters.
   *
   * @param userId Identifier of the user performing the request.
   * @param idDevice Identifier of the device issuing the request.
   * @param version Client application version.
   * @param filterDto Pagination and filtering options.
   * @returns Promise resolving to the list of available range sale points.
   */
  @ApiOperation({ summary: 'List available (unassigned) range sale points' })
  @Get('available/:userId/:idDevice/:version')
  getAvailable(
    @Param('userId', ParseIntPipe) userId: number,
    @Param('idDevice', ParseUUIDPipe) idDevice: string,
    @Param('version', ParseIntPipe) version: number,
    @Query() filterDto: FilterDto,
  ) {
    return this.rangeSalePointService.getAvailable(filterDto);
  }

  /**
   * Counts the total number of range sale points matching the provided filters.
   *
   * @param _userId Identifier of the user performing the request (unused).
   * @param _idDevice Identifier of the device issuing the request (unused).
   * @param _version Client application version (unused).
   * @param filterDto Pagination and filtering options.
   * @returns Promise resolving to the total count of matching range sale points.
   */
  @ApiOperation({ summary: 'Count total range sale points matching filters' })
  @Get('total/:userId/:idDevice/:version')
  findAllTotal(
    @Param('userId', ParseIntPipe) _userId: number,
    @Param('idDevice', ParseUUIDPipe) _idDevice: string,
    @Param('version', ParseIntPipe) _version: number,
    @Query() filterDto: FilterDto,
  ) {
    return this.rangeSalePointService.findAllTotal(filterDto);
  }

  /**
   * Retrieves a single range sale point by its identifier.
   *
   * @param id Identifier of the range sale point to retrieve.
   * @param _userId Identifier of the user performing the request (unused).
   * @param _idDevice Identifier of the device issuing the request (unused).
   * @param _version Client application version (unused).
   * @returns Promise resolving to the requested range sale point.
   */
  @ApiOperation({ summary: 'Get a single range sale point by id' })
  @Get(':id/:userId/:idDevice/:version')
  findOne(
    @Param('id', ParseIntPipe) id: number,
    @Param('userId', ParseIntPipe) _userId: number,
    @Param('idDevice', ParseUUIDPipe) _idDevice: string,
    @Param('version', ParseIntPipe) _version: number,
  ) {
    return this.rangeSalePointService.findOne(id);
  }

  /**
   * Updates an existing range sale point by its identifier.
   *
   * @param id Identifier of the range sale point to update.
   * @param userId Identifier of the user performing the request.
   * @param idDevice Identifier of the device issuing the request.
   * @param version Client application version.
   * @param updateRangeSalePointDto Payload describing the fields to update.
   * @returns Promise resolving to the updated range sale point.
   */
  @ApiOperation({ summary: 'Update a range sale point by id' })
  @Patch(':id/:userId/:idDevice/:version')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Param('userId', ParseIntPipe) userId: number,
    @Param('idDevice', ParseUUIDPipe) idDevice: string,
    @Param('version', ParseIntPipe) version: number,
    @Body() updateRangeSalePointDto: UpdateRangeSalePointDto,
  ) {
    return this.rangeSalePointService.update(
      userId,
      id,
      updateRangeSalePointDto,
    );
  }
}
