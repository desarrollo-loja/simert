import { Body, Controller, Get, Param, ParseIntPipe, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthWithKeycloak, GetUser } from 'src/auth/decorators';
import { JwtPayload } from 'src/auth/interfaces';
import { FilterDto } from 'src/common/dto/filter.dto';

import { CreateRangeDto } from './dto/create-range.dto';
import { UpdateRangeDto } from './dto/update-range.dto';
import { RangeService } from './range.service';
/**
 * REST controller for managing price ranges associated with blocks.
 *
 * Base route: `admin/range`. Delegates all business logic to {@link RangeService}.
 */
@ApiTags('Admin - Range')
@ApiBearerAuth('keycloak')
@Controller('admin/range')
export class RangeController {
  constructor(private readonly rangeService: RangeService) { }

  @ApiOperation({ summary: 'Create a new price range for a block' })
  @AuthWithKeycloak()
  @Post('create/:userId/:idDevice/:version')
  create(
    @GetUser() user: JwtPayload,
    @Param('userId', ParseIntPipe) userId: number,
    @Param('idDevice', ParseUUIDPipe) idDevice: string,
    @Param('version', ParseIntPipe) version: number,
    @Body() createRangeDto: CreateRangeDto
  ) {
    return this.rangeService.create(userId, createRangeDto);
  }

  @ApiOperation({ summary: 'Update an existing price range' })
  @AuthWithKeycloak()
  @Patch('update/:userId/:idDevice/:id/:version')
  update(
    @GetUser() user: JwtPayload,
    @Param('userId', ParseIntPipe) userId: number,
    @Param('idDevice', ParseUUIDPipe) idDevice: string,
    @Param('id') id: string,
    @Param('version', ParseIntPipe) version: number,
    @Body() updateRangeDto: UpdateRangeDto
  ) {
    return this.rangeService.update(userId, +id, updateRangeDto);
  }

  @ApiOperation({ summary: 'List price ranges with optional filters' })
  @AuthWithKeycloak()
  @Get('findAll/:userId/:idDevice/:version')
  findAll(
    @GetUser() user: JwtPayload,
    @Param('userId', ParseIntPipe) userId: number,
    @Param('idDevice', ParseUUIDPipe) idDevice: string,
    @Param('version', ParseIntPipe) version: number,
    @Query() filterDto: FilterDto,
  ) {
    return this.rangeService.findAll(filterDto);
  }

  @ApiOperation({ summary: 'Count total price ranges matching filters' })
  @AuthWithKeycloak()
  @Get('findAllTotal/:userId/:idDevice/:version')
  findAllTotal(
    @GetUser() user: JwtPayload,
    @Param('userId', ParseIntPipe) userId: number,
    @Param('idDevice', ParseUUIDPipe) idDevice: string,
    @Query() filterDto: FilterDto,
  ) {
    return this.rangeService.findAllTotal(filterDto);
  }

  @ApiOperation({ summary: 'Verify whether a valid range exists for the given filters' })
  @AuthWithKeycloak()
  @Get('verifyRange/:userId/:idDevice/:version')
  verifyRange(
    @GetUser() user: JwtPayload,
    @Param('userId', ParseIntPipe) userId: number,
    @Param('idDevice', ParseUUIDPipe) idDevice: string,
    @Param('version', ParseIntPipe) version: number,
    @Query() filterDto: FilterDto,
  ) {
    return this.rangeService.verifyRange(filterDto);
  }
}
