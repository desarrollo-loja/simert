import { IsNumber, IsString } from 'class-validator';

/**
 *
 */
export class EmisionCreditCardDto {
  @IsString()
  entryCode: string;

  @IsNumber()
  residentId: number;

  @IsString()
  description: string;

  @IsString()
  reference: string;

  @IsNumber()
  quantity: number;
}
