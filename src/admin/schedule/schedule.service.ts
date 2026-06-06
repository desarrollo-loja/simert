import { Inject, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import handleDbExceptions from 'src/common/exceptions/error.db.exception';
import { ErrorCode } from 'src/common/glob/error';
import { TypeOperation } from 'src/common/glob/type/type_operation';
import { LoggerService } from 'src/common/logger.service.ts';
import { Repository } from 'typeorm';

import { CreateScheduleDto } from './dto/create-schedule.dto';
import { UpdateScheduleDto } from './dto/update-schedule.dto';
import { Schedule } from './entities/schedule.entity';

/**
 * Service for managing Schedule records — the weekly opening/closing hour
 * definitions per Block. Provides bulk creation (one per day of the week)
 * and CRUD operations with audit logging via {@link LoggerService}.
 */
@Injectable()
export class ScheduleService {
  private readonly logger = new Logger('ScheduleService');

  /**
   *
   * @param scheduleRepository
   * @param loggerService
   */
  constructor(
    @InjectRepository(Schedule)
    private readonly scheduleRepository: Repository<Schedule>,

    @Inject(LoggerService)
    private readonly loggerService: LoggerService,
  ) {}

  /**
   * Bulk-creates schedule entries from the dataSchedules array in the DTO.
   * Each entry is saved independently and an audit log is emitted per entry.
   *
   * @param userId - ID of the user performing the operation.
   * @param createScheduleDto - DTO containing the dataSchedules array.
   * @returns Object with errorCode NONE on success.
   */
  async create(userId: number, createScheduleDto: CreateScheduleDto) {
    try {
      createScheduleDto.dataSchedules.forEach((scheduleEntry) => {
        const blockSchedule = this.scheduleRepository.create({
          ...scheduleEntry,
        });
        this.scheduleRepository.save(blockSchedule);
        this.loggerService.saveScheduleBlockLogger({
          id: blockSchedule.id,
          userId,
          typeOperation: TypeOperation.CREATE,
          blockSchedule,
        });
      });
      return { errorCode: ErrorCode.NONE };
    } catch (error) {
      handleDbExceptions(error, this.logger);
    }
  }

  /**
   * Returns all schedules for the given block, ordered by dayOfWeekInit ascending.
   *
   * @param blockId - Numeric ID of the block.
   * @returns Object with errorCode and blockSchedule array, or NOT_FOUND if empty.
   */
  async findAllScheduleByBlock(blockId: number) {
    try {
      const blockSchedule = await this.scheduleRepository
        .createQueryBuilder('sc')
        .select([
          'sc.id',
          'sc.isActivated',
          'sc.dayOfWeekInit',
          'sc.dayOfWeekEnd',
          'sc.openingTime',
          'sc.closingTime',
        ])
        .where('sc.blockId = :blockId', { blockId })
        .orderBy('sc.dayOfWeekInit', 'ASC')
        .getMany();

      if (blockSchedule.length > 0) {
        return { errorCode: ErrorCode.NONE, blockSchedule };
      }

      return { errorCode: ErrorCode.NOT_FOUND };
    } catch (error) {
      handleDbExceptions(error, this.logger);
    }
  }

  /**
   * Activates or deactivates a single schedule entry by id.
   *
   * @param userId - ID of the user performing the operation.
   * @param id - Numeric ID of the schedule entry.
   * @param updateScheduleDto - DTO with the updated isActivated flag.
   * @returns Object with errorCode and updated blockSchedule, or NOT_FOUND.
   */
  async updateActive(
    userId: number,
    id: number,
    updateScheduleDto: UpdateScheduleDto,
  ) {
    try {
      const blockSchedule = await this.scheduleRepository.preload({
        id,
        ...updateScheduleDto,
      });
      if (blockSchedule) {
        await this.scheduleRepository.save(blockSchedule);
        this.loggerService.saveScheduleBlockLogger({
          id: blockSchedule.id,
          userId,
          typeOperation: TypeOperation.UPDATE,
          blockSchedule,
        });
        return { errorCode: ErrorCode.NONE, blockSchedule };
      }

      return { errorCode: ErrorCode.NOT_FOUND };
    } catch (error) {
      handleDbExceptions(error, this.logger);
    }
  }

  /**
   * Bulk-updates schedule entries from the dataSchedules array in the DTO.
   * Each entry is preloaded by id and saved independently.
   *
   * @param userId - ID of the user performing the operation.
   * @param updateScheduleDto - DTO containing the dataSchedules array with ids.
   * @returns Object with errorCode NONE on success.
   */
  async update(userId: number, updateScheduleDto: UpdateScheduleDto) {
    try {
      updateScheduleDto.dataSchedules.forEach(async (scheduleEntry) => {
        const { id } = scheduleEntry;
        const blockSchedule = await this.scheduleRepository.preload({
          id,
          ...scheduleEntry,
        });
        if (blockSchedule) {
          this.scheduleRepository.save(blockSchedule);
          this.loggerService.saveScheduleBlockLogger({
            id: blockSchedule.id,
            userId,
            typeOperation: TypeOperation.UPDATE,
            blockSchedule,
          });
        }
      });
      return { errorCode: ErrorCode.NONE };
    } catch (error) {
      handleDbExceptions(error, this.logger);
    }
  }
}
