import { Inject, Injectable } from '@nestjs/common';
import { Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { AgentActivity } from 'src/admin/agent-activities/entities/agent-activity.entity';
import { UpdateBlockOperatorDto } from 'src/admin/block_operator/dto/update-block_operator.dto';
import { BlockOperator } from 'src/admin/block_operator/entities/block_operator.entity';
import { FilterDto } from 'src/common/dto/filter.dto';
import handleDbExceptions from 'src/common/exceptions/error.db.exception';
import { ErrorCode } from 'src/common/glob/error';
import { TypeActivity } from 'src/common/glob/type/type_activity';
import { TypeOperation } from 'src/common/glob/type/type_operation';
import { LoggerService } from 'src/common/logger.service.ts';
import { Repository } from 'typeorm';

import { CreateAgentActivityDto } from './dto/create-agent-activity.dto';
import { UpdateAgentActivityDto } from './dto/update-agent-activity.dto';

/**
 * Client-facing service for agent activity tracking. Manages creation of
 * {@link AgentActivity} entries (check-in / check-out / incidents) and
 * maintains the {@link BlockOperator} active-session state. Provides
 * paginated listing filtered by user, block and activity type.
 */
@Injectable()
export class AgentActivitiesService {
    private readonly logger = new Logger(AgentActivitiesService.name);

    /**
     * @param agentActivityRepository TypeORM repository for the AgentActivity entity.
     * @param blockOperatorRepository TypeORM repository for the BlockOperator entity.
     * @param loggerService Service used to persist audit log entries.
     */
    constructor(
        @InjectRepository(AgentActivity)
        private readonly agentActivityRepository: Repository<AgentActivity>,

        @InjectRepository(BlockOperator)
        private readonly blockOperatorRepository: Repository<BlockOperator>,

        @Inject(LoggerService)
        private readonly loggerService: LoggerService,
    ) {}

    /**
     * Creates an agent activity entry and updates the related BlockOperator session state.
     *
     * @param userId Authenticated user id performing the activity.
     * @param createAgentActivityDto Activity payload including type and location.
     * @returns Error-code envelope with the persisted {@link AgentActivity}.
     */
    async create(
        userId: number,
        createAgentActivityDto: CreateAgentActivityDto,
    ) {
        try {
            const dataBlockOperator = await this.findOneByBlockOperatorId({
                blockOperatorId: createAgentActivityDto.blockOperatorId,
            });
            if (dataBlockOperator.errorCode !== ErrorCode.NONE) {
                return { errorCode: ErrorCode.NOT_FOUND };
            }

            if (!dataBlockOperator.blockOperator) {
                return { errorCode: ErrorCode.NOT_FOUND };
            }

            const dataBlockOperatorOne = dataBlockOperator.blockOperator;
            const { isFinalized, isInitialized } = dataBlockOperatorOne;
            if (
                isFinalized &&
                createAgentActivityDto.type === TypeActivity.START_SHIFT
            ) {
                return {
                    errorCode: ErrorCode.BLOCK_OPERATOR_ALREADY_FINALIZED,
                };
            }

            if (
                isFinalized &&
                isInitialized &&
                createAgentActivityDto.type === TypeActivity.END_SHIFT
            ) {
                return {
                    errorCode:
                        ErrorCode.BLOCK_OPERATOR_ALREADY_INITIALIZED_AND_FINALIZED,
                };
            }
            const query = this.agentActivityRepository.create({
                ...createAgentActivityDto,
            });
            const agentActivity =
                await this.agentActivityRepository.save(query);
            this.loggerService.saveAgentActivitiesLogger({
                id: agentActivity.id,
                userId: userId,
                typeOperation: TypeOperation.CREATE,
                agentActivities: agentActivity,
            });
            let isInitializedSend = isInitialized;
            let isFinalizedSend = isFinalized;

            if (createAgentActivityDto.type === TypeActivity.START_SHIFT) {
                isInitializedSend = true;
            }
            if (createAgentActivityDto.type === TypeActivity.END_SHIFT) {
                isFinalizedSend = true;
            }

            const dataUpdateBlockOperator: UpdateBlockOperatorDto = {
                isInitialized: isInitializedSend,
                isFinalized: isFinalizedSend,
                ...(isInitializedSend &&
                    !isInitialized && { dateInitialized: new Date() }),
                ...(isFinalizedSend &&
                    !isFinalized && { dateFinalized: new Date() }),
            };

            const blockOperator = await this.blockOperatorRepository.preload({
                id: createAgentActivityDto.blockOperatorId,
                ...dataUpdateBlockOperator,
            });
            if (blockOperator) {
                await this.blockOperatorRepository.save(blockOperator);
                this.loggerService.saveBlockOperatorLogger({
                    id: blockOperator.id,
                    userId,
                    typeOperation: TypeOperation.UPDATE,
                    blockOperator,
                });
            }
            return { errorCode: ErrorCode.NONE, agentActivity };
        } catch (error) {
            handleDbExceptions(error, this.logger);
        }
    }

    /**
     * Finds a single BlockOperator by its primary key.
     *
     * @param filterDto Filter containing the `blockOperatorId` to look up.
     * @returns Error-code envelope with the matching {@link BlockOperator} or undefined.
     */
    async findOneByBlockOperatorId(filterDto: FilterDto) {
        const { blockOperatorId } = filterDto;
        try {
            const blockOperator = await this.blockOperatorRepository
                .createQueryBuilder('bo')
                .select([
                    'bo.id',
                    'bo.isActivated',
                    'bo.isInitialized',
                    'bo.isFinalized',
                ])
                .where('bo.id = :blockOperatorId', { blockOperatorId })
                .getOne();

            return { errorCode: ErrorCode.NONE, blockOperator };
        } catch (error) {
            handleDbExceptions(error, this.logger);
        }
    }

    /**
     * Updates an existing agent activity entry.
     *
     * @param userId Authenticated user id performing the update.
     * @param id Primary key of the activity to update.
     * @param updateAgentActivityDto Partial activity payload.
     * @returns Error-code envelope with the updated {@link AgentActivity}.
     */
    async update(
        userId: number,
        id: number,
        updateAgentActivityDto: UpdateAgentActivityDto,
    ) {
        try {
            const agentActivity = await this.agentActivityRepository.preload({
                id,
                ...updateAgentActivityDto,
            });
            if (agentActivity) {
                await this.agentActivityRepository.save(agentActivity);
                this.loggerService.saveAgentActivitiesLogger({
                    id: agentActivity.id,
                    userId: userId,
                    typeOperation: TypeOperation.UPDATE,
                    agentActivities: agentActivity,
                });
                return { errorCode: ErrorCode.NONE, agentActivity };
            }
        } catch (error) {
            handleDbExceptions(error, this.logger);
        }
    }
}
