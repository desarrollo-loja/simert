import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import handleDbExceptions from 'src/common/exceptions/error.db.exception';
import { ErrorCode } from 'src/common/glob/error';
import { SupportTicketStatus } from 'src/common/glob/type/support_ticket_status';
import { Repository } from 'typeorm';

import { CreateSupportTicketDto } from './dto/create-support-ticket.dto';
import { SupportTicketFilterDto } from './dto/support-ticket-filter.dto';
import { UpdateSupportTicketDto } from './dto/update-support-ticket.dto';
import { SupportTicket } from './entities/support-ticket.entity';

@Injectable()
export class SupportTicketService {
  private readonly logger = new Logger(SupportTicketService.name);

  constructor(
    @InjectRepository(SupportTicket)
    private readonly supportTicketRepository: Repository<SupportTicket>,
  ) { }

  async create(createSupportTicketDto: CreateSupportTicketDto) {
    try {
      // If no status is provided, default to PENDING
      if (!createSupportTicketDto.status) {
        createSupportTicketDto.status = SupportTicketStatus.PENDING;
      }

      const supportTicket = this.supportTicketRepository.create({
        ...createSupportTicketDto,
      });

      const savedTicket = await this.supportTicketRepository.save(supportTicket);

      // Build reference ticket number
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

  async findAll(filterDto: SupportTicketFilterDto) {
    const table = 'public.support_ticket';
    const { conditions, parameters } = this._buildConditionsAndParametersPg(filterDto);

    let queryInfo = `
    SELECT
      st."id",
      st."userId",
      st."requestType",
      st."message",
      st."status",
      st."emailClient",
      TO_CHAR(st."createdAt", 'YYYY-MM-DD"T"HH24:MI:SS.MS') AS "createdAt",
      TO_CHAR(st."updatedAt", 'YYYY-MM-DD"T"HH24:MI:SS.MS') AS "updatedAt",
      st."typeTicket"
    FROM ${table} st
    `;

    if (conditions.length > 0) {
      queryInfo += ' WHERE ' + conditions.join(' AND ');
    }

    queryInfo += ' ORDER BY st."createdAt" DESC';

    // SQL injection fix: parameterize LIMIT/OFFSET via $N placeholders and
    // coerce to safe non-negative integers instead of interpolating raw values.
    const safeLimit = Math.trunc(Number(filterDto.limit));
    if (Number.isFinite(safeLimit) && safeLimit > 0) {
      parameters.push(safeLimit);
      queryInfo += ` LIMIT $${parameters.length}`;
    }

    const safeOffset = Math.trunc(Number(filterDto.offset));
    if (Number.isFinite(safeOffset) && safeOffset > 0) {
      parameters.push(safeOffset);
      queryInfo += ` OFFSET $${parameters.length}`;
    }

    queryInfo += ';';

    try {
      const supportTickets = await this.supportTicketRepository.query(queryInfo, parameters);
      return { supportTickets, errorCode: ErrorCode.NONE };
    } catch (error) {
      handleDbExceptions(error, this.logger);
    }
  }

  async findAllTotal(filterDto: SupportTicketFilterDto) {
    const table = 'public.support_ticket';
    const { conditions, parameters } = this._buildConditionsAndParametersPg(filterDto);

    let queryInfo = `SELECT COUNT(*) as total FROM ${table} st`;

    if (conditions.length > 0) {
      queryInfo += ' WHERE ' + conditions.join(' AND ');
    }

    queryInfo += ';';

    try {
      const result = await this.supportTicketRepository.query(queryInfo, parameters);
      const total = result[0]?.total || 0;
      return { total: Number(total), errorCode: ErrorCode.NONE };
    } catch (error) {
      handleDbExceptions(error, this.logger);
    }
  }

  async findOne(id: number) {
    try {
      const supportTicket = await this.supportTicketRepository.findOne({ where: { id } });
      if (!supportTicket) {
        return { errorCode: ErrorCode.NOT_FOUND, supportTicket: null };
      }
      return { supportTicket, errorCode: ErrorCode.NONE };
    } catch (error) {
      handleDbExceptions(error, this.logger);
    }
  }

  async update(id: number, updateSupportTicketDto: UpdateSupportTicketDto) {
    try {
      const supportTicket = await this.supportTicketRepository.preload({
        id: id,
        ...updateSupportTicketDto,
      });

      if (supportTicket) {
        await this.supportTicketRepository.save(supportTicket);
        return { supportTicket, errorCode: ErrorCode.NONE };
      }

      return { errorCode: ErrorCode.NOT_FOUND, supportTicket: null };
    } catch (error) {
      handleDbExceptions(error, this.logger);
    }
  }

  async remove(id: number) {
    try {
      const supportTicket = await this.supportTicketRepository.findOne({ where: { id } });
      if (supportTicket) {
        // Soft delete: mark status as REJECTED
        supportTicket.status = SupportTicketStatus.REJECTED;
        await this.supportTicketRepository.save(supportTicket);
        return { supportTicket, errorCode: ErrorCode.NONE };
      }
      return { errorCode: ErrorCode.NOT_FOUND, supportTicket: null };
    } catch (error) {
      handleDbExceptions(error, this.logger);
    }
  }

  private _buildConditionsAndParametersPg(
    filterDto: SupportTicketFilterDto,
  ): { conditions: string[]; parameters: any[] } {
    const {
      search = '',
      userId,
      requestType,
      status,
      emailClient,
      dateFrom,
      dateTo,
      typeTicket,
    } = filterDto;

    const conditions: string[] = [];
    const parameters: any[] = [];

    const addParam = (value: any) => {
      parameters.push(value);
      return `$${parameters.length}`;
    };

    if (userId) {
      conditions.push(`st."userId" = ${addParam(userId)}`);
    }

    if (requestType) {
      conditions.push(`st."requestType" = ${addParam(requestType)}`);
    }

    if (status) {
      conditions.push(`st."status" = ${addParam(status)}`);
    }

    if (emailClient) {
      conditions.push(`st."emailClient" ILIKE ${addParam(`%${emailClient}%`)}`);
    }

    if (typeTicket) {
      conditions.push(`st."typeTicket" = ${addParam(typeTicket)}`);
    }

    if (search && search.trim() && search.trim() !== 'undefined' && search.trim() !== 'null' && search.trim() !== '') {
      conditions.push(`(st."message" ILIKE ${addParam(`%${search}%`)} OR st."emailClient" ILIKE ${addParam(`%${search}%`)})`);
    }

    if (dateFrom && dateTo) {
      conditions.push(`st."createdAt" BETWEEN ${addParam(dateFrom)} AND ${addParam(dateTo)}`);
    }

    return { conditions, parameters };
  }
}
