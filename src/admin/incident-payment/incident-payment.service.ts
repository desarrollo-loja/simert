import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { FilterDto } from 'src/common/dto/filter.dto';
import handleDbExceptions from 'src/common/exceptions/error.db.exception';
import { ErrorCode } from 'src/common/glob/error';
import { In, Repository } from 'typeorm';

import { IncidentPayment } from './entities/incident-payment.entity';

@Injectable()
export class IncidentPaymentService {
  private readonly logger = new Logger(IncidentPaymentService.name);

  constructor(
    @InjectRepository(IncidentPayment)
    private readonly incidentPaymentRepository: Repository<IncidentPayment>,
  ) {}

  // Devuelve id, transactionId y optionalData de los pagos de incidencias
  // cuyo transactionId esté dentro de la lista recibida en filterDto.transactionIds.
  async findAllByTransactionId(filterDto: FilterDto) {
    const { transactionIds } = filterDto;

    // Sin al menos un transactionId no hay nada que consultar.
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
