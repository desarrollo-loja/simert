import { Type } from 'class-transformer';
import {
  IsDecimal,
  IsEnum,
  IsObject,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  Length,
  ValidateNested,
} from 'class-validator';
import { BillingDataDto } from 'src/common/dto/billing-data.dto';
import { TypePaymentMethod } from 'src/common/glob/type/type_payment_method';
import { OptionalDataInterface } from 'src/common/intefaces/optional-data.interface';

/**
 *
 */
export class CreateCheckboxDto {
  @IsPositive()
  credentialId: number;

  @IsPositive()
  userId: number;

  @IsDecimal({ force_decimal: true, decimal_digits: '2', locale: 'en-US' })
  amount: string;

  @IsDecimal({ force_decimal: true, decimal_digits: '2', locale: 'en-US' })
  price: string;

  @IsDecimal({ force_decimal: true, decimal_digits: '2', locale: 'en-US' })
  commission: string;

  @IsPositive()
  @IsEnum(TypePaymentMethod)
  typePaymentMethod: TypePaymentMethod;

  @IsOptional()
  @Length(4)
  pin: string;

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

  @IsPositive()
  checkboxes: number;

  @IsOptional()
  @IsString()
  identityCard: string = '';
}
