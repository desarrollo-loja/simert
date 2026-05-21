import {
    IsNumber,
    IsOptional,
    IsString,
    Min,
} from 'class-validator';

import { CreateIncidentDto } from './create-incident.dto';

export class IncidentDto extends CreateIncidentDto {
    @IsOptional()
    @IsString()
    createdAt?: string;

    @IsNumber()
    @IsOptional()
    @Min(2000)
    year?: number;

    @IsNumber()
    @IsOptional()
    @Min(1)
    month?: number;
}
