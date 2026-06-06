import {
  IsEnum,
  IsLatitude,
  IsLongitude,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { LengthDb } from 'src/common/glob/length.db';
import { TypeActivity } from 'src/common/glob/type/type_activity';

/**
 *
 */
export class CreateAgentActivityDto {
  @IsNumber()
  userId: number;

  @IsNumber()
  blockId: number;

  @IsNumber()
  blockOperatorId: number;

  @IsEnum(TypeActivity)
  type: TypeActivity;

  @IsOptional()
  @IsString()
  @MaxLength(LengthDb.description)
  description: string;

  @IsLatitude()
  lt: number;

  @IsLongitude()
  lg: number;
}
