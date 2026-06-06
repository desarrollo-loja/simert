import { IsNumber } from 'class-validator';
import { LengthDb } from 'src/common/glob/length.db';
import { TypeActivity } from 'src/common/glob/type/type_activity';
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
  name: 'agentActivity',
  comment:
    'Logs control officer field activities (check-in, check-out, patrol) with location and shift context',
})
export class AgentActivity {
  @PrimaryGeneratedColumn('increment', {
    primaryKeyConstraintName: 'pkAgentActivityId',
  })
  @IsNumber()
  id: number;

  @Column('int', {
    comment:
      'User identifier of the control officer who performed the activity',
  })
  @Index('idxAgentActivityUserId')
  userId: number;

  @Column('int', { comment: 'Block identifier where the activity took place' })
  @Index('idxAgentActivityBlockId')
  blockId: number;

  @Column('int', {
    comment:
      'Block operator shift identifier during which the activity was registered',
  })
  @Index('idxAgentActivityBlockOperatorId')
  blockOperatorId: number;

  @Column('int', {
    comment:
      'Activity type: references TypeActivity enum (CHECK_IN, CHECK_OUT, PATROL, etc.)',
  })
  @Index('idxAgentActivityType')
  type: TypeActivity;

  @Column('varchar', {
    length: LengthDb.description,
    default: '',
    comment: 'Optional description or notes about the activity',
  })
  description: string;

  @Column({
    type: 'decimal',
    precision: 10,
    scale: 6,
    comment: 'Latitude coordinate where the activity was registered',
  })
  lt: number;

  @Column({
    type: 'decimal',
    precision: 10,
    scale: 6,
    comment: 'Longitude coordinate where the activity was registered',
  })
  lg: number;

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
