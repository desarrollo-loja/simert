import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsArray, IsInt, IsOptional, IsPositive } from 'class-validator';

/**
 *
 */
export class FindUniqueUsersBlockOperatorDto {
    @ApiPropertyOptional({ type: [Number], description: 'Filter by block IDs' })
    @IsArray()
    @IsInt({ each: true })
    @IsPositive({ each: true })
    @IsOptional()
    @Type(() => Number)
    blockIds?: number[];

    @ApiPropertyOptional({ example: 5, description: 'Filter by user ID' })
    @IsInt()
    @IsPositive()
    @IsOptional()
    @Type(() => Number)
    userId?: number;
}
