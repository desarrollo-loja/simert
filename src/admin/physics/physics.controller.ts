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
   *
   * @param physicsService
   */
  constructor(private readonly physicsService: PhysicsService) {}

  /**
   *
   * @param _userId
   * @param _idDevice
   * @param _version
   * @param filterDto
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
   *
   * @param _userId
   * @param _idDevice
   * @param _version
   * @param filterDto
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
   *
   * @param _userId
   * @param _idDevice
   * @param _version
   * @param filterDto
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
