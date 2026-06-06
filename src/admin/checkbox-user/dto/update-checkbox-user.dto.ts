import { PartialType } from '@nestjs/swagger';

import { CreateCheckboxUserDto } from './create-checkbox-user.dto';

/**
 *
 */
export class UpdateCheckboxUserDto extends PartialType(CreateCheckboxUserDto) {}
