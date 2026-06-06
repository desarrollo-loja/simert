import { IsNumber } from 'class-validator';
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
  name: 'physic',
  comment:
    'Records parking sessions paid with physical cards, storing card number, time, fractions and zone',
})
export class Physic {
  @PrimaryGeneratedColumn('increment', {
    primaryKeyConstraintName: 'pkPhysicId',
  })
  @IsNumber()
  id: number;

  @Column('int', {
    unsigned: true,
    nullable: false,
    comment: 'User identifier who owns or used this physical card record',
  })
  userId: number;

  @Column('int', {
    unsigned: true,
    nullable: false,
    comment: 'Zone identifier where the physical card was used',
  })
  zoneId: number;

  @Column('varchar', {
    length: 12,
    nullable: false,
    comment: 'Physical card number used for the parking session',
  })
  @Index('idxPhysicCard')
  card: string;

  @Column('time', {
    comment: 'Total parking time purchased with this physical card (HH:mm:ss)',
  })
  time: string;

  @Column('int', {
    comment: 'Number of parking fractions consumed by the user with this card',
  })
  checkboxes: number;

  @Column('time', {
    comment:
      'Duration of one fraction for the block where this card was used (HH:mm:ss)',
  })
  timeByBlock: string;

  @Column('json', {
    nullable: true,
    comment:
      'Extra key-value pairs for session data not covered by explicit columns',
  })
  optionalData: OptionalDataInterface[];

  @Index('idxPhysicRegisterAt')
  @Column({
    type: 'timestamp',
    comment:
      'Operation datetime. When registered from operator it is adjusted to UTC since the client sends local time',
  })
  registerAt: Date;

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
