import { IsNumber, IsPositive } from 'class-validator';

/**
 *
 */
export class CreateRangeSalePointDto {
    @IsPositive()
    userId: number;

    @IsPositive()
    userIdSale: number;

    @IsPositive()
    @IsNumber()
    salePointId: number;

    @IsNumber()
    available: number;

    @IsNumber()
    sold: number;
}
