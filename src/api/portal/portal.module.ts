import { Module } from '@nestjs/common';
import { AuthModule } from 'src/auth/auth.module';

import { PortalController } from './portal.controller';
import { PortalService } from './portal.service';

/**
 *
 */
@Module({
    controllers: [PortalController],
    providers: [PortalService],
    imports: [AuthModule],
})
export class PortalModule {}
