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

/**
 * Admin-side service for managing SupportTicket records — user-submitted
 * help requests. Provides creation (with automatic PENDING default), paginated
 * listing/filtering, status transitions and deletion.
 */
@Injectable()
export class SupportTicketService {
  private readonly logger = new Logger(SupportTicketService.name);

  /**
   * Creates the service with the injected `SupportTicket` entity repository.
   *
   * @param supportTicketRepository - TypeORM repository for the `SupportTicket` entity.
   */
  constructor(
    @InjectRepository(SupportTicket)
    private readonly supportTicketRepository: Repository<SupportTicket>,
  ) {}

  /**
   * Creates a new support ticket. Defaults status to PENDING when not provided.
   * Returns the saved ticket with a formatted reference number (e.g. ST-000042).
   *
   * @param createSupportTicketDto - DTO with ticket fields.
   * @returns Object with errorCode, savedTicket, formatted ticketNumber, and message.
   */
  async create(createSupportTicketDto: CreateSupportTicketDto) {
    try {
      if (!createSupportTicketDto.status) {
        createSupportTicketDto.status = SupportTicketStatus.PENDING;
      }

      const supportTicket = this.supportTicketRepository.create({
        ...createSupportTicketDto,
      });
      const savedTicket =
        await this.supportTicketRepository.save(supportTicket);

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

  /**
   * Returns a paginated list of support tickets matching the given filters.
   * Timestamps are formatted with TO_CHAR to avoid UTC-Z serialization.
   *
   * @param filterDto - Filters (userId, requestType, status, emailClient,
   *   typeTicket, search, dateFrom/dateTo, limit, offset).
   * @returns Object with errorCode and the supportTickets array.
   */
  async findAll(filterDto: SupportTicketFilterDto) {
    const { conditions, parameters } = this._buildSqlConditions(filterDto);

    let sql = `
    SELECT
      st."id",
      st."userId",
      st."requestType",
      st."message",
      st."status",
      st."emailClient",
      st."image",
      TO_CHAR(st."createdAt", 'YYYY-MM-DD"T"HH24:MI:SS.MS') AS "createdAt",
      TO_CHAR(st."updatedAt", 'YYYY-MM-DD"T"HH24:MI:SS.MS') AS "updatedAt",
      st."typeTicket"
    FROM public."supportTicket" st
    `;

    if (conditions.length > 0) {
      sql += ' WHERE ' + conditions.join(' AND ');
    }

    sql += ' ORDER BY st."createdAt" DESC';

    // Parameterize LIMIT/OFFSET to prevent SQL injection.
    const safeLimit = Math.trunc(Number(filterDto.limit));
    if (Number.isFinite(safeLimit) && safeLimit > 0) {
      parameters.push(safeLimit);
      sql += ` LIMIT $${parameters.length}`;
    }

    const safeOffset = Math.trunc(Number(filterDto.offset));
    if (Number.isFinite(safeOffset) && safeOffset > 0) {
      parameters.push(safeOffset);
      sql += ` OFFSET $${parameters.length}`;
    }

    sql += ';';

    try {
      const supportTickets = await this.supportTicketRepository.query(
        sql,
        parameters,
      );
      return { supportTickets, errorCode: ErrorCode.NONE };
    } catch (error) {
      handleDbExceptions(error, this.logger);
    }
  }

  /**
   * Returns the total count of support tickets matching the given filters.
   *
   * @param filterDto - Same filter options as findAll (pagination fields ignored).
   * @returns Object with total count and errorCode.
   */
  async findAllTotal(filterDto: SupportTicketFilterDto) {
    const { conditions, parameters } = this._buildSqlConditions(filterDto);

    let sql = `SELECT COUNT(*) as total FROM public."supportTicket" st`;

    if (conditions.length > 0) {
      sql += ' WHERE ' + conditions.join(' AND ');
    }

    sql += ';';

    try {
      const result = await this.supportTicketRepository.query(sql, parameters);
      const total = result[0]?.total || 0;
      return { total: Number(total), errorCode: ErrorCode.NONE };
    } catch (error) {
      handleDbExceptions(error, this.logger);
    }
  }

  /**
   * Returns a single support ticket by id, or NOT_FOUND if absent.
   *
   * @param id - Numeric ID of the ticket.
   * @returns Object with errorCode and the supportTicket (or null).
   */
  async findOne(id: number) {
    try {
      const result = await this.supportTicketRepository
        .createQueryBuilder('st')
        .addSelect(
          `TO_CHAR(st."createdAt", 'YYYY-MM-DD"T"HH24:MI:SS.MS')`,
          'st_createdAt',
        )
        .addSelect(
          `TO_CHAR(st."updatedAt", 'YYYY-MM-DD"T"HH24:MI:SS.MS')`,
          'st_updatedAt',
        )
        .where('st.id = :id', { id })
        .getRawAndEntities();

      const entity = result.entities[0];
      if (!entity) {
        return { errorCode: ErrorCode.NOT_FOUND, supportTicket: null };
      }
      const supportTicket = {
        ...entity,
        createdAt: result.raw[0]?.st_createdAt ?? null,
        updatedAt: result.raw[0]?.st_updatedAt ?? null,
      };
      return { supportTicket, errorCode: ErrorCode.NONE };
    } catch (error) {
      handleDbExceptions(error, this.logger);
    }
  }

  /**
   * Updates a support ticket by id with the supplied fields.
   *
   * @param id - Numeric ID of the ticket to update.
   * @param updateSupportTicketDto - Partial DTO with updated fields.
   * @returns Object with errorCode and the updated supportTicket (or NOT_FOUND).
   */
  async update(id: number, updateSupportTicketDto: UpdateSupportTicketDto) {
    try {
      const supportTicket = await this.supportTicketRepository.preload({
        id,
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

  /**
   * Soft-deletes a support ticket by setting its status to REJECTED.
   *
   * @param id - Numeric ID of the ticket to remove.
   * @returns Object with errorCode and the updated supportTicket (or NOT_FOUND).
   */
  async remove(id: number) {
    try {
      const supportTicket = await this.supportTicketRepository.findOne({
        where: { id },
      });
      if (supportTicket) {
        supportTicket.status = SupportTicketStatus.REJECTED;
        await this.supportTicketRepository.save(supportTicket);
        return { supportTicket, errorCode: ErrorCode.NONE };
      }
      return { errorCode: ErrorCode.NOT_FOUND, supportTicket: null };
    } catch (error) {
      handleDbExceptions(error, this.logger);
    }
  }

  /**
   * Builds a positional-parameter SQL WHERE fragment from the filter DTO.
   * Used by both {@link findAll} and {@link findAllTotal}.
   *
   * @param filterDto - Filter options to translate into SQL conditions.
   * @returns Object with conditions array and positional parameters array.
   */
  private _buildSqlConditions(filterDto: SupportTicketFilterDto): {
    conditions: string[];
    parameters: any[];
  } {
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

    const addParam = (value: any): string => {
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

    // Guard on the trimmed value, but keep the raw `search` in the ILIKE
    // pattern to preserve the original matching behavior for whitespace.
    const trimmedSearch = search?.trim();
    if (
      trimmedSearch &&
      trimmedSearch !== 'undefined' &&
      trimmedSearch !== 'null'
    ) {
      conditions.push(
        `(st."message" ILIKE ${addParam(`%${search}%`)} OR st."emailClient" ILIKE ${addParam(`%${search}%`)})`,
      );
    }

    if (dateFrom && dateTo) {
      conditions.push(
        `st."createdAt" BETWEEN ${addParam(dateFrom)} AND ${addParam(dateTo)}`,
      );
    }

    return { conditions, parameters };
  }
}
