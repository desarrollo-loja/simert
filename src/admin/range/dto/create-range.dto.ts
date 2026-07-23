import {
    IsBoolean,
    IsDateString,
    IsEnum,
    IsNumber,
    IsOptional,
    IsString,
    MaxLength,
} from 'class-validator';
import { StatusRange } from 'src/common/glob/status/status_range';
import { TypeCard } from 'src/common/glob/type/type_card';

/**
 *
 */
export class CreateRangeDto {
    @IsNumber()
    batchNumber: number;

    @IsEnum(TypeCard)
    type: TypeCard;

    @IsEnum(StatusRange)
    status: StatusRange;

    @IsOptional()
    @IsDateString()
    authorizationDate: Date | null;

    @IsString()
    from: string;

    @IsString()
    to: string;

    @IsOptional()
    @MaxLength(90)
    @IsString()
    description?: string;

    @IsBoolean()
    isActivated?: boolean;
}
