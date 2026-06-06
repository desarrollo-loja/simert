import { PartialType } from '@nestjs/swagger';

import { CreateRangeDto } from './create-range.dto';

/**
 *
 */
export class UpdateRangeDto extends PartialType(CreateRangeDto) {}
