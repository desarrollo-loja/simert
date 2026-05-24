import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { SupportTicket } from 'src/admin/support-ticket/entities/support-ticket.entity';
import handleDbExceptions from 'src/common/exceptions/error.db.exception';
import { ErrorCode } from 'src/common/glob/error';
import { SupportTicketStatus } from 'src/common/glob/type/support_ticket_status';
import { Repository } from 'typeorm';

import { CreateSupportTicketDto } from './dto/create-support-ticket.dto';

/**
 * Client-facing service for SupportTicket. Allows authenticated users to
 * submit help requests. Defaults status to PENDING and falls back to the
 * token's userId when none is supplied in the DTO.
 */
@Injectable()
export class SupportTicketService {
  private readonly logger = new Logger(SupportTicketService.name);

  constructor(
    @InjectRepository(SupportTicket)
    private readonly supportTicketRepository: Repository<SupportTicket>,
  ) { }

  async create(userId: number, createSupportTicketDto: CreateSupportTicketDto) {
    try {
      // Use the userId from the DTO if provided, otherwise fall back to the parameter
      if (!createSupportTicketDto.userId) {
        createSupportTicketDto.userId = userId;
      }

      // If no status is provided, default to PENDING
      if (!createSupportTicketDto.status) {
        createSupportTicketDto.status = SupportTicketStatus.PENDING;
      }

      const supportTicket = this.supportTicketRepository.create({
        ...createSupportTicketDto,
      });

      const savedTicket = await this.supportTicketRepository.save(supportTicket);

      // Generate reference ticket number
      const ticketNumber = `ST-${savedTicket.id.toString().padStart(6, '0')}`;

      return {
        errorCode: ErrorCode.NONE,
        supportTicket: savedTicket,
        ticketNumber,
        message: `Ticket creado exitosamente. Número de referencia: ${ticketNumber}`,
      };
    } catch (error) {
      handleDbExceptions(error, this.logger);
    }
  }
}
