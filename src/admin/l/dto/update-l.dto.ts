import { PartialType } from '@nestjs/swagger';

import { CreateLDto } from './create-l.dto';

/**
 *
 */
export class UpdateLDto extends PartialType(CreateLDto) {}
