import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsNumber } from "class-validator";
import { Block } from "src/admin/block/entities/block.entity";
import { Fraction } from "src/admin/fraction/entities/fraction.entity";
import { SalePoint } from "src/admin/sale-point/entities/sale-point.entity";
import { Slot } from "src/admin/slot/entities/slot.entity";
import { LengthDb } from "src/common/glob/length.db";
import { TypeZone } from "src/common/glob/type/type_zone";
import { ScheduleInterface } from "src/common/intefaces/schedule.interface";
import { Column, Entity, Index, OneToMany, PrimaryGeneratedColumn, Unique, UpdateDateColumn } from "typeorm";

@Entity()
@Unique(["name", "acronym"])
@Index(['name'], { fulltext: true })
export class Zone {

    @ApiProperty({ example: 1, description: 'Unique zone identifier' })
    @PrimaryGeneratedColumn('increment')
    @IsNumber()
    id: number;

    @ApiProperty({ example: 'Zone A', maxLength: 20, description: 'Display zone name' })
    @Column("varchar", { length: 20, comment: 'Display name of the zone (e.g. "Zone A", "Zone B")' })
    name: string;

    @ApiProperty({ example: 'Downtown paid parking area', description: 'Detailed description' })
    @Column("varchar", { length: LengthDb.description, default: '', comment: 'Detailed description of the zone area' })
    description: string;

    @ApiProperty({ example: 'ZA', maxLength: 7, description: 'Short acronym identifying the zone' })
    @Column("varchar", { length: 7, comment: 'Short acronym identifying the zone (e.g. "ZA", "ZB")' })
    @Index()
    acronym: string;

    @ApiProperty({ example: '#FF5733', maxLength: 7, description: 'Hex color used on the map UI' })
    @Column("varchar", { length: 7, comment: 'Hex color code used to display the zone on the map UI' })
    color: string;

    @ApiProperty({ example: -3.99313, description: 'Latitude of zone center' })
    @Column({ type: 'decimal', precision: 10, scale: 6, comment: 'Latitude coordinate of the zone center point' })
    lt: number;

    @ApiProperty({ example: -79.20422, description: 'Longitude of zone center' })
    @Column({ type: 'decimal', precision: 10, scale: 6, comment: 'Longitude coordinate of the zone center point' })
    lg: number;

    @ApiPropertyOptional({ description: 'PostGIS MultiPolygon (SRID 4326). Returned as parsed GeoJSON' })
    @Column({ type: 'geometry', spatialFeatureType: 'MultiPolygon', srid: 4326, nullable: true, comment: 'PostGIS MultiPolygon geometry defining the zone geographic boundary (SRID 4326)' })
    geofence: any;

    @ApiProperty({ example: true, description: 'Whether the zone is currently active' })
    @Column("boolean", { default: true, comment: 'Whether this zone is currently active and available for parking' })
    isActivated: boolean;

    @ApiPropertyOptional({ description: 'Deprecated JSON schedule. Use Schedule entity instead' })
    @Column("json", { nullable: true, comment: 'Deprecated schedule configuration stored as JSON. Use the Schedule entity instead' })
    schedules: ScheduleInterface[];

    @ApiProperty({ enum: TypeZone, description: 'Zone type (NORMAL, TEMPORARY, etc.)' })
    @Column("int", { default: TypeZone.NORMAL, comment: 'Zone type: references TypeZone enum (NORMAL, TEMPORARY, etc.)' })
    type: TypeZone;

    @ApiPropertyOptional({ type: String, format: 'date-time', description: 'Start datetime (only when type = TEMPORARY)' })
    @Index()
    @Column({ type: 'timestamp', nullable: true, comment: 'Start datetime for a temporary zone. Only applies when type = TEMPORARY' })
    fromTemporary: Date;

    @ApiPropertyOptional({ type: String, format: 'date-time', description: 'End datetime (only when type = TEMPORARY)' })
    @Index()
    @Column({ type: 'timestamp', nullable: true, comment: 'End datetime for a temporary zone. Only applies when type = TEMPORARY' })
    toTemporary: Date;

    @ApiProperty({ type: String, format: 'date-time', description: 'Creation timestamp' })
    @Column({ type: "timestamp", default: () => "now()", comment: 'Timestamp when the record was created' })
    createdAt: Date;

    @ApiPropertyOptional({ type: String, format: 'date-time', description: 'Last update timestamp' })
    @UpdateDateColumn({ type: 'timestamp', nullable: true, comment: 'Timestamp of the last update. Null on creation, auto-set on every update' })
    updatedAt: Date;

    @ApiPropertyOptional({ type: () => Block, isArray: true })
    @OneToMany(
        () => Block,
        (block) => block.zone,
        { cascade: false, eager: false }
    )
    blocks?: Block[];

    @ApiPropertyOptional({ type: () => Slot, isArray: true })
    @OneToMany(
        () => Slot,
        (slot) => slot.block,
        { cascade: false, eager: false }
    )
    slots?: Slot[];

    @ApiPropertyOptional({ type: () => Fraction, isArray: true })
    @OneToMany(
        () => Fraction,
        (fraction) => fraction.slot,
        { cascade: false, eager: false }
    )
    fractions?: Fraction[];

    @ApiPropertyOptional({ type: () => SalePoint, isArray: true })
    @OneToMany(
        () => SalePoint,
        (salePoint) => salePoint.zone,
        { cascade: false, eager: false }
    )
    salePoints?: SalePoint[];
}
