import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsLatitude,
  IsLongitude,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Zone } from 'src/admin/zone/entities/zone.entity';
import { LengthDb } from 'src/common/glob/length.db';
/**
 *
 */
export class CreateBlockDto {
  @IsString()
  @IsOptional()
  @MinLength(2)
  @MaxLength(20)
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(LengthDb.description)
  description: string;

  @IsString()
  @IsOptional()
  @MinLength(2)
  @MaxLength(7)
  acronym: string;

  @IsString()
  @IsOptional()
  @MinLength(3)
  @MaxLength(7)
  color: string;

  @IsLatitude()
  @IsOptional()
  lt: number;

  @IsLongitude()
  @IsOptional()
  lg: number;

  @IsString()
  @IsOptional()
  @MinLength(3)
  geofence: string;

  @IsNumber()
  @IsOptional()
  priority: number;

  @IsObject()
  @IsOptional()
  @ValidateNested()
  @Type(() => Zone)
  zone: Zone;

  @IsString()
  @IsOptional()
  @MaxLength(200)
  neighborhood: string;

  @IsString()
  @IsOptional()
  @MaxLength(200)
  mainStreet: string;

  @IsString()
  @IsOptional()
  @MaxLength(200)
  sideStreet: string;

  @IsOptional()
  @IsBoolean()
  isActivated?: boolean;

  @IsString()
  @IsOptional()
  timeLimit: string;

  @IsString()
  @IsOptional()
  timeGrace: string;

  @IsString()
  @IsOptional()
  timePerFraction: string;
}
