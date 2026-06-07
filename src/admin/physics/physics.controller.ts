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
import { TypeRol } from 'src/common/glob/type/type_rol';

import { PhysicsService } from './physics.service';

/**
 * REST controller for querying physical card records.
 *
 * Base route: `admin/physic`. Delegates all business logic to {@link PhysicsService}.
 */
@ApiTags('Admin - Physics')
@ApiBearerAuth('keycloak')
@Controller('admin/physic')
export class PhysicsController {
  /**
   * Creates the controller and injects its dependencies.
   *
   * @param physicsService Service that handles physical card record queries.
   */
  constructor(private readonly physicsService: PhysicsService) {}

  /**
   * Lists physical card records matching the provided filters.
   *
   * @param _userId Identifier of the requesting user (route context only).
   * @param _idDevice Identifier of the requesting device (route context only).
   * @param _version Client application version (route context only).
   * @param filterDto Optional filtering, pagination and sorting criteria.
   * @returns Promise resolving to the list of matching physical card records.
   */
  @ApiOperation({
    summary: 'List physical card records with optional filters (admin only)',
  })
  @AuthWithKeycloak(TypeRol.ADMIN)
  @Get(':userId/:idDevice/:version')
  findAll(
    @Param('userId', ParseIntPipe) _userId: number,
    @Param('idDevice', ParseUUIDPipe) _idDevice: string,
    @Param('version', ParseIntPipe) _version: number,
    @Query() filterDto: FilterDto,
  ) {
    return this.physicsService.findAll(filterDto);
  }

  /**
   * Counts the total number of physical card records matching the filters.
   *
   * @param _userId Identifier of the requesting user (route context only).
   * @param _idDevice Identifier of the requesting device (route context only).
   * @param _version Client application version (route context only).
   * @param filterDto Optional filtering criteria.
   * @returns Promise resolving to the total count of matching records.
   */
  @ApiOperation({
    summary: 'Count total physical card records matching filters (admin only)',
  })
  @AuthWithKeycloak(TypeRol.ADMIN)
  @Get('total/:userId/:idDevice/:version')
  findAllTotal(
    @Param('userId', ParseIntPipe) _userId: number,
    @Param('idDevice', ParseUUIDPipe) _idDevice: string,
    @Param('version', ParseIntPipe) _version: number,
    @Query() filterDto: FilterDto,
  ) {
    return this.physicsService.findAllTotal(filterDto);
  }

  /**
   * Counts the number of unique physical card users matching the filters.
   *
   * @param _userId Identifier of the requesting user (route context only).
   * @param _idDevice Identifier of the requesting device (route context only).
   * @param _version Client application version (route context only).
   * @param filterDto Optional filtering criteria.
   * @returns Promise resolving to the count of unique matching users.
   */
  @ApiOperation({
    summary: 'Count unique physical card users matching filters (admin only)',
  })
  @AuthWithKeycloak(TypeRol.ADMIN)
  @Get('total-unique/:userId/:idDevice/:version')
  findAllTotalUnique(
    @Param('userId', ParseIntPipe) _userId: number,
    @Param('idDevice', ParseUUIDPipe) _idDevice: string,
    @Param('version', ParseIntPipe) _version: number,
    @Query() filterDto: FilterDto,
  ) {
    return this.physicsService.findAllTotalUnique(filterDto);
  }
}
