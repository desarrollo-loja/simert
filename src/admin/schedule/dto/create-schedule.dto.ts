import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Block } from 'src/admin/block/entities/block.entity';

/**
 *
 */
export class CreateScheduleDto {
  @ValidateNested({ each: true })
  @Type(() => ScheduleDto)
  dataSchedules: ScheduleDto[];

  @IsOptional()
  @IsBoolean()
  isActivated: boolean;
}

/**
 *
 */
class ScheduleDto {
  @IsOptional()
  @IsNumber()
  id: number;

  @IsOptional()
  @IsBoolean()
  isActivated: boolean;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(6)
  dayOfWeekInit: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(6)
  dayOfWeekEnd: number;

  @IsOptional()
  @IsString()
  @MinLength(8)
  @MaxLength(8)
  openingTime: string;

  @IsOptional()
  @IsString()
  @MinLength(8)
  @MaxLength(8)
  closingTime: string;

  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => Block)
  block: Block;
}
