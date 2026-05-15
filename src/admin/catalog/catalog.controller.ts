import { Body, Controller, Get, Param, ParseIntPipe, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { FilterDto } from "../../common/dto/filter.dto";
import { CatalogService } from './catalog.service';
import { CreateCatalogDto } from './dto/create-catalog.dto';
import { UpdateCatalogDto } from './dto/update-catalog.dto';

@ApiTags('Admin - Catalog')
@ApiBearerAuth('keycloak')
@Controller('admin/catalog')
export class CatalogController {
  constructor(private readonly catalogService: CatalogService) {}

  @ApiOperation({ summary: 'Create a new catalog' })
  @Post(':userId/:idDevice/:version')
  create(
    @Param('userId', ParseIntPipe) userId: number,
    @Param('idDevice', ParseUUIDPipe) idDevice: string,
    @Param('version', ParseIntPipe) version: number,
    @Body() createCatalogDto: CreateCatalogDto,
  ) {
    return this.catalogService.create(userId, createCatalogDto);
  }

  @ApiOperation({ summary: 'List catalogs with optional filters' })
  @Get(':userId/:idDevice/:version')
  findAll(
    @Param('userId', ParseIntPipe) userId: number,
    @Param('idDevice', ParseUUIDPipe) idDevice: string,
    @Param('version', ParseIntPipe) version: number,
    @Query() filterDto: FilterDto,
  ) {
    return this.catalogService.findAll(filterDto);
  }

  @ApiOperation({ summary: 'Update a catalog by id' })
  @Patch(':id/:userId/:idDevice/:version')
  update(
    @Param('id') id: string,
    @Param('userId', ParseIntPipe) userId: number,
    @Param('idDevice', ParseUUIDPipe) idDevice: string,
    @Param('version', ParseIntPipe) version: number,
    @Body() updateCatalogDto: UpdateCatalogDto,
  ) {
    return this.catalogService.update(+id, userId, updateCatalogDto);
  }
}
