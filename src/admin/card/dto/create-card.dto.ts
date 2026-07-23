import {
    IsBoolean,
    IsNumber,
    IsString,
    MaxLength,
    MinLength,
} from 'class-validator';
import { LengthDb } from 'src/common/glob/length.db';

/**
 *
 */
export class CreateCardDto {
    // @IsPositive()
    // id: number;

    @IsString()
    @MaxLength(LengthDb.name)
    @MinLength(3)
    name: string;

    @IsNumber()
    price: number;

    @IsNumber()
    commission: number;

    @IsNumber()
    checkboxes: number;

    @IsBoolean()
    isActivated: boolean;
}
