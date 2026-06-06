import { PartialType } from '@nestjs/swagger';

import { CreateMappingDto } from './create-mapping.dto';

/**
 *
 */
export class UpdateMappingDto extends PartialType(CreateMappingDto) {}
