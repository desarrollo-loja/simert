import { PartialType } from '@nestjs/swagger';
import { IsNumber, IsOptional, Min } from 'class-validator';

import { CreateIncidentDto } from './create-incident.dto';

/**
 *
 */
export class UpdateIncidentDto extends PartialType(CreateIncidentDto) {
  @IsNumber()
  @IsOptional()
  @Min(2000)
  year?: number;

  @IsNumber()
  @IsOptional()
  @Min(1)
  month?: number;

  @IsOptional()
  register?: string;
}
