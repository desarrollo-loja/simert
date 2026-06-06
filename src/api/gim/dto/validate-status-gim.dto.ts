import { Type } from 'class-transformer';
import { IsArray, IsInt, IsOptional, ValidateNested } from 'class-validator';

import { CreateGimDto } from './create-gim.dto';

/**
 *
 */
export class ValidateStatusGimDto {
  @IsArray()
  debtDataObligations: any[];

  @IsInt()
  incidentId: number;

  @IsInt()
  isTransacional: number;

  @IsOptional()
  @ValidateNested()
  @Type(() => CreateGimDto)
  createGimDto?: CreateGimDto;
}
