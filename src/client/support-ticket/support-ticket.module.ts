import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SupportTicket } from 'src/admin/support-ticket/entities/support-ticket.entity';
import { AuthModule } from 'src/auth/auth.module';
import { LoggerModule } from 'src/common/logger.module';

import { SupportTicketController } from './support-ticket.controller';
import { SupportTicketService } from './support-ticket.service';

/**
 *
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([SupportTicket]),
    AuthModule,
    LoggerModule,
  ],
  controllers: [SupportTicketController],
  providers: [SupportTicketService],
})
export class SupportTicketModule {}
