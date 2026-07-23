import {
    IsBoolean,
    IsOptional,
    IsPositive,
    IsString,
    IsUUID,
    MaxLength,
    MinLength,
} from 'class-validator';
import { MetaInterface } from 'src/common/intefaces/meta.interface';

/**
 *
 */
export class CreateSimertDto {
    meta: MetaInterface;

    @IsPositive()
    userId: number;

    @IsPositive()
    serviceSectionCityId: number;

    @IsUUID()
    transactionId: string;

    @IsPositive()
    checkboxes: number;

    @IsBoolean()
    isPaidParking: boolean;

    @IsString()
    @MinLength(1)
    slot: string;

    @IsString()
    @MinLength(1)
    @MaxLength(25)
    alias: string;

    @IsString()
    @MinLength(1)
    @MaxLength(15)
    plate: string;

    @IsString()
    @MinLength(1)
    @MaxLength(25)
    tint: string;

    @IsOptional()
    @IsString()
    @MaxLength(255)
    image: string;
}
