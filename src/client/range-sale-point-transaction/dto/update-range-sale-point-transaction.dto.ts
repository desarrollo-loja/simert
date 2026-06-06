import { PartialType } from '@nestjs/swagger';

import { CreateRangeSalePointTransactionDto } from './create-range-sale-point-transaction.dto';

/**
 *
 */
export class UpdateRangeSalePointTransactionDto extends PartialType(
  CreateRangeSalePointTransactionDto,
) {}
