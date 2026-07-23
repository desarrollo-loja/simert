import { Type } from 'class-transformer';
import {
    IsDateString,
    IsIn,
    IsNumber,
    IsOptional,
    IsPositive,
    IsString,
    IsUUID,
    MaxLength,
    MinLength,
} from 'class-validator';
import { TypeFraction } from 'src/common/glob/type/type_fraction';
import { MetaInterface } from 'src/common/intefaces/meta.interface';
import { OptionalDataInterface } from 'src/common/intefaces/optional-data.interface';

/**
 *
 */
export class CreateOperatorDto {
    @IsNumber()
    @IsOptional()
    physicId: number = 0;

    @IsNumber()
    @IsOptional()
    obsolete: number = 0;

    meta: MetaInterface;

    @IsPositive()
    @IsIn([TypeFraction.PHYSICS, TypeFraction.VIRTUAL])
    typeFraction: number;

    @IsPositive()
    userId: number;

    @IsDateString()
    fromTime: Date;

    @IsNumber()
    checkboxes: number;

    @IsNumber()
    initialRow: number;

    @IsString()
    @IsOptional()
    time: string;

    @IsNumber()
    @IsOptional()
    serviceSectionCityId: number = 0;

    @IsString()
    @MinLength(1)
    slot: string;

    @IsString()
    @MinLength(1)
    @MaxLength(15)
    plate: string;

    //Card min 0, para permitir parqueos sin tarjeta
    @IsString()
    @MinLength(0)
    @MaxLength(12)
    @IsOptional()
    card?: string;

    @IsString()
    @MinLength(1)
    @MaxLength(25)
    tint: string;

    @IsOptional()
    @IsString()
    @MaxLength(255)
    image: string;

    @IsUUID()
    transactionId: string;

    @Type(() => OptionalDataInterface)
    @IsOptional()
    optionalData: OptionalDataInterface[];
}
