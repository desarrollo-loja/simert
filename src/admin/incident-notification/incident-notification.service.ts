import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import handleDbExceptions from 'src/common/exceptions/error.db.exception';
import { ErrorCode } from 'src/common/glob/error';
import { Repository } from 'typeorm';

import { CreateIncidentNotificationDto } from './dto/create-incident-notification.dto';
import { UpdateIncidentNotificationDto } from './dto/update-incident-notification.dto';
import { IncidentNotification } from './entities/incident-notification.entity';

/**
 * Service for managing IncidentNotification records — push/email
 * notification entries linked to an incident. Provides creation and basic
 * lookup for the admin panel.
 */
@Injectable()
export class IncidentNotificationService {
  private readonly logger = new Logger(IncidentNotificationService.name);

  constructor(
    @InjectRepository(IncidentNotification)
    private readonly incidentNotificationRepository: Repository<IncidentNotification>,
  ) { }

  /**
   * Creates a new incident notification record.
   *
   * @param createIncidentNotificationDto Fields for the new notification.
   * @returns `{ incidentNotification, errorCode: NONE }` on success.
   * @throws Delegates DB errors to {@link handleDbExceptions}.
   */
  async create(createIncidentNotificationDto: CreateIncidentNotificationDto) {
    try {
      const incidentNotification = this.incidentNotificationRepository.create({ ...createIncidentNotificationDto });
      return { incidentNotification, errorCode: ErrorCode.NONE };
    } catch (error) {
      handleDbExceptions(error, this.logger);
    }
  }

  /**
   * Returns all incident notifications.
   *
   * @returns Placeholder string — full implementation pending.
   */
  findAll() {
    return `This action returns all incidentNotification`;
  }

  /**
   * Returns a single incident notification by id.
   *
   * @param id ID of the notification to retrieve.
   * @returns Placeholder string — full implementation pending.
   */
  findOne(id: number) {
    return `This action returns a #${id} incidentNotification`;
  }

  /**
   * Updates an existing incident notification by id.
   *
   * @param id ID of the notification to update.
   * @param updateIncidentNotificationDto Partial fields to apply.
   * @returns `{ errorCode: NONE, incidentNotification }` on success, or
   *   `undefined` when the record does not exist.
   * @throws Delegates DB errors to {@link handleDbExceptions}.
   */
  async update(id: number, updateIncidentNotificationDto: UpdateIncidentNotificationDto) {
    try {
      const incidentNotification = await this.incidentNotificationRepository.preload({ id, ...updateIncidentNotificationDto });
      if (incidentNotification) {
        await this.incidentNotificationRepository.save(incidentNotification);
        return { errorCode: ErrorCode.NONE, incidentNotification };
      }
    } catch (error) {
      handleDbExceptions(error, this.logger);
    }
  }

  /**
   * Removes an incident notification by id.
   *
   * @param id ID of the notification to remove.
   * @returns Placeholder string — full implementation pending.
   */
  remove(id: number) {
    return `This action removes a #${id} incidentNotification`;
  }
}
