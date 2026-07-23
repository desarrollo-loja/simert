import { IsInt, IsOptional, IsString, MaxLength } from 'class-validator';
import { LengthDb } from 'src/common/glob/length.db';

/**
 *
 */
export class CreateClientDto {
    @IsInt()
    controllerId: number;

    @IsString()
    @MaxLength(LengthDb.identityCard)
    identityCard: string;

    @IsOptional()
    @IsString()
    @MaxLength(LengthDb.name)
    firstName?: string;

    @IsOptional()
    @IsString()
    @MaxLength(LengthDb.name)
    lastName?: string;

    @IsString()
    @MaxLength(LengthDb.email)
    emailClient: string;

    @IsOptional()
    @IsString()
    createdAt?: string;

    @IsOptional()
    @IsString()
    updatedAt?: string;
}
