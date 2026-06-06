import { IsNumber } from 'class-validator';
import {
  Column,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';

/**
 *
 */
@Entity('checkboxUser')
@Unique('uqCheckboxUserUserId', ['userId'])
export class CheckboxUser {
  @PrimaryGeneratedColumn('increment', {
    primaryKeyConstraintName: 'pkCheckboxUserId',
  })
  @IsNumber()
  id: number;

  @Column('int', { comment: 'User identifier who owns the checkboxes balance' })
  @Index('idxCheckboxUserUserId')
  userId: number;

  @Column('int', {
    comment: 'Number of parking fractions (checkboxes) available for this user',
  })
  checkboxes: number;

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
