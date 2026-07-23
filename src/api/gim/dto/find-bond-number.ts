import { IsString } from 'class-validator';

/**
 *
 */
export default class FindBondNumberDto {
    @IsString()
    nroTicket: string;

    @IsString()
    identityCard: string;
}
