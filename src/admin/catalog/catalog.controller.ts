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

import { FilterDto } from '../../common/dto/filter.dto';
import { CatalogService } from './catalog.service';
import { CreateCatalogDto } from './dto/create-catalog.dto';
import { UpdateCatalogDto } from './dto/update-catalog.dto';

/**
 * REST controller for managing catalog entries.
 *
 * Base route: `admin/catalog`. Delegates all business logic to {@link CatalogService}.
 */
@ApiTags('Admin - Catalog')
@ApiBearerAuth('keycloak')
@Controller('admin/catalog')
export class CatalogController {
  /**
   * Creates a new {@link CatalogController}.
   *
   * @param catalogService Service handling catalog business logic.
   */
  constructor(private readonly catalogService: CatalogService) {}

  /**
   * Creates a new catalog entry and writes an audit log entry.
   *
   * @param userId - Route param: ID of the requesting user used for audit logging.
   * @param idDevice - Route param: device UUID (version handshake).
   * @param version - Route param: client version (version handshake).
   * @param createCatalogDto - Payload with catalog name, data, and description.
   * @returns The newly created catalog record with errorCode.
   */
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

  /**
   * Returns a paginated list of catalog entries, optionally filtered by name
   * or description.
   *
   * @param userId - Route param: ID of the requesting user (version handshake).
   * @param idDevice - Route param: device UUID (version handshake).
   * @param version - Route param: client version (version handshake).
   * @param filterDto - Query filters: search, limit, offset.
   * @returns Paginated catalog list with total count, offset and limit echo.
   */
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

  /**
   * Applies a partial update to an existing catalog entry and writes an audit
   * log entry.
   *
   * @param id - Path param: primary key of the catalog entry to update.
   * @param userId - Route param: ID of the requesting user used for audit logging.
   * @param idDevice - Route param: device UUID (version handshake).
   * @param version - Route param: client version (version handshake).
   * @param updateCatalogDto - Fields to update on the catalog record.
   * @returns The updated catalog record with errorCode, or NOT_FOUND if missing.
   */
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
