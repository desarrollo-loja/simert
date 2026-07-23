import { Type } from 'class-transformer';
import {
    IsBoolean,
    IsNotEmpty,
    IsNumber,
    IsOptional,
    IsString,
    Max,
    Min,
} from 'class-validator';

/**
 *
 */
export class CreateIncidentTypeDto {
    @IsNotEmpty()
    @IsString()
    name: string;

    @IsNotEmpty()
    @IsString()
    description: string;

    @Type(() => Number)
    @IsNotEmpty()
    @IsNumber(
        { maxDecimalPlaces: 2 },
        { message: 'Max 2 decimal places allowed' },
    )
    @Min(0)
    @Max(100)
    percentage: number;

    @IsOptional()
    @IsString()
    code: string;

    @IsOptional()
    @IsString()
    accountingAccountCode?: string;

    @IsOptional()
    @IsBoolean()
    isActivated?: boolean;
}
