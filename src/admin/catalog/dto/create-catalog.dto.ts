import {
    IsArray,
    IsBoolean,
    IsObject,
    IsOptional,
    IsString,
    MaxLength,
    MinLength,
} from 'class-validator';

/**
 *
 */
export class CreateCatalogDto {
    @IsString()
    @MinLength(3)
    @MaxLength(255)
    name: string;

    @IsArray()
    @IsObject({ each: true })
    data: Record<string, any>[];

    @IsOptional()
    @IsString()
    @MaxLength(255)
    description?: string;

    @IsOptional()
    @IsBoolean()
    isActivated?: boolean;
}
