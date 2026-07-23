import { IsEmail, IsNotEmpty, IsString, MinLength } from 'class-validator';

/**
 *
 */
export class ChangePasswordDto {
    @IsEmail()
    @IsNotEmpty()
    email: string;

    @IsString()
    @IsNotEmpty()
    @MinLength(6)
    newPassword: string;
}
