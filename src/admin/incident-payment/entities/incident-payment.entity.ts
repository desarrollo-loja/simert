import { IsNumber } from 'class-validator';
import { BillingDataDto } from 'src/common/dto/billing-data.dto';
import { StatusMoment } from 'src/common/glob/status/status_moment';
import { StatusPayment } from 'src/common/glob/status/status_payment';
import { TypePaymentMethod } from 'src/common/glob/type/type_payment_method';
import { OptionalDataInterface } from 'src/common/intefaces/optional-data.interface';
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
  name: 'incidentPayment',
  comment:
    'Records payment transactions for incident fines, including gateway reference, amount, method and status',
})
export class IncidentPayment {
  @PrimaryGeneratedColumn('increment', {
    primaryKeyConstraintName: 'pkIncidentPaymentId',
  })
  @IsNumber()
  id: number;

  @Column('int', { comment: 'User identifier who initiated the payment' })
  @Index('idxIncidentPaymentUserId')
  userId: number;

  @Column('int', {
    comment: 'Incident identifier this payment is associated with',
  })
  incidentId: number;

  @Column('varchar', {
    length: 32,
    comment:
      'Unique reference ID for this payment, used to query status in PlaceToPay and other gateways',
  })
  @Index('idxIncidentPaymentReferenceId')
  referenceId: string;

  @Column('json', {
    name: 'billingData',
    nullable: false,
    comment:
      'Billing data (name, identity card, address, etc.) provided at payment time',
  })
  billing_data: BillingDataDto;

  @Column('numeric', {
    precision: 12,
    scale: 2,
    default: 0,
    comment: 'Total amount to be paid for the incident fine',
  })
  amount: string;

  @Column('varchar', {
    length: 36,
    comment:
      'Unique transaction ID sent by the client consuming the API, used for idempotency checks',
  })
  @Index('idxIncidentPaymentTransactionId')
  transactionId: string;

  @Column('smallint', {
    unsigned: true,
    default: StatusMoment.REQUESTED,
    comment:
      'Delivery moment of this payment status: references StatusMoment enum',
  })
  moment: StatusMoment;

  // All tables that process payments must include these columns
  @Column({
    type: 'int',
    comment: 'Payment method used: references TypePaymentMethod enum',
  })
  @Index('idxIncidentPaymentTypePaymentMethod')
  typePaymentMethod: TypePaymentMethod;

  @Column({
    type: 'int',
    default: StatusPayment.WAITING,
    comment:
      'Current payment status: references StatusPayment enum (WAITING, PAID, ERROR, etc.)',
  })
  @Index('idxIncidentPaymentStatusPayment')
  statusPayment: StatusPayment;

  @Column({
    type: 'varchar',
    nullable: true,
    comment: 'Payment gateway redirect URL (e.g. PlaceToPay checkout URL)',
  })
  url: string;

  @Column('json', {
    nullable: true,
    comment:
      'Extra key-value pairs for payment data not covered by explicit columns',
  })
  optionalData: OptionalDataInterface[];

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

  @Column({
    type: 'timestamp',
    nullable: false,
    comment:
      'Business-level registration datetime of the payment, set by the application',
  })
  @Index('idxIncidentPaymentRegister')
  register: string;
}
