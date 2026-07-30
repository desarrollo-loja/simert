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

    @IsOptional()
    @IsEnum(ConceptPaidObligation)
    concept?: ConceptPaidObligation;

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
