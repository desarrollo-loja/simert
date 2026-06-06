import { PartialType } from '@nestjs/swagger';

import { CreateCheckboxDto } from './create-checkbox.dto';

/**
 *
 */
export class UpdateCheckboxDto extends PartialType(CreateCheckboxDto) {}
