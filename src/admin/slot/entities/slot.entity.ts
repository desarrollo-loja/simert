import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNumber } from 'class-validator';
import { Block } from 'src/admin/block/entities/block.entity';
import { Fraction } from 'src/admin/fraction/entities/fraction.entity';
import { Zone } from 'src/admin/zone/entities/zone.entity';
import { StatusSlot } from 'src/common/glob/status/status_slot';
import { TypeSlot } from 'src/common/glob/type/type_slot';
import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';

/**
 *
 */
@Entity('slot')
@Unique('uqSlotSlot', ['slot'])
export class Slot {
  @ApiProperty({ example: 1, description: 'Unique slot identifier' })
  @PrimaryGeneratedColumn('increment', { primaryKeyConstraintName: 'pkSlotId' })
  @IsNumber()
  id: number;

  @ApiProperty({
    example: 'A01',
    maxLength: 5,
    description: 'Display slot number/code',
  })
  @Column('varchar', {
    length: 5,
    nullable: true,
    comment: 'Display slot number shown on signage and app (e.g. "A01")',
  })
  @Index('idxSlotSlot')
  slot: string;

  @ApiProperty({
    example: true,
    description: 'Whether the slot is active and visible',
  })
  @Column('boolean', {
    default: true,
    comment: 'Whether this parking slot is currently active and visible',
  })
  isActivated: boolean;

  @ApiProperty({
    example: true,
    description: 'Whether the slot requires payment (false = free)',
  })
  @Column('boolean', {
    default: true,
    comment:
      'Whether this slot requires payment to park (false = free parking)',
  })
  isPaidParking: boolean;

  @ApiProperty({
    example: -3.99313,
    description: 'Latitude of the physical slot location',
  })
  @Column({
    type: 'decimal',
    precision: 10,
    scale: 6,
    comment: 'Latitude coordinate of the physical slot location',
  })
  lt: number;

  @ApiProperty({
    example: -79.20422,
    description: 'Longitude of the physical slot location',
  })
  @Column({
    type: 'decimal',
    precision: 10,
    scale: 6,
    comment: 'Longitude coordinate of the physical slot location',
  })
  lg: number;

  @ApiProperty({
    enum: StatusSlot,
    description: 'Occupancy status (StatusSlot)',
  })
  @Column({
    type: 'int',
    default: StatusSlot.AVAILABLE,
    comment:
      'Current occupancy status: references StatusSlot enum (AVAILABLE, OCCUPIED, SANCTIONED, etc.)',
  })
  @Index('idxSlotStatus')
  status: StatusSlot;

  @ApiProperty({
    enum: TypeSlot,
    description: 'Allowed vehicle type (TypeSlot)',
  })
  @Column({
    type: 'int',
    default: TypeSlot.Car,
    comment:
      'Vehicle type this slot is designated for: references TypeSlot enum (Car, Bike, etc.)',
  })
  @Index('idxSlotTypeSlot')
  typeSlot: TypeSlot;

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

  @ApiPropertyOptional({ type: () => Block, description: 'Associated block' })
  @Index('idxSlotBlock')
  @ManyToOne(() => Block, (block) => block.slots, {
    onDelete: 'RESTRICT',
    nullable: false,
    eager: false,
  })
  @JoinColumn({ name: 'blockId', foreignKeyConstraintName: 'fkSlotBlock' })
  block: Block;

  @ApiPropertyOptional({ type: () => Zone, description: 'Associated zone' })
  @Index('idxSlotZone')
  @ManyToOne(() => Zone, (zone) => zone.slots, {
    onDelete: 'RESTRICT',
    nullable: false,
    eager: false,
  })
  @JoinColumn({ name: 'zoneId', foreignKeyConstraintName: 'fkSlotZone' })
  zone: Zone;

  @ApiPropertyOptional({
    type: () => Fraction,
    isArray: true,
    description: 'Associated usage fractions',
  })
  @OneToMany(() => Fraction, (fraction) => fraction.slot, {
    cascade: false,
    eager: false,
  })
  fractions?: Fraction[];
}
