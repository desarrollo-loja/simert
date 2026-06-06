import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsNumber,
  IsObject,
  Min,
  ValidateNested,
} from 'class-validator';
import { Block } from 'src/admin/block/entities/block.entity';
/**
 *
 */
export class CreateBlockOperatorDto {
  @IsBoolean()
  isActivated: boolean;

  @IsNumber()
  @Min(0)
  userId: number;

  @IsDateString()
  from: Date;

  @IsDateString()
  to: Date;

  @IsBoolean()
  isInitialized: boolean;

  @IsBoolean()
  isFinalized: boolean;

  @IsObject()
  @ValidateNested()
  @Type(() => Block)
  block: Block;
}
