import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

/**
 *
 */
export class SearchFractionDto {
  @IsNumber()
  @Type(() => Number)
  year: number;

  @IsNumber()
  @Type(() => Number)
  month: number;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  @Min(0)
  offset: number;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  @Min(1)
  limit: number;

  @IsBoolean()
  @Type(() => Boolean)
  currentMonth: boolean;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  statusId: number;

  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) =>
    value === 'true' || value === true || value === 'false'
      ? value === 'true' || value === true
      : value,
  )
  timeZone?: boolean;

  @IsOptional()
  @IsString()
  dateFrom?: string;

  @IsOptional()
  @IsString()
  dateTo?: string;
}
