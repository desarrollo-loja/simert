import { PartialType } from '@nestjs/swagger';

import { CreateFractionStatusDto } from './create-fraction_status.dto';

/**
 *
 */
export class UpdateFractionStatusDto extends PartialType(
    CreateFractionStatusDto,
) {}
