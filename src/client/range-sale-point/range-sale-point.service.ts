import { Inject, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { RangeSalePoint } from 'src/admin/range-sale-point/entities/range-sale-point.entity';
import handleDbExceptions from 'src/common/exceptions/error.db.exception';
import { ErrorCode } from 'src/common/glob/error';
import { LoggerService } from 'src/common/logger.service.ts';
import { MoreThan, Repository } from 'typeorm';

/**
 * Client-facing service for RangeSalePoint. Provides the lookup used by
 * mobile clients to find an available checkbox batch assigned to a given
 * user (agent/operator) so they can sell parking time.
 */
@Injectable()
export class RangeSalePointService {
    private readonly logger = new Logger(RangeSalePointService.name);

    /**
     * Creates the service with its required dependencies.
     *
     * @param rangeSalePointRepository TypeORM repository for the RangeSalePoint entity.
     * @param loggerService Shared logging service.
     */
    constructor(
        @InjectRepository(RangeSalePoint)
        private readonly rangeSalePointRepository: Repository<RangeSalePoint>,

        @Inject(LoggerService)
        private readonly loggerService: LoggerService,
    ) {}

    /**
     * Finds the oldest range sale point with available stock assigned to the
     * given user so the client can sell parking time from it.
     *
     * @param userId Identifier of the user (agent/operator) the batch is assigned to.
     * @returns Promise resolving to the matching range sale point (or an empty object
     *   when none is found) and an error code.
     */
    async getRangeSalePointByUserId(userId: number) {
        try {
            const rangeSalePoint = await this.rangeSalePointRepository.findOne({
                where: {
                    userId,
                    // available: MoreThan(0), // number of cards purchased
                    sold: MoreThan(0), // available stock
                },
                order: {
                    createdAt: 'ASC', // oldest first
                },
                select: ['sold', 'id'], // select available stock
            });

            if (!rangeSalePoint)
                return { rangeSalePoint: {}, errorCode: ErrorCode.NONE };

            return { rangeSalePoint, errorCode: ErrorCode.NONE };
        } catch (error) {
            handleDbExceptions(error, this.logger);
        }
    }
}
