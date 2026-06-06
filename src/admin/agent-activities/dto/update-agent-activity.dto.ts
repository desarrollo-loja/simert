import { PartialType } from '@nestjs/swagger';

import { CreateAgentActivityDto } from './create-agent-activity.dto';

/**
 *
 */
export class UpdateAgentActivityDto extends PartialType(
  CreateAgentActivityDto,
) {}
