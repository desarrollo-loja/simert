import { Body, Controller, Delete, Get, Param, ParseFloatPipe, ParseIntPipe, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthWithKeycloak } from 'src/auth/decorators';

import { AdminService } from './admin.service';
import { CreateAdminDto } from './dto/create-admin.dto';
/**
 * REST controller for the admin client view over parking slots.
 *
 * Base route: `client/admin`. Delegates all business logic to {@link AdminService}.
 */
@ApiTags('Client - Admin')
@ApiBearerAuth('keycloak')
@Controller('client/admin')
export class AdminController {

  constructor(private readonly adminService: AdminService) { }

  @ApiOperation({ summary: 'List all slots near a latitude/longitude (for admin client view)' })
  @AuthWithKeycloak()
  @Get('find-all-slots/:userId/:idDevice/:latitude/:longitude/:version')
  findAllBlocks(
    @Param('latitude', ParseFloatPipe) latitude: number,
    @Param('longitude', ParseFloatPipe) longitude: number,
    @Param('idDevice', ParseUUIDPipe) idDevice: string,
    @Param('version', ParseIntPipe) version: number,
  ) {
    return this.adminService.findAllSlots(latitude, longitude);
  }

  @ApiOperation({ summary: 'Delete a slot by slotId (admin client action)' })
  @AuthWithKeycloak()
  @Delete('delete-slot/:userId/:idDevice/:slotId/:version')
  delete(
    @Param('userId', ParseFloatPipe) userId: number,
    @Param('idDevice', ParseUUIDPipe) idDevice: string,
    @Param('slotId', ParseIntPipe) slotId: number,
    @Param('version', ParseIntPipe) version: number,
  ) {
    return this.adminService.delete(slotId);
  }

  @ApiOperation({ summary: 'Create a slot from the admin client view' })
  @AuthWithKeycloak()
  @Post('slot/create/:userId/:idDevice')
  create(
    @Param('userId', ParseIntPipe) userId: number,
    @Param('idDevice', ParseUUIDPipe) idDevice: string,
    @Body() createAdminDto: CreateAdminDto
  ) {
    return this.adminService.create(createAdminDto);
  }

}
