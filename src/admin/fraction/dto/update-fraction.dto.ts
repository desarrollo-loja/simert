import { PartialType } from '@nestjs/swagger';

import { CreateFractionDto } from './create-fraction.dto';

/**
 *
 */
export class UpdateFractionDto extends PartialType(CreateFractionDto) {}
