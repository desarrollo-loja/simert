import { Type } from 'class-transformer';
import { IsEnum, IsNumber, IsOptional, IsString, Min } from 'class-validator';

import { ConceptPaidObligation } from '../interfaces/gim-responses.interfaces';

/**
 * Query filter for the GIM `simert/paid-obligations` resource: a date range,
 * the SIMERT concept and 0-based pagination.
 */
export class PaidObligationsDto {
    @IsString()
    startDate: string;

    @IsString()
    endDate: string;

    // Required: GIM rejects a request without a concept and reports a single one
    // per call, so there is no "every concept" query to forward.
    @IsEnum(ConceptPaidObligation)
    concept: ConceptPaidObligation;

    @IsOptional()
    @IsNumber()
    @Min(0)
    @Type(() => Number)
    page?: number;

    @IsOptional()
    @IsNumber()
    @Min(1)
    @Type(() => Number)
    size?: number;
}
