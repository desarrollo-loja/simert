import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNumber } from 'class-validator';
import { BillingDataDto } from 'src/common/dto/billing-data.dto';
import { LengthDb } from 'src/common/glob/length.db';
import { StatusMoment } from 'src/common/glob/status/status_moment';
import { StatusPayment } from 'src/common/glob/status/status_payment';
import { IncidentStatus } from 'src/common/glob/type/type_incident';
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
    name: 'checkbox',
    comment:
        'Records card purchase transactions for parking fractions, including amount, payment method, status and billing data',
})
@Index('idxCheckboxUserIdTransactionId', ['userId', 'transactionId'])
export class Checkbox {
    @ApiProperty({
        example: 1,
        description: 'Unique checkbox purchase identifier',
    })
    @PrimaryGeneratedColumn('increment', {
        primaryKeyConstraintName: 'pkCheckboxId',
    })
    @IsNumber()
    id: number;

    @ApiProperty({
        example: 15,
        description: 'User identifier who made the purchase',
    })
    @Column('int', { comment: 'User identifier who made the purchase' })
    @Index('idxCheckboxUserId')
    userId: number;

    @ApiPropertyOptional({
        example: '1712345678',
        description: 'National identity card number of the client',
    })
    @Column('varchar', {
        length: LengthDb.identityCard,
        nullable: true,
        comment: 'National identity card number of the client',
    })
    @Index('idxCheckboxIdentityCard')
    identityCard: string;

    @ApiProperty({
        example: '1.50',
        description: 'Total amount charged for the card (price + commission)',
    })
    @Column('numeric', {
        precision: 12,
        scale: 2,
        default: 0,
        comment: 'Total amount charged for the card (price + commission)',
    })
    amount: string;

    @ApiProperty({
        example: '0.10',
        description: 'Commission fee included in the total amount',
    })
    @Column('numeric', {
        precision: 12,
        scale: 2,
        default: 0,
        comment: 'Commission fee included in the total amount',
    })
    commission: string;

    @ApiProperty({
        example: 'a3f8c2d4-1234-4567-89ab-abcdef012345',
        maxLength: 36,
        description:
            'Unique transaction ID sent by the API consumer for idempotency checks',
    })
    @Column('varchar', {
        length: 36,
        comment:
            'Unique transaction ID sent by the API consumer for idempotency checks',
    })
    @Index('idxCheckboxTransactionId')
    transactionId: string;

    @ApiProperty({
        example: 12,
        description:
            'Number of parking fractions (checkboxes) purchased in this transaction',
    })
    @Column('smallint', {
        unsigned: true,
        comment:
            'Number of parking fractions (checkboxes) purchased in this transaction',
    })
    checkboxes: number;

    @ApiProperty({
        enum: StatusMoment,
        description: 'Delivery moment of this payment status (StatusMoment)',
    })
    @Column('smallint', {
        unsigned: true,
        default: StatusMoment.REQUESTED,
        comment:
            'Delivery moment of this payment status: references StatusMoment enum',
    })
    moment: StatusMoment;

    @ApiProperty({
        enum: TypePaymentMethod,
        description: 'Payment method used (TypePaymentMethod)',
    })
    @Column({
        type: 'int',
        comment: 'Payment method used: references TypePaymentMethod enum',
    })
    @Index('idxCheckboxTypePaymentMethod')
    typePaymentMethod: TypePaymentMethod;

    @ApiPropertyOptional({
        example: 1,
        description: 'Card type identifier selected for this purchase',
    })
    @Column('int', {
        nullable: true,
        comment: 'Card type identifier selected for this purchase',
    })
    @Index('idxCheckboxCardId')
    cardId: number;

    @ApiProperty({
        enum: StatusPayment,
        description: 'Current payment status (StatusPayment)',
    })
    @Column({
        type: 'int',
        default: StatusPayment.WAITING,
        comment:
            'Current payment status: references StatusPayment enum (WAITING, PAID, ERROR, etc.)',
    })
    @Index('idxCheckboxStatusPayment')
    statusPayment: StatusPayment;

    @ApiProperty({
        type: () => BillingDataDto,
        description:
            'Billing data (name, identity card, address, etc.) provided at purchase time',
    })
    @Column('json', {
        name: 'billingData',
        nullable: false,
        comment:
            'Billing data (name, identity card, address, etc.) provided at purchase time',
    })
    billing_data: BillingDataDto;

    @ApiPropertyOptional({
        example: 'https://gateway.example.com/redirect/abc',
        description:
            'Payment gateway redirect URL generated on the first payment attempt',
    })
    @Column('varchar', {
        length: LengthDb.url,
        nullable: true,
        comment:
            'Payment gateway redirect URL generated on the first payment attempt',
    })
    url: string;

    @ApiProperty({
        enum: IncidentStatus,
        description:
            'GIM incident status (IncidentStatus) at the time of this purchase',
    })
    @Column('int', {
        default: IncidentStatus.ENTERED,
        comment:
            'GIM system status of the linked incident at the time of this purchase: ENTERED(100), APPROVED(500), SUPPLIED(600), PAYED(700), etc.',
    })
    @Index('idxCheckboxStatusIncident')
    statusIncident: IncidentStatus;

    @ApiPropertyOptional({
        type: 'array',
        items: { type: 'object' },
        description:
            'Array of raw response objects received from the GIM external system during the payment lifecycle',
    })
    @Column('json', {
        nullable: true,
        comment:
            'Array of raw response objects received from the GIM external system during the payment lifecycle',
    })
    onResponseExternal: any[];

    @ApiPropertyOptional({
        description:
            'Extra key-value pairs for session data not covered by explicit columns',
        type: 'array',
    })
    @Column('json', {
        nullable: true,
        comment:
            'Extra key-value pairs for session data not covered by explicit columns',
    })
    optionalData: OptionalDataInterface[];

    @ApiProperty({
        type: String,
        format: 'date-time',
        description: 'Creation timestamp',
    })
    @Column({
        type: 'timestamp',
        default: () => 'now()',
        comment: 'Timestamp when the record was created',
    })
    createdAt: Date;

    @ApiPropertyOptional({
        type: String,
        format: 'date-time',
        description: 'Last update timestamp',
    })
    @UpdateDateColumn({
        type: 'timestamp',
        nullable: true,
        comment:
            'Timestamp of the last update. Null on creation, auto-set on every update',
    })
    updatedAt: Date;

    @ApiProperty({
        type: String,
        format: 'date-time',
        description:
            'Business-level registration datetime of the purchase, set by the application',
    })
    @Column({
        type: 'timestamp',
        nullable: false,
        comment:
            'Business-level registration datetime of the purchase, set by the application',
    })
    @Index('idxCheckboxRegister')
    register: string;
}
