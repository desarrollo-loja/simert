import { Type } from 'class-transformer';
import {
    IsEnum,
    IsInt,
    IsNumber,
    IsOptional,
    IsString,
    Max,
    MaxLength,
    Min,
} from 'class-validator';
import { LengthDb } from 'src/common/glob/length.db';
import { IncidentStatus } from 'src/common/glob/type/type_incident';

/**
 *
 */
export class CreateIncidentNotificationDto {
    @IsNumber()
    incidentTypeId: number;

    @IsNumber()
    incidentId: number;

    @IsOptional()
    @IsInt()
    @Min(0)
    @Max(12)
    month: number;

    @IsOptional()
    @IsInt()
    @Min(0)
    year: number;

    @Type(() => Number)
    @IsEnum(IncidentStatus)
    statusIncident: IncidentStatus;

    @IsOptional()
    @IsString()
    @MaxLength(LengthDb.details)
    description?: string;

    @IsOptional()
    @IsString()
    @MaxLength(LengthDb.plate)
    plate?: string;
}
