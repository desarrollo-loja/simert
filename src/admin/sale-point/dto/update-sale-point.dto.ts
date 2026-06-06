import { PartialType } from '@nestjs/swagger';

import { CreateSalePointDto } from './create-sale-point.dto';

/**
 *
 */
export class UpdateSalePointDto extends PartialType(CreateSalePointDto) {}
