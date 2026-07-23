import { Type } from 'class-transformer';
import {
    IsArray,
    IsDecimal,
    IsEnum,
    IsNumber,
    IsObject,
    IsOptional,
    IsPositive,
    IsString,
    IsUUID,
    ValidateNested,
} from 'class-validator';
import { BillingDataDto } from 'src/common/dto/billing-data.dto';
import { TypePaymentMethod } from 'src/common/glob/type/type_payment_method';
import { OptionalDataInterface } from 'src/common/intefaces/optional-data.interface'; // ajusta la ruta si no coincide

/**
 *
 */
export class PayIncidentDto {
    @IsPositive()
    credentialId: number;

    @IsPositive()
    userId: number;

    @IsDecimal({ force_decimal: true, decimal_digits: '2', locale: 'en-US' })
    amount: string;

    @IsDecimal({ force_decimal: true, decimal_digits: '2', locale: 'en-US' })
    commission: string = '0.00';

    @IsDecimal({ force_decimal: true, decimal_digits: '2', locale: 'en-US' })
    price: string;

    @IsPositive()
    @IsEnum(TypePaymentMethod)
    typePaymentMethod: TypePaymentMethod;

    //Costo calculado recordar que al finalizar el travel se cobra en taxi
    @IsOptional()
    @IsDecimal({ force_decimal: true, decimal_digits: '2', locale: 'en-US' })
    balance: string;

    @IsOptional()
    @IsPositive()
    cardId: number;

    @Type(() => OptionalDataInterface)
    @IsOptional()
    optionalData: OptionalDataInterface[];

    @IsObject()
    @ValidateNested()
    @Type(() => BillingDataDto)
    billing_data: BillingDataDto;

    @IsUUID()
    transactionId: string;

    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => IncidentItemDto)
    incidents: IncidentItemDto[];

    @IsOptional()
    @IsString()
    identityCard: string = '';
}

/**
 *
 */
export class IncidentItemDto {
    @IsNumber()
    id: number;

    @IsString()
    amount: string;

    @IsString()
    register: string;

    @IsString()
    code: string;

    @IsOptional()
    @IsString()
    accountingAccountCode?: string;
}
