import { Inject, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IncidentType } from 'src/admin/incident-type/entities/incident-type.entity';
import handleDbExceptions from 'src/common/exceptions/error.db.exception';
import { ErrorCode } from 'src/common/glob/error';
import { LoggerService } from 'src/common/logger.service.ts';
import { Repository } from 'typeorm';

/**
 * Client-facing service for IncidentType lookups. Returns only active
 * incident types used to populate fine-category selectors in mobile apps.
 */
@Injectable()
export class IncidentTypeService {

  private readonly logger = new Logger(IncidentTypeService.name);

  constructor(
    @InjectRepository(IncidentType)
    private readonly incidentTypeRepository: Repository<IncidentType>,

    @Inject(LoggerService)
    private readonly loggerService: LoggerService,
  ) { }

  async getIncidentType() {
    try {
      const incidentTypes = await this.incidentTypeRepository.find({
        where: { isActivated: true },
        order: { createdAt: 'DESC' },
      });

      return { incidentTypes, errorCode: ErrorCode.NONE };
    } catch (error) {
      handleDbExceptions(error, this.logger);
    }
  }

}
