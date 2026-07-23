import { Type } from 'class-transformer';
import {
    IsArray,
    IsEmail,
    IsEnum,
    IsNumber,
    IsOptional,
    IsString,
    Length,
    MaxLength,
} from 'class-validator';
import { LengthDb } from 'src/common/glob/length.db';
import { SupportRequestType } from 'src/common/glob/type/support_request_type';
import { SupportTicketStatus } from 'src/common/glob/type/support_ticket_status';
import { SupportTicketType } from 'src/common/glob/type/support_ticket_type';

/**
 *
 */
export class CreateSupportTicketDto {
    @IsOptional()
    @IsNumber()
    @Type(() => Number)
    userId?: number;

    @IsEnum(SupportRequestType)
    @Type(() => Number)
    requestType: SupportRequestType;

    @IsString()
    @Length(5, LengthDb.details)
    message: string;

    @IsOptional()
    @IsEnum(SupportTicketStatus)
    @Type(() => Number)
    status?: SupportTicketStatus;

    @IsOptional()
    @IsString()
    @IsEmail()
    @MaxLength(LengthDb.email)
    emailClient?: string;

    @IsOptional()
    @IsArray()
    @IsString({ each: true })
    image?: string[];

    @IsOptional()
    @IsEnum(SupportTicketType)
    @Type(() => Number)
    typeTicket?: SupportTicketType;
}
