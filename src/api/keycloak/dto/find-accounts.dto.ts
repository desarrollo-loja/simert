import { Type } from 'class-transformer';
import {
    ArrayMaxSize,
    ArrayNotEmpty,
    IsArray,
    IsNotEmpty,
    IsOptional,
    IsString,
    ValidateNested,
} from 'class-validator';

/** One account to look up, as identified by the caller's local record. */
export class FindAccountRefDto {
    /**
     * Caller-owned correlation id (usually the local user id). It is echoed
     * back untouched so the caller can match each result to its row.
     */
    @IsString()
    @IsNotEmpty()
    ref: string;

    /** Exact username to look up first, when the local record has one. */
    @IsOptional()
    @IsString()
    username?: string;

    /** Exact email, used when the username finds nothing. */
    @IsOptional()
    @IsString()
    email?: string;
}

/**
 * Batch lookup request.
 *
 * Bounded on purpose: this resolves one page of an admin table, and an
 * unbounded list would turn a single HTTP call into an unbounded fan-out
 * against Keycloak.
 */
export class FindAccountsDto {
    @IsArray()
    @ArrayNotEmpty()
    @ArrayMaxSize(100)
    @ValidateNested({ each: true })
    @Type(() => FindAccountRefDto)
    users: FindAccountRefDto[];
}
