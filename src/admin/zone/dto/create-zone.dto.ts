import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsLatitude,
  IsLongitude,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { LengthDb } from 'src/common/glob/length.db';
import { TypeZone } from 'src/common/glob/type/type_zone';
import { ScheduleInterface } from 'src/common/intefaces/schedule.interface';
/**
 *
 */
export class CreateZoneDto {
  @IsString()
  @MinLength(2)
  @MaxLength(20)
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(LengthDb.description)
  description: string;

  @IsString()
  @MinLength(2)
  @MaxLength(7)
  acronym: string;

  @IsString()
  @MaxLength(7)
  color: string;

  @IsLatitude()
  lt: number;

  @IsLongitude()
  lg: number;

  @IsOptional()
  @IsString()
  @MinLength(3)
  geofence?: string;

  @IsOptional()
  @IsBoolean()
  isActivated?: boolean;

  @IsOptional()
  @IsEnum(TypeZone)
  type: TypeZone;

  @IsOptional()
  @IsDateString()
  fromTemporary: Date | null;

  @IsOptional()
  @IsDateString()
  toTemporary: Date | null;

  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => ScheduleDto)
  schedules: ScheduleDto[];
}

/**
 *
 */
class ScheduleDto implements ScheduleInterface {
  @IsBoolean()
  isActivated: boolean;

  @IsNumber()
  dayOfWeekInit: number;

  @IsNumber()
  dayOfWeekEnd: number;

  @IsString()
  openingTime: string;

  @IsString()
  closingTime: string;
}
