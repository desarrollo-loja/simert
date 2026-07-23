import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { FilterDto } from 'src/common/dto/filter.dto';
import handleDbExceptions from 'src/common/exceptions/error.db.exception';
import { Repository } from 'typeorm';

import { FractionStatus } from './entities/fraction_status.entity';

/**
 * Service for querying FractionStatus records — the status history of a
 * parking Fraction. Supports reading from both the live `fraction_status`
 * table and monthly historical tables (e.g. `2025_03_fraction_status`).
 */
@Injectable()
export class FractionStatusService {
    private readonly logger = new Logger('FractionStatusService');

    /**
     * Creates a new {@link FractionStatusService}.
     *
     * @param fractionStatusRepository Repository for the {@link FractionStatus} entity.
     */
    constructor(
        @InjectRepository(FractionStatus)
        private readonly fractionStatusRepository: Repository<FractionStatus>,
    ) {}

    /**
     * Returns all status-history entries for a given fraction, optionally
     * reading from a monthly historical table.
     *
     * Source-table routing:
     * - No `year`/`month` in filterDto -> live `fraction_status` table.
     * - Valid period supplied -> `<year>_<month>_fraction_status` (historical).
     *   Invalid or out-of-range values are silently ignored and the live
     *   table is used instead.
     *
     * The `fractionId` URL parameter is coerced to a safe integer before being
     * bound as a positional parameter to prevent SQL injection.
     *
     * @param fractionId ID of the fraction whose status history to return.
     * @param filterDto Optional filters including `year` and `month` for
     *   historical table routing.
     * @returns `{ fractionStatus }` array of status entries joined with the
     *   `status` table for the human-readable label.
     * @throws Delegates DB errors to {@link handleDbExceptions}.
     */
    async findAllFractionState(
        fractionId: number | string,
        filterDto: FilterDto,
    ) {
        const { year, month } = filterDto;
        try {
            // Live table uses an explicit double-quoted camelCase identifier so PostgreSQL
            // preserves the casing (unquoted it would be folded to lowercase and not found).
            let tableName = `public."fractionStatus"`;
            // Defense-in-depth: validate year/month as integers in expected ranges
            // before interpolating into the table identifier.
            if (year && month) {
                const y = Number(year);
                const m = Number(month);
                if (
                    Number.isInteger(y) &&
                    y >= 2000 &&
                    y <= 2100 &&
                    Number.isInteger(m) &&
                    m >= 1 &&
                    m <= 12
                ) {
                    // Historical partition names start with a digit, so they must be double-quoted.
                    tableName = `"${y}_${m}_fraction_status"`;
                }
            }
            // Parameterized fractionId to prevent SQL injection via URL param.
            const safeFractionId = Math.trunc(Number(fractionId));
            if (!Number.isFinite(safeFractionId)) {
                return { fractionStatus: [] };
            }
            const query = `
            SELECT fs.id,
            fs.moment,
            TO_CHAR(fs."createdAt", 'YYYY-MM-DD"T"HH24:MI:SS.MS') AS "createdAt",
            s.name as statusLabel
            FROM ${tableName} AS fs
            INNER JOIN status s ON s.id=fs."statusId"
            WHERE fs."fractionId" =  $1
          `;
            const fractionStatus = await this.fractionStatusRepository.query(
                query,
                [safeFractionId],
            );
            return { fractionStatus };
        } catch (error) {
            handleDbExceptions(error, this.logger);
        }
    }
}
