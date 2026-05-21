import { Type } from 'class-transformer';
import { IsBoolean, IsEnum, IsNumber, IsOptional, IsString, Min } from 'class-validator';
import { FilterDto } from 'src/common/dto/filter.dto';
import { IncidentStatus } from 'src/common/glob/type/type_incident';
import { InternalStateIncident } from 'src/common/glob/type/type_internal_state_incident';

export class IncidentFilterDto extends FilterDto {
  @IsOptional()
  @IsString()
  dateFrom?: string;

  @IsOptional()
  @IsString()
  dateTo?: string;

  @IsOptional()
  @IsBoolean()
  filterWhitRangeDays?: boolean;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  incidentTypeId?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  blockOperatorId?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  incidentCategory?: number;

  @IsOptional()
  @Type(() => Number)
  @IsEnum(IncidentStatus)
  statusIncident?: IncidentStatus;

  @IsOptional()
  @Type(() => Number)
  @IsEnum(InternalStateIncident)
  internalState?: InternalStateIncident;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  controllerId?: number;
}
