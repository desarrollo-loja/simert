import { IsNumber } from 'class-validator';
import { LengthDb } from 'src/common/glob/length.db';
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
@Entity({
  name: 'incidentType',
  comment:
    'Catalog of infraction types with GIM code and percentage of basic salary used to calculate fine amounts',
})
@Index('idxIncidentTypeName', ['name'], { fulltext: true })
@Index('idxIncidentTypeDescription', ['description'], { fulltext: true })
@Unique('uqIncidentTypeCode', ['code'])
export class IncidentType {
  @PrimaryGeneratedColumn('increment', {
    primaryKeyConstraintName: 'pkIncidentTypeId',
  })
  @IsNumber()
  id: number;

  @Column('varchar', {
    length: LengthDb.names,
    comment: 'Human-readable name of the infraction type',
  })
  name: string;

  @Column('varchar', {
    length: LengthDb.details,
    comment: 'Detailed description of what this infraction type covers',
  })
  description: string;

  @Column('varchar', {
    length: LengthDb.code,
    comment:
      'GIM system code (rubro) that uniquely identifies this infraction type in the external system',
  })
  code: string;

  @Column('varchar', {
    length: LengthDb.code,
    nullable: true,
    comment:
      'Accounting account code (código cuenta contable) used to post the fine amount in the accounting ledger',
  })
  accountingAccountCode: string;

  @Column('decimal', {
    precision: 5,
    scale: 2,
    default: 0,
    comment:
      'Percentage of the basic salary used to calculate the fine amount for this infraction type',
  })
  percentage: number;

  @Column('boolean', {
    default: true,
    comment:
      'Whether this incident type is currently active and available for use',
  })
  isActivated: boolean;

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
