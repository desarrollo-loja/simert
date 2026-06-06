import { IsOptional, IsString } from 'class-validator';

/**
 *
 */
export class GetIncidentDto {
  @IsString()
  @IsOptional()
  date: string = new Date().toISOString().split('T')[0]; //2024-05-07

  @IsString()
  @IsOptional()
  timeZone: string = '-05';

  @IsString()
  @IsOptional()
  from: string;

  @IsString()
  @IsOptional()
  to: string;
}
