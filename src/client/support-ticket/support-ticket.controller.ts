import {
  Body,
  Controller,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { CreateSupportTicketDto } from './dto/create-support-ticket.dto';
import { SupportTicketService } from './support-ticket.service';
/**
 * REST controller for submitting support tickets from the client app.
 *
 * Base route: `client/support-ticket`. Delegates all business logic to {@link SupportTicketService}.
 */
@ApiTags('Client - Support Ticket')
@ApiBearerAuth('keycloak')
@Controller('client/support-ticket')
export class SupportTicketController {
  /**
   *
   * @param supportTicketService
   */
  constructor(private readonly supportTicketService: SupportTicketService) {}

  /**
   *
   * @param createSupportTicketDto
   * @param userId
   * @param _idDevice
   */
  @ApiOperation({ summary: 'Submit a new support ticket from the client app' })
  // @Auth()
  @Post('create/:userId/:idDevice')
  create(
    // @GetUser() user: JwtPayload,
    @Body() createSupportTicketDto: CreateSupportTicketDto,
    @Param('userId', ParseIntPipe) userId: number,
    @Param('idDevice', ParseUUIDPipe) _idDevice: string,
  ) {
    return this.supportTicketService.create(userId, createSupportTicketDto);
  }
}
