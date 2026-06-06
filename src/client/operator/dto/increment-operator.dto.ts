import {
  IsNumber,
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
export class IncrementOperatorDto {
  @IsNumber()
  @IsOptional()
  physicId: number = 0;

  @IsNumber()
  @IsOptional()
  obsolete: number = 0;

  meta: MetaInterface;

  @IsPositive()
  userId: number;

  @IsPositive()
  fractionId: number;

  @IsPositive()
  checkboxes: number;

  @IsNumber()
  @IsOptional()
  serviceSectionCityId: number = 0;

  @IsUUID()
  transactionId: string;

  @IsString()
  @MinLength(1)
  @MaxLength(15)
  plate: string;

  @IsString()
  @MinLength(1)
  @MaxLength(12)
  card: string;

  @IsString()
  @MinLength(1)
  @MaxLength(25)
  tint: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  image: string;
}
