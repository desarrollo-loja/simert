import { IsNumber, IsOptional, IsString, Min } from 'class-validator';

import { CreateIncidentDto } from './create-incident.dto';

/**
 *
 */
export class IncidentDto extends CreateIncidentDto {
    @IsOptional()
    @IsString()
    createdAt?: string;

    // Accepted (and ignored by the workflow logic) so clients can echo back the
    // full incident object — including the application-set `register` timestamp —
    // without tripping the global `forbidNonWhitelisted` validation.
    @IsOptional()
    @IsString()
    register?: string;

    @IsNumber()
    @IsOptional()
    @Min(2000)
    year?: number;

    @IsNumber()
    @IsOptional()
    @Min(1)
    month?: number;
}
