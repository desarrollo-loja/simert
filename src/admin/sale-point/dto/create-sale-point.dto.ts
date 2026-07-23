import { Type } from 'class-transformer';
import {
    IsBoolean,
    IsEnum,
    IsLatitude,
    IsLongitude,
    IsObject,
    IsOptional,
    IsPositive,
    IsString,
    MaxLength,
    ValidateNested,
} from 'class-validator';
import { BillingDataDto } from 'src/common/dto/billing-data.dto';
import { LengthDb } from 'src/common/glob/length.db';
import { TypeModeSalePoint } from 'src/common/glob/type/type_mode_sale_point';
import { TypeSalePoint } from 'src/common/glob/type/type_sale_point';

/**
 *
 */
export class CreateSalePointDto {
    @IsPositive()
    userId: number;

    @IsOptional()
    @IsPositive()
    zoneId: number;

    @IsOptional()
    @IsPositive()
    blockId: number;

    @IsEnum(TypeModeSalePoint)
    mode: TypeModeSalePoint;

    @IsEnum(TypeSalePoint)
    type: TypeSalePoint;

    @IsLatitude()
    lt: number;

    @IsLongitude()
    lg: number;

    @IsString()
    @MaxLength(LengthDb.title)
    title: string;

    @IsString()
    @MaxLength(LengthDb.subTitle)
    subTitle: string;

    @IsOptional()
    @IsObject()
    @ValidateNested()
    @Type(() => BillingDataDto)
    billing_data: BillingDataDto | null;

    @IsOptional()
    @IsString()
    @MaxLength(LengthDb.alias)
    alias: string;

    @IsString()
    @MaxLength(LengthDb.names)
    names: string;

    @IsString()
    @MaxLength(200)
    number: string;

    @IsOptional()
    @IsString()
    @MaxLength(LengthDb.email)
    email: string;

    @IsOptional()
    @IsString()
    @MaxLength(8)
    countryCode: string;

    @IsOptional()
    @IsString()
    @MaxLength(LengthDb.phone)
    phone: string;

    @IsOptional()
    @IsString()
    @MaxLength(LengthDb.image)
    qr: string;

    @IsOptional()
    @IsBoolean()
    isApproved: boolean;

    @IsOptional()
    @IsPositive()
    userIdApproved: number;

    //<<-- Rubros >>>>>>>
    @IsOptional()
    @IsEnum(TypeSalePoint)
    cardRevenue: TypeSalePoint;

    @IsOptional()
    @IsPositive()
    cardRevenueValue: number;

    @IsOptional()
    @IsEnum(TypeSalePoint)
    balanceRevenue: TypeSalePoint;

    @IsOptional()
    @IsPositive()
    balanceRevenueValue: number;
    //<<-- Rubros >>>>>>>
}
