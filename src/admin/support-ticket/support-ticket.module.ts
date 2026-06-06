import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from 'src/auth/auth.module';
import { LoggerModule } from 'src/common/logger.module';

import { SupportTicket } from './entities/support-ticket.entity';
import { SupportTicketController } from './support-ticket.controller';
import { SupportTicketService } from './support-ticket.service';

/**
 *
 */
@Module({
  controllers: [SupportTicketController],
  providers: [SupportTicketService],
  imports: [
    TypeOrmModule.forFeature([SupportTicket]),
    AuthModule,
    LoggerModule,
  ],
})
export class SupportTicketModule {}
