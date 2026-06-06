import { IsBoolean, IsOptional, IsString } from 'class-validator';
import { FilterDto } from 'src/common/dto/filter.dto';

/**
 *
 */
export class IncidentTypeFilterDto extends FilterDto {
  @IsOptional()
  @IsString()
  dateFrom?: string;

  @IsOptional()
  @IsString()
  dateTo?: string;

  @IsOptional()
  @IsBoolean()
  filterWhitRangeDays?: boolean;
}
