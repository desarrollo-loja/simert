import { PartialType } from '@nestjs/swagger';

import { CreateRangeSalePointDto } from './create-range-sale-point.dto';

/**
 *
 */
export class UpdateRangeSalePointDto extends PartialType(
  CreateRangeSalePointDto,
) {}
