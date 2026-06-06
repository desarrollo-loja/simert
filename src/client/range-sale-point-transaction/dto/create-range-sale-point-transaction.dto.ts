import { IsPositive } from 'class-validator';

/**
 *
 */
export class CreateRangeSalePointTransactionDto {
  @IsPositive()
  userIdSell: number;

  @IsPositive()
  userIdBuy: number;

  @IsPositive()
  amount: number;

  @IsPositive()
  rangeSalePointId: number;
}
