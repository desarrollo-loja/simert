import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsNumber } from "class-validator";
import { BlockOperator } from "src/admin/block_operator/entities/block_operator.entity";
import { Fraction } from "src/admin/fraction/entities/fraction.entity";
import { SalePoint } from "src/admin/sale-point/entities/sale-point.entity";
import { Schedule } from "src/admin/schedule/entities/schedule.entity";
import { Slot } from "src/admin/slot/entities/slot.entity";
import { Zone } from "src/admin/zone/entities/zone.entity";
import { LengthDb } from "src/common/glob/length.db";
import { Column, Entity, Index, JoinColumn, ManyToOne, OneToMany, PrimaryGeneratedColumn, Unique, UpdateDateColumn } from "typeorm";

@Entity('block')
@Index('idxBlockName', ['name'], { fulltext: true })
@Index('idxBlockNeighborhood', ['neighborhood'], { fulltext: true })
@Index('idxBlockMainStreet', ['mainStreet'], { fulltext: true })
@Index('idxBlockSideStreet', ['sideStreet'], { fulltext: true })
@Unique('uqBlockName', ['name'])
@Unique('uqBlockAcronym', ['acronym'])
export class Block {

    @ApiProperty({ example: 1, description: 'Unique block identifier' })
    @PrimaryGeneratedColumn('increment', { primaryKeyConstraintName: 'pkBlockId' })
    @IsNumber()
    id: number;

    @ApiProperty({ example: 'Zona A', maxLength: 20, description: 'Display name of the block (sector)' })
    @Column({ type: 'citext', comment: 'Display name of the block (sector)' })
    name: string;

    @ApiProperty({ example: 'Downtown sector with high rotation', description: 'Detailed description of the block area' })
    @Column("varchar", { length: LengthDb.description, default: '', comment: 'Detailed description of the block area' })
    description: string;

    @ApiProperty({ example: 0, description: 'Display priority order for this block (lower value = higher priority)' })
    @Column("int", { default: 0, comment: 'Display priority order for this block (lower value = higher priority)' })
    priority: number;

    @ApiProperty({ example: 'ZA', maxLength: 7, description: 'Short acronym identifying the block (e.g. "A", "B1")' })
    @Index('idxBlockAcronym')
    @Column({ type: 'citext', comment: 'Short acronym identifying the block (e.g. "A", "B1")' })
    acronym: string;

    @ApiProperty({ example: '#7986CB', maxLength: 7, description: 'Hex color code used to display the block on the map UI' })
    @Column("varchar", { length: 7, comment: 'Hex color code used to display the block on the map UI' })
    color: string;

    @ApiProperty({ example: -3.99313, description: 'Latitude coordinate of the block center point' })
    @Column({ type: 'decimal', precision: 10, scale: 6, comment: 'Latitude coordinate of the block center point' })
    lt: number;

    @ApiProperty({ example: -79.20422, description: 'Longitude coordinate of the block center point' })
    @Column({ type: 'decimal', precision: 10, scale: 6, comment: 'Longitude coordinate of the block center point' })
    lg: number;

    @ApiPropertyOptional({ description: 'PostGIS MultiPolygon geometry defining the block geographic boundary (SRID 4326)' })
    @Column({ type: 'geometry', spatialFeatureType: 'MultiPolygon', srid: 4326, nullable: true, comment: 'PostGIS MultiPolygon geometry defining the block geographic boundary (SRID 4326)' })
    geofence: any;

    @ApiProperty({ example: 'Centro', description: 'Neighborhood or district name where the block is located' })
    @Column("varchar", { length: 200, default: '', comment: 'Neighborhood or district name where the block is located' })
    neighborhood: string;

    @ApiProperty({ example: 'Av. Universitaria', description: 'Name of the main street that borders the block' })
    @Column("varchar", { length: 200, default: '', comment: 'Name of the main street that borders the block' })
    mainStreet: string;

    @ApiProperty({ example: 'Calle Bolivar', description: 'Name of the secondary (side) street that borders the block' })
    @Column("varchar", { length: 200, default: '', comment: 'Name of the secondary (side) street that borders the block' })
    sideStreet: string;

    @ApiProperty({ example: '01:30:00', description: 'Maximum allowed parking time for this block (HH:mm:ss, typically 01:00:00)' })
    @Column("time", { comment: 'Maximum allowed parking time for this block (HH:mm:ss, typically 01:00:00)' })
    timeLimit: string;

    @ApiProperty({ example: '00:15:00', description: 'Grace period allowed before a fine is issued (HH:mm:ss, typically 00:15:00)' })
    @Column("time", { comment: 'Grace period allowed before a fine is issued (HH:mm:ss, typically 00:15:00)' })
    timeGrace: string;

    @ApiProperty({ example: '00:15:00', description: 'Duration of one parking fraction in this block (HH:mm:ss)' })
    @Column("time", { comment: 'Duration of one parking fraction in this block (HH:mm:ss, e.g. zone A=00:15:00, zone B=00:30:00)' })
    timePerFraction: string;

    @ApiProperty({ example: true, description: 'Whether this block is currently active and available for parking' })
    @Column("boolean", { default: true, comment: 'Whether this block is currently active and available for parking' })
    isActivated: boolean;

    @ApiProperty({ type: String, format: 'date-time', description: 'Creation timestamp' })
    @Column({ type: "timestamp", default: () => "now()", comment: 'Timestamp when the record was created' })
    createdAt: Date;

    @ApiPropertyOptional({ type: String, format: 'date-time', description: 'Last update timestamp' })
    @UpdateDateColumn({ type: 'timestamp', nullable: true, comment: 'Timestamp of the last update. Null on creation, auto-set on every update' })
    updatedAt: Date;

    @ApiPropertyOptional({ type: () => Zone, description: 'Associated zone' })
    @Index('idxBlockZone')
    @ManyToOne(
        () => Zone,
        (zone) => zone.blocks,
        { onDelete: "RESTRICT", nullable: false, eager: false }
    )
    @JoinColumn({ name: 'zoneId', foreignKeyConstraintName: 'fkBlockZone' })
    zone: Zone;

    @ApiPropertyOptional({ type: () => BlockOperator, isArray: true, description: 'Block operator assignments for this block' })
    @OneToMany(
        () => BlockOperator,
        (blockOperator) => blockOperator.block,
        { cascade: false, eager: false }
    )
    blocksOperator?: BlockOperator[];

    @ApiPropertyOptional({ type: () => Slot, isArray: true, description: 'Slots belonging to this block' })
    @OneToMany(
        () => Slot,
        (slot) => slot.block,
        { cascade: false, eager: false }
    )
    slots?: Slot[];

    @ApiPropertyOptional({ type: () => Fraction, isArray: true, description: 'Parking fractions registered on this block' })
    @OneToMany(
        () => Fraction,
        (fraction) => fraction.block,
        { cascade: false, eager: false }
    )
    fractions?: Fraction[];

    @ApiPropertyOptional({ type: () => Schedule, isArray: true, description: 'Opening schedules for this block' })
    @OneToMany(
        () => Schedule,
        (schedule) => schedule.block,
        { cascade: true, eager: false }
    )
    schedules?: Schedule[];

    @ApiPropertyOptional({ type: () => SalePoint, isArray: true, description: 'Sale points linked to this block' })
    @OneToMany(
        () => SalePoint,
        (salePoint) => salePoint.block,
        { cascade: false, eager: false }
    )
    salePoints?: SalePoint[];

}
