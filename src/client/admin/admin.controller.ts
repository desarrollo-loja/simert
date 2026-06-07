import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseFloatPipe,
  ParseIntPipe,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
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
  /**
   * Creates a new {@link AdminController}.
   *
   * @param adminService Service that handles admin slot business logic.
   */
  constructor(private readonly adminService: AdminService) {}

  /**
   * Lists all slots near the given coordinates for the admin client view.
   *
   * @param latitude Latitude used as the reference point for the search.
   * @param longitude Longitude used as the reference point for the search.
   * @param _idDevice Identifier of the requesting device (unused).
   * @param _version Client application version (unused).
   * @returns Result with the slots located near the provided coordinates.
   */
  @ApiOperation({
    summary: 'List all slots near a latitude/longitude (for admin client view)',
  })
  @AuthWithKeycloak()
  @Get('find-all-slots/:userId/:idDevice/:latitude/:longitude/:version')
  findAllBlocks(
    @Param('latitude', ParseFloatPipe) latitude: number,
    @Param('longitude', ParseFloatPipe) longitude: number,
    @Param('idDevice', ParseUUIDPipe) _idDevice: string,
    @Param('version', ParseIntPipe) _version: number,
  ) {
    return this.adminService.findAllSlots(latitude, longitude);
  }

  /**
   * Deletes a slot identified by its id from the admin client view.
   *
   * @param userId Identifier of the user performing the action.
   * @param idDevice Identifier of the requesting device.
   * @param slotId Identifier of the slot to delete.
   * @param _version Client application version (unused).
   * @returns Result of the slot deletion operation.
   */
  @ApiOperation({ summary: 'Delete a slot by slotId (admin client action)' })
  @AuthWithKeycloak()
  @Delete('delete-slot/:userId/:idDevice/:slotId/:version')
  delete(
    @Param('userId', ParseFloatPipe) userId: number,
    @Param('idDevice', ParseUUIDPipe) idDevice: string,
    @Param('slotId', ParseIntPipe) slotId: number,
    @Param('version', ParseIntPipe) _version: number,
  ) {
    return this.adminService.delete(slotId);
  }

  /**
   * Creates a slot from the admin client view.
   *
   * @param userId Identifier of the user performing the action.
   * @param idDevice Identifier of the requesting device.
   * @param createAdminDto Payload describing the slot to create.
   * @returns Result of the slot creation operation.
   */
  @ApiOperation({ summary: 'Create a slot from the admin client view' })
  @AuthWithKeycloak()
  @Post('slot/create/:userId/:idDevice')
  create(
    @Param('userId', ParseIntPipe) userId: number,
    @Param('idDevice', ParseUUIDPipe) idDevice: string,
    @Body() createAdminDto: CreateAdminDto,
  ) {
    return this.adminService.create(createAdminDto);
  }
}
