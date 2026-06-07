import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthWithKeycloak, GetUser } from 'src/auth/decorators';
import { JwtPayload } from 'src/auth/interfaces';

import { CreateSupportTicketDto } from './dto/create-support-ticket.dto';
import { SupportTicketFilterDto } from './dto/support-ticket-filter.dto';
import { UpdateSupportTicketDto } from './dto/update-support-ticket.dto';
import { SupportTicketService } from './support-ticket.service';

/**
 * REST controller for managing operator support tickets from the admin console.
 *
 * Base route: `admin/support-ticket`. Delegates all business logic to {@link SupportTicketService}.
 */
@ApiTags('Admin - Support Ticket')
@ApiBearerAuth('keycloak')
@Controller('admin/support-ticket')
export class SupportTicketController {
  /**
   * Creates the controller and injects its dependencies.
   *
   * @param supportTicketService Service that handles support ticket business logic.
   */
  constructor(private readonly supportTicketService: SupportTicketService) {}

  /**
   * Creates a new support ticket.
   *
   * @param createSupportTicketDto Payload describing the support ticket to create.
   * @returns Promise resolving to the created support ticket.
   */
  @ApiOperation({ summary: 'Create a new support ticket' })
  @Post()
  create(@Body() createSupportTicketDto: CreateSupportTicketDto) {
    return this.supportTicketService.create(createSupportTicketDto);
  }

  /**
   * Lists support tickets matching the provided filters.
   *
   * @param userId Identifier of the requesting user.
   * @param idDevice Identifier of the requesting device.
   * @param filterDto Filter criteria used to narrow the result set.
   * @returns Promise resolving to the list of matching support tickets.
   */
  @ApiOperation({ summary: 'List support tickets with filters' })
  @Patch('find-all/:userId/:idDevice')
  findAll(
    @Param('userId', ParseIntPipe) userId: number,
    @Param('idDevice', ParseUUIDPipe) idDevice: string,
    @Body() filterDto: SupportTicketFilterDto,
  ) {
    return this.supportTicketService.findAll(filterDto);
  }

  /**
   * Counts the total number of support tickets matching the provided filters.
   *
   * @param userId Identifier of the requesting user.
   * @param idDevice Identifier of the requesting device.
   * @param filterDto Filter criteria used to narrow the count.
   * @returns Promise resolving to the total number of matching support tickets.
   */
  @ApiOperation({ summary: 'Count total support tickets matching filters' })
  @Patch('find-all-total/:userId/:idDevice')
  findAllTotal(
    @Param('userId', ParseIntPipe) userId: number,
    @Param('idDevice', ParseUUIDPipe) idDevice: string,
    @Body() filterDto: SupportTicketFilterDto,
  ) {
    return this.supportTicketService.findAllTotal(filterDto);
  }

  /**
   * Retrieves a single support ticket by its identifier.
   *
   * @param id Identifier of the support ticket to retrieve.
   * @returns Promise resolving to the matching support ticket.
   */
  @ApiOperation({ summary: 'Get a single support ticket by id' })
  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.supportTicketService.findOne(id);
  }

  /**
   * Updates the status or fields of an existing support ticket.
   *
   * @param userId Identifier of the requesting user.
   * @param idDevice Identifier of the requesting device.
   * @param id Identifier of the support ticket to update.
   * @param updateSupportTicketDto Payload describing the fields to update.
   * @returns Promise resolving to the updated support ticket.
   */
  @ApiOperation({ summary: 'Update a support ticket status or fields' })
  @Patch('update/:userId/:idDevice/:id')
  update(
    @Param('userId', ParseIntPipe) userId: number,
    @Param('idDevice', ParseUUIDPipe) idDevice: string,
    @Param('id', ParseIntPipe) id: number,
    @Body() updateSupportTicketDto: UpdateSupportTicketDto,
  ) {
    return this.supportTicketService.update(id, updateSupportTicketDto);
  }

  /**
   * Deletes a support ticket by its identifier.
   *
   * @param user Authenticated user resolved from the Keycloak token.
   * @param userId Identifier of the requesting user.
   * @param idDevice Identifier of the requesting device.
   * @param id Identifier of the support ticket to delete.
   * @returns Promise resolving to the result of the deletion.
   */
  @ApiOperation({ summary: 'Delete a support ticket by id' })
  @AuthWithKeycloak()
  @Delete('remove/:userId/:idDevice/:id')
  remove(
    @GetUser() user: JwtPayload,
    @Param('userId', ParseIntPipe) userId: number,
    @Param('idDevice', ParseUUIDPipe) idDevice: string,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.supportTicketService.remove(id);
  }
}
