import { Body, Controller, Delete, Get, Param, ParseIntPipe, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
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
  constructor(private readonly supportTicketService: SupportTicketService) { }

  @ApiOperation({ summary: 'Create a new support ticket' })
  @Post()
  create(@Body() createSupportTicketDto: CreateSupportTicketDto) {
    return this.supportTicketService.create(createSupportTicketDto);
  }

  @ApiOperation({ summary: 'List support tickets with filters' })
  @Patch('find-all/:userId/:idDevice')
  findAll(
    @Param('userId', ParseIntPipe) userId: number,
    @Param('idDevice', ParseUUIDPipe) idDevice: string,
    @Body() filterDto: SupportTicketFilterDto
  ) {
    return this.supportTicketService.findAll(filterDto);
  }

  @ApiOperation({ summary: 'Count total support tickets matching filters' })
  @Patch('find-all-total/:userId/:idDevice')
  findAllTotal(
    @Param('userId', ParseIntPipe) userId: number,
    @Param('idDevice', ParseUUIDPipe) idDevice: string,
    @Body() filterDto: SupportTicketFilterDto
  ) {
    return this.supportTicketService.findAllTotal(filterDto);
  }

  @ApiOperation({ summary: 'Get a single support ticket by id' })
  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.supportTicketService.findOne(id);
  }

  @ApiOperation({ summary: 'Update a support ticket status or fields' })
  @Patch('update/:userId/:idDevice/:id')
  update(
    @Param('userId', ParseIntPipe) userId: number,
    @Param('idDevice', ParseUUIDPipe) idDevice: string,
    @Param('id', ParseIntPipe) id: number,
    @Body() updateSupportTicketDto: UpdateSupportTicketDto
  ) {
    return this.supportTicketService.update(id, updateSupportTicketDto);
  }

  @ApiOperation({ summary: 'Delete a support ticket by id' })
  @AuthWithKeycloak()
  @Delete('remove/:userId/:idDevice/:id')
  remove(
    @GetUser() user: JwtPayload,
    @Param('userId', ParseIntPipe) userId: number,
    @Param('idDevice', ParseUUIDPipe) idDevice: string,
    @Param('id', ParseIntPipe) id: number
  ) {
    return this.supportTicketService.remove(id);
  }
}
