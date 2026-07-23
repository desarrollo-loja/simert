import { Fraction } from 'src/admin/fraction/entities/fraction.entity';
import { Status } from 'src/admin/status/entities/status.entity';
import { StatusMoment } from 'src/common/glob/status/status_moment';
import {
    Column,
    Entity,
    Index,
    JoinColumn,
    ManyToOne,
    PrimaryGeneratedColumn,
    UpdateDateColumn,
} from 'typeorm';

/**
 *
 */
@Entity({
    name: 'fractionStatus',
    comment:
        'Tracks the historical status changes of each parking fraction over its lifecycle',
})
@Index('idxFractionStatusFractionStatus', ['fraction', 'status'])
export class FractionStatus {
    @PrimaryGeneratedColumn('increment', {
        primaryKeyConstraintName: 'pkFractionStatusId',
    })
    id: number;

    @Column('smallint', {
        unsigned: true,
        default: StatusMoment.REQUESTED,
        comment:
            'Delivery moment of this status: references StatusMoment enum (REQUESTED, NOTIFIED, etc.)',
    })
    moment: number;

    @Index('idxFractionStatusFraction')
    @ManyToOne(() => Fraction, (fraction) => fraction.fractions, {
        cascade: false,
        eager: false,
        onDelete: 'NO ACTION',
    })
    @JoinColumn({
        name: 'fractionId',
        foreignKeyConstraintName: 'fkFractionStatusFraction',
    })
    fraction: Fraction;

    @Index('idxFractionStatusStatus')
    @ManyToOne(() => Status, (status) => status.fractionsStatus, {
        cascade: false,
        eager: false,
        onDelete: 'NO ACTION',
    })
    @JoinColumn({
        name: 'statusId',
        foreignKeyConstraintName: 'fkFractionStatusStatus',
    })
    status: Status;

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
}
