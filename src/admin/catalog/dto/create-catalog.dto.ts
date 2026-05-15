import { IsBoolean, IsOptional, IsString, MaxLength, MinLength } from "class-validator";

export class CreateCatalogDto {

    @IsString()
    @MinLength(3)
    @MaxLength(255)
    type: string;

    data: any;

    @IsOptional()
    @IsString()
    @MaxLength(255)
    description?: string;

    @IsOptional()
    @IsBoolean()
    isActivated?: boolean;
}
