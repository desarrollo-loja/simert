import { Inject, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { CheckboxUser } from 'src/admin/checkbox-user/entities/checkbox-user.entity';
import { RangeSalePoint } from 'src/admin/range-sale-point/entities/range-sale-point.entity';
import { RangeSalePointTransaction } from 'src/admin/range-sale-point-transaction/entities/range-sale-point-transaction.entity';
import { FilterDto } from 'src/common/dto/filter.dto';
import handleDbExceptions from 'src/common/exceptions/error.db.exception';
import { ErrorCode } from 'src/common/glob/error';
import { LoggerService } from 'src/common/logger.service.ts';
import { DataSource, Repository } from 'typeorm';

import { CreateRangeSalePointTransactionDto } from './dto/create-range-sale-point-transaction.dto';

@Injectable()
export class RangeSalePointTransactionService {
    private readonly logger = new Logger('RangeSalePointTransactionService');

    constructor(
        @InjectRepository(RangeSalePointTransaction)
        private readonly rangeSalePointTransactionRepository: Repository<RangeSalePointTransaction>,

        @InjectRepository(RangeSalePoint)
        private readonly rangeSalePointRepository: Repository<RangeSalePoint>,

        @InjectRepository(CheckboxUser)
        private readonly checkboxUserRepository: Repository<CheckboxUser>,

        @Inject(LoggerService)
        private readonly loggerService: LoggerService,

        private readonly dataSource: DataSource,
    ) { }

    async create(userId: number, createRangeSalePointTransactionDto: CreateRangeSalePointTransactionDto) {

        const queryRunner = this.dataSource.createQueryRunner();

        const { rangeSalePointId, amount, userIdBuy, userIdSell } = createRangeSalePointTransactionDto;

        const rangeSalePoint = await this.rangeSalePointRepository.createQueryBuilder('rsp')
            .select(['rsp.id', 'rsp.sold', 'salePoint.id'])
            .innerJoin('rsp.salePoint', 'salePoint')
            .where('rsp.id = :rangeSalePointId', { rangeSalePointId })
            .getOne();

        if (!rangeSalePoint)
            return { errorCode: ErrorCode.NOT_FOUND, message: 'No se encontro el rango de venta' };

        if (rangeSalePoint.sold - amount < 0)
            return { errorCode: ErrorCode.NOT_FOUND, message: 'No hay valores suficientes para la venta' };

        try {

            await queryRunner.connect();
            await queryRunner.startTransaction();

            const rangeSalePointLock = await queryRunner.manager
                .createQueryBuilder()
                .select("rsp")
                .from(RangeSalePoint, "rsp")
                .where('rsp.id = :rangeSalePointId', { rangeSalePointId: rangeSalePoint.id })
                .setLock("pessimistic_write") // Bloqueo de escritura
                .getOne();

            if (!rangeSalePointLock) {
                throw new Error('REJECTED');
            }

            // Crear la transacción
            const transactionRangeSalePoint = this.rangeSalePointTransactionRepository.create({
                userIdBuy: userIdBuy,
                userIdSell: userIdSell,
                amount: amount,
                rangeSalePoint: rangeSalePoint,
            });

            await queryRunner.manager.save(transactionRangeSalePoint);

            rangeSalePointLock.sold -= amount;
            await queryRunner.manager.save(rangeSalePointLock);

            const spaceCard: number = 12;
            const totalSpaceCard: number = amount * spaceCard;

            const checkboxUser = await this.checkboxUserRepository.findOne({
                where: { userId: userIdBuy }
            });

            if (checkboxUser) {
                checkboxUser.checkboxes += totalSpaceCard;
                await queryRunner.manager.save(checkboxUser);
            } else {
                const checkboxUser = await this.checkboxUserRepository.create({
                    userId: userIdBuy,
                    checkboxes: totalSpaceCard,
                });
                await queryRunner.manager.save(checkboxUser);
            }

            await queryRunner.commitTransaction();
            return { errorCode: ErrorCode.NONE, message: 'Transaccion exitosa', rangeSalePointTransaction: transactionRangeSalePoint, rangeSalePoint: rangeSalePointLock }

        } catch (error) {
            await queryRunner.rollbackTransaction();
            handleDbExceptions(error, this.logger);
        } finally {
            await queryRunner.release();
        }
        return { errorCode: ErrorCode.NOT_VALID, message: 'Ocurrio un error al crear la transaccion' }

    }

    private _buildConditionsAndParameters(filterDto: FilterDto) {
        const { userId } = filterDto;
        const conditions: string[] = [];
        const parameters: Record<string, any> = {};

        if (userId) {
            conditions.push('rsp.userId = :userId');
            parameters['userId'] = userId;
        }

        return { conditions, parameters };
    }
}
