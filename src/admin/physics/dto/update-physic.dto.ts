import { PartialType } from '@nestjs/swagger';

import { CreatePhysicDto } from './create-physic.dto';

/**
 *
 */
export class UpdatePhysicDto extends PartialType(CreatePhysicDto) {}
