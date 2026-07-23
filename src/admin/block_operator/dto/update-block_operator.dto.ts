import { PartialType } from '@nestjs/swagger';

import { CreateBlockOperatorDto } from './create-block_operator.dto';

/**
 *
 */
export class UpdateBlockOperatorDto extends PartialType(
    CreateBlockOperatorDto,
) {}
