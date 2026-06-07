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
   * @param supportTicketService Service that handles support ticket creation.
   */
  constructor(private readonly supportTicketService: SupportTicketService) {}

  /**
   * Submits a new support ticket from the client app.
   *
   * @param createSupportTicketDto Payload describing the support ticket to create.
   * @param userId                 ID of the user submitting the ticket.
   * @param _idDevice              UUID of the requesting device (currently unused).
   * @returns Promise resolving to the created support ticket.
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
