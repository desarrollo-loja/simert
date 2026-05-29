import { IsPositive } from "class-validator";
import { Block } from "src/admin/block/entities/block.entity";
import { Column, Entity, Index, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn } from "typeorm";

@Entity('schedule')
@Index(['block', 'dayOfWeekInit'])
@Index(['block', 'dayOfWeekEnd'])
export class Schedule {

    @PrimaryGeneratedColumn()
    @IsPositive()
    id: number;

    @Column('boolean', { default: true, comment: 'Whether this schedule rule is currently active' })
    isActivated: boolean;

    @Column('smallint', { comment: 'Day of the week the schedule starts (0=Sunday, 6=Saturday)' })
    dayOfWeekInit: number;

    @Column('smallint', { comment: 'Day of the week the schedule ends (0=Sunday, 6=Saturday)' })
    dayOfWeekEnd: number;

    @Column('time', { comment: 'Time of day when the paid parking period opens (HH:mm:ss)' })
    openingTime: string;

    @Column('time', { comment: 'Time of day when the paid parking period closes (HH:mm:ss)' })
    closingTime: string;

    @Column({ type: "timestamp", default: () => "now()", comment: 'Timestamp when the record was created' })
    createdAt: Date;

    @UpdateDateColumn({ type: 'timestamp', nullable: true, comment: 'Timestamp of the last update. Null on creation, auto-set on every update' })
    updatedAt: Date;

    @Index()
    @ManyToOne(
        () => Block,
        (block) => block.schedules,
        { onDelete: "CASCADE" }
    )
    block: Block;

}
