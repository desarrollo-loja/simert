import { IsLatitude, IsLongitude, IsNumber, IsPositive } from 'class-validator';

/**
 *
 */
export class OnresponseTrakingDto {
  @IsPositive()
  requestId: number;

  @IsLongitude()
  lt: number;

  @IsNumber()
  direction: number;

  @IsLatitude()
  lg: number;
}
