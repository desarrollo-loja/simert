import { PartialType } from '@nestjs/swagger';

import { CreateIncidentNotificationDto } from './create-incident-notification.dto';

/**
 *
 */
export class UpdateIncidentNotificationDto extends PartialType(
    CreateIncidentNotificationDto,
) {}
