import { IsOptional, IsString, MaxLength } from 'class-validator';
import { CreateIncidentDto } from 'src/admin/incident/dto/create-incident.dto';
import { LengthDb } from 'src/common/glob/length.db';

/**
 *
 */
export class CreateGimDto extends CreateIncidentDto {
    @IsOptional()
    @IsString()
    @MaxLength(LengthDb.name)
    firstName?: string;

    @IsOptional()
    @IsString()
    @MaxLength(LengthDb.name)
    lastName?: string;

    @IsOptional()
    @IsString()
    createdAt?: string;

    @IsOptional()
    @IsString()
    updatedAt?: string;

    @IsOptional()
    @IsString()
    register?: string;
}
