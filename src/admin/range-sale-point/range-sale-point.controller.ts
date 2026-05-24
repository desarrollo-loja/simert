import { Body, Controller, Get, Param, ParseIntPipe, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
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
    constructor(private readonly rangeSalePointService: RangeSalePointService) { }

    @ApiOperation({ summary: 'Create a new range sale point assignment' })
    @Post(':userId/:idDevice/:version')
    create(
        @Param('userId', ParseIntPipe) userId: number,
        @Param('idDevice', ParseUUIDPipe) idDevice: string,
        @Param('version', ParseIntPipe) version: number,
        @Body() createRangeSalePointDto: CreateRangeSalePointDto
    ) {
        return this.rangeSalePointService.create(userId, createRangeSalePointDto);
    }

    @ApiOperation({ summary: 'List range sale points with optional filters' })
    @Get(':userId/:idDevice/:version')
    findAll(
        @Param('userId', ParseIntPipe) userId: number,
        @Param('idDevice', ParseUUIDPipe) idDevice: string,
        @Param('version', ParseIntPipe) version: number,
        @Query() filterDto: FilterDto
    ) {
        return this.rangeSalePointService.findAll(filterDto);
    }

    @ApiOperation({ summary: 'List available (unassigned) range sale points' })
    @Get('available/:userId/:idDevice/:version')
    getAvailable(
        @Param('userId', ParseIntPipe) userId: number,
        @Param('idDevice', ParseUUIDPipe) idDevice: string,
        @Param('version', ParseIntPipe) version: number,
        @Query() filterDto: FilterDto
    ) {
        return this.rangeSalePointService.getAvailable(filterDto);
    }

    @ApiOperation({ summary: 'Count total range sale points matching filters' })
    @Get('total/:userId/:idDevice/:version')
    findAllTotal(
        @Param('userId', ParseIntPipe) _userId: number,
        @Param('idDevice', ParseUUIDPipe) _idDevice: string,
        @Param('version', ParseIntPipe) _version: number,
        @Query() filterDto: FilterDto
    ) {
        return this.rangeSalePointService.findAllTotal(filterDto);
    }

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

    @ApiOperation({ summary: 'Update a range sale point by id' })
    @Patch(':id/:userId/:idDevice/:version')
    update(
        @Param('id', ParseIntPipe) id: number,
        @Param('userId', ParseIntPipe) userId: number,
        @Param('idDevice', ParseUUIDPipe) idDevice: string,
        @Param('version', ParseIntPipe) version: number,
        @Body() updateRangeSalePointDto: UpdateRangeSalePointDto
    ) {
        return this.rangeSalePointService.update(userId, id, updateRangeSalePointDto);
    }
}
