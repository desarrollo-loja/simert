import { IsNumber, IsOptional, IsString, Length } from 'class-validator';
import { LengthDb } from 'src/common/glob/length.db';
import { SupportRequestType } from 'src/common/glob/type/support_request_type';
import { SupportTicketStatus } from 'src/common/glob/type/support_ticket_status';
import { SupportTicketType } from 'src/common/glob/type/support_ticket_type';
import {
    Column,
    Entity,
    Index,
    PrimaryGeneratedColumn,
    UpdateDateColumn,
} from 'typeorm';

/**
 *
 */
@Entity({
    name: 'supportTicket',
    comment:
        'Stores user support tickets (inquiries, complaints, suggestions) with message, status and attachments',
})
export class SupportTicket {
    @PrimaryGeneratedColumn('increment', {
        primaryKeyConstraintName: 'pkSupportTicketId',
    })
    @IsNumber()
    id: number;

    @Column('int', {
        nullable: true,
        comment:
            'Registered user identifier who created the ticket, if applicable',
    })
    @Index('idxSupportTicketUserId')
    @IsOptional()
    @IsNumber()
    userId?: number;

    @Column('int', {
        comment: 'Type of request: 1=Inquiry, 2=Complaint, 3=Suggestion',
    })
    @Index('idxSupportTicketRequestType')
    requestType: SupportRequestType;

    @Column('varchar', {
        length: LengthDb.details,
        comment:
            'Message or description sent by the user describing the issue or request',
    })
    @IsString()
    @Length(5, LengthDb.details)
    message: string;

    @Column('int', {
        default: SupportTicketStatus.PENDING,
        comment:
            'Ticket status: 1=Pending, 2=In Progress, 3=Resolved, 4=Rejected',
    })
    @Index('idxSupportTicketStatus')
    status: SupportTicketStatus;

    @Column('varchar', {
        length: LengthDb.email,
        nullable: true,
        comment: 'Client email address used to follow up on the ticket',
    })
    @Index('idxSupportTicketEmailClient')
    emailClient: string;

    @Column('varchar', {
        array: true,
        default: () => 'ARRAY[]::varchar[]',
        comment:
            'Array of image URLs attached as evidence or context for the ticket',
    })
    image: string[];

    @Column({
        type: 'timestamp',
        default: () => 'now()',
        comment: 'Timestamp when the record was created',
    })
    createdAt: Date;

    @UpdateDateColumn({
        type: 'timestamp',
        nullable: true,
        comment:
            'Timestamp of the last update. Null on creation, auto-set on every update',
    })
    updatedAt: Date;

    @Column('int', {
        nullable: true,
        comment: 'Ticket submitter type: 1=USER, 2=CONTROLLER',
    })
    @Index('idxSupportTicketTypeTicket')
    typeTicket: SupportTicketType;
}
