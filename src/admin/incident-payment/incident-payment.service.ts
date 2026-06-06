import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { FilterDto } from 'src/common/dto/filter.dto';
import handleDbExceptions from 'src/common/exceptions/error.db.exception';
import { ErrorCode } from 'src/common/glob/error';
import { In, Repository } from 'typeorm';

import { IncidentPayment } from './entities/incident-payment.entity';

/**
 * Service for querying IncidentPayment records — the payment details
 * (provider response, transaction id, optional data) attached to an
 * incident fine. Supports batch lookups by transaction IDs.
 */
@Injectable()
export class IncidentPaymentService {
  private readonly logger = new Logger(IncidentPaymentService.name);

  /**
   *
   * @param incidentPaymentRepository
   */
  constructor(
    @InjectRepository(IncidentPayment)
    private readonly incidentPaymentRepository: Repository<IncidentPayment>,
  ) {}

  /**
   * Returns id, transactionId and optionalData for incident payments
   * whose transactionId is in the list supplied via filterDto.transactionIds.
   *
   * @param filterDto - Filter containing the transactionIds array to look up.
   * @returns Object with errorCode and matching incidentPayments array.
   */
  async findAllByTransactionId(filterDto: FilterDto) {
    const { transactionIds } = filterDto;

    if (!Array.isArray(transactionIds) || transactionIds.length === 0) {
      return { errorCode: ErrorCode.NONE, incidentPayments: [] };
    }

    try {
      const incidentPayments = await this.incidentPaymentRepository.find({
        select: ['id', 'transactionId', 'optionalData'],
        where: { transactionId: In(transactionIds) },
        order: { id: 'DESC' },
      });

      return { errorCode: ErrorCode.NONE, incidentPayments };
    } catch (error) {
      handleDbExceptions(error, this.logger);
    }
  }
}
