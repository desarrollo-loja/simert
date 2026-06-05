import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsPositive, IsString, Max, Min } from 'class-validator';

/**
 * Query parameters for filtering and paginating public endpoints.
 *
 * All fields are optional. When omitted, sensible defaults apply.
 */
export class PublicFilterDto {
  @ApiPropertyOptional({
    description: 'Case-insensitive search term applied to name fields',
    example: 'centro',
  })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({
    description: 'Filter results by zone ID',
    example: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  zoneId?: number;

  @ApiPropertyOptional({
    description: 'Maximum number of records to return (1-100)',
    example: 20,
    default: 50,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @ApiPropertyOptional({
    description: 'Number of records to skip for pagination',
    example: 0,
    default: 0,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number;
}
