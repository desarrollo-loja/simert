import { PartialType } from '@nestjs/swagger';

import { CreateSimertDto } from './create-simert.dto';

/**
 *
 */
export class UpdateSimertDto extends PartialType(CreateSimertDto) {}
