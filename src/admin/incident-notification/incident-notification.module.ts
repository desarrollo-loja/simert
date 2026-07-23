import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { IncidentNotification } from './entities/incident-notification.entity';
import { IncidentNotificationController } from './incident-notification.controller';
import { IncidentNotificationService } from './incident-notification.service';

/**
 *
 */
@Module({
    controllers: [IncidentNotificationController],
    providers: [IncidentNotificationService],
    imports: [TypeOrmModule.forFeature([IncidentNotification])],
})
export class IncidentNotificationModule {}
