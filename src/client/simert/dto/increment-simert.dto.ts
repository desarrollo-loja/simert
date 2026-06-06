import {
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
export class IncrementSimertDto {
  meta: MetaInterface;

  @IsPositive()
  userId: number;

  @IsPositive()
  serviceSectionCityId: number;

  @IsPositive()
  fractionId: number;

  @IsPositive()
  checkboxes: number;

  @IsUUID()
  transactionId: string;

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
