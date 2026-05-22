import { Inject, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { RangeSalePoint } from 'src/admin/range-sale-point/entities/range-sale-point.entity';
import { FilterDto } from 'src/common/dto/filter.dto';
import handleDbExceptions from 'src/common/exceptions/error.db.exception';
import { ErrorCode } from 'src/common/glob/error';
import { LoggerService } from 'src/common/logger.service.ts';
import { DataSource, Repository } from 'typeorm';

import { CheckboxUser } from '../checkbox-user/entities/checkbox-user.entity';
import { CreateRangeSalePointTransactionDto } from './dto/create-range-sale-point-transaction.dto';
import { RangeSalePointTransaction } from './entities/range-sale-point-transaction.entity';

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

    async findAll(filterDto: FilterDto) {
        try {
            let tableName = 'public.range_sale_point_transaction';
            const { conditions, parameters } = this._buildConditionsAndParameters(filterDto);
            let queryInfo = `
                SELECT 
                    rspt.id, rspt."userIdSell", rspt."userIdBuy", rspt.amount,
                    TO_CHAR(rspt."createdAt", 'YYYY-MM-DD"T"HH24:MI:SS.MS') AS "createdAt",
                    rsp.id, rsp."available", rsp.sold, rsp.description,
                    sp.id, sp.title, sp."subTitle", sp.type, sp.mode
                FROM ${tableName} rspt
                INNER JOIN public.range_sale_point rsp ON rsp.id = rspt."rangeSalePointId"
                INNER JOIN public.sale_point sp ON sp.id = rsp."salePointId" `;

            if (conditions.length > 0) {
                queryInfo += ' WHERE ' + conditions.join(' AND ');
            }

            queryInfo += ' ORDER BY rspt.id DESC';

            // Defense-in-depth: coerce limit/offset to safe non-negative integers
            // and parameterize them rather than interpolating raw values.
            if (filterDto.limit !== undefined && filterDto.limit !== null) {
                const safeLimit = Math.max(0, Math.floor(Number(filterDto.limit)) || 0);
                parameters.push(safeLimit);
                queryInfo += ` LIMIT $${parameters.length}`;
            }

            if (filterDto.offset !== undefined && filterDto.offset !== null) {
                const safeOffset = Math.max(0, Math.floor(Number(filterDto.offset)) || 0);
                parameters.push(safeOffset);
                queryInfo += ` OFFSET $${parameters.length}`;
            }

            const transactions = await this.rangeSalePointTransactionRepository.query(queryInfo, parameters);
            return { errorCode: ErrorCode.NONE, transactions }

        } catch (error) {
            handleDbExceptions(error, this.logger);
        }
    }

    async countAll(filterDto: FilterDto) {
        const table = 'public.range_sale_point_transaction';
        const { conditions, parameters } = this._buildConditionsAndParameters(filterDto);

        // Mismos joins que findAll: el builder de condiciones puede referenciar el
        // alias `rsp` (p. ej. filtro salePointId), por lo que debe existir en el FROM.
        // Mantiene además el conteo consistente con el listado.
        let queryInfo = `SELECT COUNT(*) as total FROM ${table} rspt
            INNER JOIN public.range_sale_point rsp ON rsp.id = rspt."rangeSalePointId"
            INNER JOIN public.sale_point sp ON sp.id = rsp."salePointId"`;

        if (conditions.length > 0) {
            queryInfo += ' WHERE ' + conditions.join(' AND ');
        }

        queryInfo += ';';
        try {
            const result = await this.rangeSalePointTransactionRepository.query(queryInfo, parameters);
            const total = result[0]?.total || 0;
            return { total: Number(total), errorCode: ErrorCode.NONE };
        } catch (error) {
            handleDbExceptions(error, this.logger);
        }
    }

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
                .setLock("pessimistic_write") // Write lock
                .getOne();

            if (!rangeSalePointLock) {
                throw new Error('REJECTED');
            }

            // Create the transaction
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

    private _buildConditionsAndParameters(filterDto: FilterDto): { conditions: string[]; parameters: any[] } {
        const { userId, userIdBuy, userIdSell, rangeSalePointId, dateFrom, dateTo, salePointId } = filterDto;
        const conditions: string[] = [];
        const parameters: any[] = [];

        const addParam = (value: any) => {
            parameters.push(value);
            return `$${parameters.length}`;
        };

        if (userId) {
            conditions.push(`rspt."userIdBuy" = ${addParam(userId)}`);
        }

        if (userIdBuy) {
            conditions.push(`rspt."userIdBuy" = ${addParam(userIdBuy)}`);
        }

        if (userIdSell) {
            conditions.push(`rspt."userIdSell" = ${addParam(userIdSell)}`);
        }

        if (rangeSalePointId) {
            conditions.push(`rspt."rangeSalePointId" = ${addParam(rangeSalePointId)}`);
        }

        if (salePointId) {
            conditions.push(`rsp."salePointId" = ${addParam(salePointId)}`);
        }

        if (dateFrom && dateTo) {
            conditions.push(`rspt."createdAt" BETWEEN ${addParam(dateFrom)} AND ${addParam(dateTo)}`);
        }

        return { conditions, parameters };
    }
}
