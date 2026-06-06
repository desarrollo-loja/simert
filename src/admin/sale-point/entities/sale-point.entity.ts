import { IsNumber } from 'class-validator';
import { Block } from 'src/admin/block/entities/block.entity';
import { RangeSalePoint } from 'src/admin/range-sale-point/entities/range-sale-point.entity';
import { Zone } from 'src/admin/zone/entities/zone.entity';
import { BillingDataDto } from 'src/common/dto/billing-data.dto';
import { LengthDb } from 'src/common/glob/length.db';
import { TypeModeSalePoint } from 'src/common/glob/type/type_mode_sale_point';
import { TypeSalePoint } from 'src/common/glob/type/type_sale_point';
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
@Entity({
  name: 'salePoint',
  comment:
    'Stores sale point agents with location, contact, banking, revenue settings and zone or block assignment',
})
@Unique('uqSalePointUserId', ['userId'])
export class SalePoint {
  @PrimaryGeneratedColumn('increment', {
    primaryKeyConstraintName: 'pkSalePointId',
  })
  @IsNumber()
  id: number;

  @Column('int', {
    comment:
      'Sale point operating mode: references TypeModeSalePoint enum (PHYSICAL, VIRTUAL, etc.)',
  })
  @Index('idxSalePointMode')
  mode: TypeModeSalePoint;

  @Column('int', {
    comment:
      'Sale point type: references TypeSalePoint enum (AGENT, STORE, etc.)',
  })
  @Index('idxSalePointType')
  type: TypeSalePoint;

  @Column({
    type: 'decimal',
    precision: 10,
    scale: 6,
    comment:
      'Latitude coordinate used to filter results in the call center search tool',
  })
  lt: number;

  @Column({
    type: 'decimal',
    precision: 10,
    scale: 6,
    comment:
      'Longitude coordinate used to filter results in the call center search tool',
  })
  lg: number;

  @Column('varchar', {
    length: LengthDb.title,
    comment: 'Main display title shown for this sale point in the UI',
  })
  title: string;

  @Column('varchar', {
    length: LengthDb.subTitle,
    comment: 'Secondary subtitle shown below the title in the UI',
  })
  subTitle: string;

  @Column('int', {
    comment:
      'User identifier of the agent who operates this sale point (unique per sale point)',
  })
  @Index('idxSalePointUserId')
  userId: number;

  @Column('json', {
    name: 'billingData',
    nullable: true,
    comment:
      'Billing data (name, identity card, address, etc.) for this sale point',
  })
  billing_data: BillingDataDto;

  @Column('varchar', {
    length: LengthDb.alias,
    comment: 'Alias or short name used to identify the bank account',
  })
  alias: string;

  @Column('varchar', {
    length: LengthDb.names,
    comment: 'Full name of the bank account holder',
  })
  names: string;

  @Column('varchar', {
    length: 200,
    comment: 'Bank account number for disbursements',
  })
  number: string;

  @Column('varchar', {
    length: LengthDb.email,
    nullable: true,
    comment: 'Email address of the sale point agent',
  })
  @Index('idxSalePointEmail')
  email: string;

  @Column('varchar', {
    length: 8,
    nullable: true,
    comment:
      'SIM country dialing code for the agent phone number (e.g. "+593" for Ecuador)',
  })
  @Index('idxSalePointCountryCode')
  countryCode: string;

  @Column('varchar', {
    length: LengthDb.phone,
    nullable: true,
    comment: 'Phone number of the sale point agent',
  })
  @Index('idxSalePointPhone')
  phone: string;

  @Column('varchar', {
    length: LengthDb.image,
    nullable: true,
    comment: 'URL or path to the QR code image for this sale point',
  })
  qr: string;

  @Column('boolean', {
    default: false,
    comment: 'Whether this sale point has been approved by an administrator',
  })
  isApproved: boolean;

  @Column('int', {
    default: null,
    comment:
      'User identifier of the administrator who approved this sale point',
  })
  @Index('idxSalePointUserIdApproved')
  userIdApproved: number;

  @Column('int', {
    nullable: true,
    comment: 'Zone identifier where this sale point is located',
  })
  @Index('idxSalePointZoneId')
  zoneId: number;

  @ManyToOne(() => Zone, (zone) => zone.salePoints, {
    onDelete: 'SET NULL',
    nullable: true,
  })
  @JoinColumn({ name: 'zoneId', foreignKeyConstraintName: 'fkSalePointZone' })
  zone: Zone;

  @Column('int', {
    nullable: true,
    comment: 'Block identifier where this sale point is located',
  })
  @Index('idxSalePointBlockId')
  blockId: number;

  @ManyToOne(() => Block, (block) => block.salePoints, {
    onDelete: 'SET NULL',
    nullable: true,
  })
  @JoinColumn({ name: 'blockId', foreignKeyConstraintName: 'fkSalePointBlock' })
  block: Block;

  @OneToMany(
    () => RangeSalePoint,
    (rangeSalePoint) => rangeSalePoint.salePoint,
    { cascade: false, eager: false, onDelete: 'NO ACTION' },
  )
  rangeSalePoints: RangeSalePoint[];

  // Revenue configuration
  @Column('int', {
    nullable: true,
    comment:
      'Revenue category applied on card sales: references TypeSalePoint enum',
  })
  @Index('idxSalePointCardRevenue')
  cardRevenue: TypeSalePoint;

  @Column('int', {
    default: 0,
    comment: 'Fixed revenue amount applied per card sale',
  })
  cardRevenueValue: number;

  @Column('int', {
    nullable: true,
    comment:
      'Revenue category applied on balance transactions: references TypeSalePoint enum',
  })
  @Index('idxSalePointBalanceRevenue')
  balanceRevenue: TypeSalePoint;

  @Column('int', {
    default: 0,
    nullable: true,
    comment: 'Fixed revenue amount applied per balance transaction',
  })
  balanceRevenueValue: number;

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
