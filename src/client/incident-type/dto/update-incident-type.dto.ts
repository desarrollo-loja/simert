import { PartialType } from '@nestjs/swagger';

import { CreateIncidentTypeDto } from './create-incident-type.dto';

/**
 *
 */
export class UpdateIncidentTypeDto extends PartialType(CreateIncidentTypeDto) {}
