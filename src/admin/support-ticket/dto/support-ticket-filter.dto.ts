import { Type } from 'class-transformer';
import { IsNumber, IsOptional, IsString, Min } from 'class-validator';
import { FilterDto } from 'src/common/dto/filter.dto';

/**
 *
 */
export class SupportTicketFilterDto extends FilterDto {
    @IsOptional()
    @IsString()
    dateFrom?: string;

    @IsOptional()
    @IsString()
    dateTo?: string;

    @IsOptional()
    @IsNumber()
    @Min(0)
    @Type(() => Number)
    requestType?: number;

    @IsOptional()
    @IsNumber()
    @Min(0)
    @Type(() => Number)
    status?: number;

    @IsOptional()
    @IsString()
    emailClient?: string;

    @IsOptional()
    @IsNumber()
    @Min(0)
    @Type(() => Number)
    typeTicket?: number;
}
