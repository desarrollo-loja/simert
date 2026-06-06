import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsLatitude,
  IsLongitude,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Block } from 'src/admin/block/entities/block.entity';
import { Zone } from 'src/admin/zone/entities/zone.entity';
import { StatusSlot } from 'src/common/glob/status/status_slot';
import { TypeSlot } from 'src/common/glob/type/type_slot';

/**
 *
 */
export class CreateSlotDto {
  @IsString()
  @IsOptional()
  @MinLength(1)
  @MaxLength(5)
  slot?: string;

  @IsObject()
  @IsOptional()
  @ValidateNested()
  @Type(() => Zone)
  zone: Zone;

  @IsObject()
  @IsOptional()
  @ValidateNested()
  @Type(() => Block)
  block: Block;

  @IsBoolean()
  isActivated: boolean;

  @IsBoolean()
  isPaidParking: boolean;

  @IsLatitude()
  lt: number;

  @IsLongitude()
  lg: number;

  @IsOptional()
  @IsEnum(StatusSlot)
  status: StatusSlot;

  @IsOptional()
  @IsEnum(TypeSlot)
  typeSlot: TypeSlot;

  @IsOptional()
  location: any;
}
