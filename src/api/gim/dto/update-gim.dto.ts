import { PartialType } from '@nestjs/swagger';

import { CreateGimDto } from './create-gim.dto';

/**
 *
 */
export class UpdateGimDto extends PartialType(CreateGimDto) {}
