import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Auth } from 'src/auth/decorators';
import { FilterDto } from 'src/common/dto/filter.dto';

import { LService } from './l.service';

/**
 * REST controller for querying real-time tracking location records (entity `L`).
 *
 * Base route: `admin/l`. Delegates all business logic to {@link LService}.
 */
@ApiTags('Admin - L')
@ApiBearerAuth('keycloak')
@Controller('admin/l')
export class LController {
  /**
   *
   * @param lService
   */
  constructor(private readonly lService: LService) {}

  /**
   *
   * @param userId
   * @param idDevice
   * @param version
   * @param filterDto
   */
  @ApiOperation({
    summary: 'List location records for a single user (tracking DB)',
  })
  // @Auth(TypeRol.ADMIN)
  @Get('by-user/:userId/:idDevice/:version')
  findAllByUser(
    // @GetUser() user: JwtPayload,
    @Param('userId', ParseIntPipe) userId: number,
    @Param('idDevice', ParseUUIDPipe) idDevice: string,
    @Param('version', ParseIntPipe) version: number,
    @Query() filterDto: FilterDto,
  ) {
    return this.lService.findAllByUser(filterDto);
  }

  /**
   *
   * @param userId
   * @param idDevice
   * @param version
   * @param filterDto
   */
  @ApiOperation({
    summary: 'List location records for multiple users (tracking DB)',
  })
  @Auth()
  @Post('find-all-by-users/:userId/:idDevice/:version')
  findByUsers(
    @Param('userId', ParseIntPipe) userId: number,
    @Param('idDevice', ParseUUIDPipe) idDevice: string,
    @Param('version', ParseIntPipe) version: number,
    @Body() filterDto: FilterDto,
  ) {
    return this.lService.findByUsers(filterDto);
  }
}
