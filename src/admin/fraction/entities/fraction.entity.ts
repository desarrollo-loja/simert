import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsNumber } from "class-validator";
import { Block } from "src/admin/block/entities/block.entity";
import { FractionStatus } from "src/admin/fraction_status/entities/fraction_status.entity";
import { Incident } from "src/admin/incident/entities/incident.entity";
import { Slot } from "src/admin/slot/entities/slot.entity";
import { Status } from "src/admin/status/entities/status.entity";
import { Zone } from "src/admin/zone/entities/zone.entity";
import { LengthDb } from "src/common/glob/length.db";
import { TypeFraction } from "src/common/glob/type/type_fraction";
import { MetaInterface } from "src/common/intefaces/meta.interface";
import { OptionalDataInterface } from "src/common/intefaces/optional-data.interface";
import { BeforeInsert, Column, Entity, Index, ManyToOne, OneToMany, PrimaryGeneratedColumn, Unique, UpdateDateColumn } from "typeorm";

@Entity('fraction')
@Unique(['userId', 'transactionId'])
export class Fraction {

    @ApiProperty({ example: 1, description: 'Unique fraction identifier' })
    @PrimaryGeneratedColumn('increment')
    @IsNumber()
    id: number;

    @ApiProperty({ example: 1, description: 'Service section city identifier for internal routing' })
    @Column("int", { comment: 'Service section city identifier for internal routing' })
    @Index()
    serviceSectionCityId: number;

    @ApiProperty({ example: 123, description: 'User identifier who owns this parking session (operator or client)' })
    @Column("int", { comment: 'User identifier who owns this parking session (operator or client)' })
    @Index()
    userId: number;

    @ApiProperty({ example: 'b6fabf7a-9a4e-4c9e-83a2-8ef6b39c8b21', maxLength: 36, description: 'Unique transaction ID sent by the API consumer for idempotency checks' })
    @Column("varchar", { length: 36, comment: 'Unique transaction ID sent by the API consumer for idempotency checks' })
    transactionId: string;

    @ApiProperty({ enum: TypeFraction, description: 'Fraction type (TypeFraction)' })
    @Column({ type: 'int', comment: 'Fraction type: references TypeFraction enum (PHYSICAL, VIRTUAL, etc.)' })
    @Index()
    typeFraction: TypeFraction;

    @ApiProperty({ example: '00:15:00', description: 'Duration of one parking fraction for the block where this session was registered (HH:mm:ss)' })
    @Column("time", { comment: 'Duration of one parking fraction for the block where this session was registered (HH:mm:ss)' })
    timeByBlock: string;

    @ApiProperty({ example: '00:00:00', description: 'Accumulated time from previous increments before this fraction (HH:mm:ss)' })
    @Column("time", { default: "00:00:00", comment: 'Accumulated time from previous increments before this fraction (HH:mm:ss)' })
    beforeTime: string;

    @ApiProperty({ example: '00:30:00', description: 'Total parking time for this fraction, auto-calculated on insert (HH:mm:ss)' })
    @Column("time", { comment: 'Total parking time for this fraction, auto-calculated on insert from checkboxes * timeByBlock (HH:mm:ss)' })
    time: string;

    @ApiProperty({ example: 2, description: 'Number of parking fractions purchased by the user for this session' })
    @Column("int", { comment: 'Number of parking fractions purchased by the user for this session' })
    checkboxes: number;

    @ApiPropertyOptional({ example: 'LOJ1234', description: 'License plate of the parked vehicle (null for virtual card sessions)' })
    @Index()
    @Column("varchar", { length: LengthDb.plate, default: null, nullable: true, comment: 'License plate of the parked vehicle (null for virtual card sessions)' })
    plate: string;

    @ApiPropertyOptional({ example: '123456789012', description: 'Physical or virtual card number used for this session' })
    @Index()
    @Column("varchar", { length: 12, default: null, nullable: true, comment: 'Physical or virtual card number used for this session (null for plate-based sessions)' })
    card: string;

    @ApiProperty({ example: 'My car', description: 'Alias or nickname assigned to the vehicle by the user' })
    @Column("varchar", { length: 25, default: '', comment: 'Alias or nickname assigned to the vehicle by the user' })
    alias: string;

    @ApiProperty({ example: 'red', description: 'Vehicle color tint identifier used for display purposes' })
    @Column("varchar", { length: 25, comment: 'Vehicle color tint identifier used for display purposes' })
    tint: string;

    @ApiProperty({ example: 'https://cdn.example.com/img.png', description: 'URL of the vehicle image uploaded by the user' })
    @Column("varchar", { length: 255, default: '', comment: 'URL of the vehicle image uploaded by the user' })
    image: string;

    @ApiProperty({ type: String, format: 'date-time', description: 'Operation datetime (adjusted to UTC when sent by operator)' })
    @Index()
    @Column({ type: 'timestamp', comment: 'Operation datetime. When registered from operator it is adjusted to UTC since the client sends local time' })
    registerAt: Date;

    @ApiProperty({ type: String, format: 'date-time', description: 'Calculated departure datetime based on registerAt + time' })
    @Index()
    @Column({ type: 'timestamp', comment: 'Calculated departure datetime based on registerAt + time. Auto-computed on insert' })
    departureDate: Date;

    @ApiPropertyOptional({ description: 'Extra key-value pairs for session data not covered by explicit columns', type: 'array' })
    @Column("json", { nullable: true, comment: 'Extra key-value pairs for session data not covered by explicit columns' })
    optionalData: OptionalDataInterface[];

    @ApiProperty({ type: String, format: 'date-time', description: 'Creation timestamp' })
    @Index()
    @Column({ type: "timestamp", default: () => "now()", comment: 'Timestamp when the record was created' })
    createdAt: Date;

    @ApiPropertyOptional({ type: String, format: 'date-time', description: 'Last update timestamp' })
    @UpdateDateColumn({ type: 'timestamp', nullable: true, comment: 'Timestamp of the last update. Null on creation, auto-set on every update' })
    updatedAt: Date;

    // WARNING: never select this column from the web layer
    @ApiPropertyOptional({ description: 'Raw device/client metadata captured at registration time. Must never be exposed via web endpoints' })
    @Column({ type: 'json', comment: 'Raw device/client metadata captured at registration time. Must never be exposed via web endpoints' })
    meta: MetaInterface;

    @ApiPropertyOptional({ type: () => Slot, description: 'Associated slot' })
    @Index()
    @ManyToOne(
        () => Slot,
        (slot) => slot.fractions,
        { onDelete: "RESTRICT", nullable: false, eager: false }
    )
    slot: Slot;

    @ApiPropertyOptional({ type: () => Block, description: 'Associated block' })
    @Index()
    @ManyToOne(
        () => Block,
        (block) => block.fractions,
        { onDelete: "RESTRICT", nullable: false, eager: false }
    )
    block: Block;

    @ApiPropertyOptional({ type: () => Zone, description: 'Associated zone' })
    @Index()
    @ManyToOne(
        () => Zone,
        (zone) => zone.fractions,
        { onDelete: "RESTRICT", nullable: false, eager: false }
    )
    zone: Zone;

    @ApiPropertyOptional({ type: () => Status, description: 'Current status' })
    @Index()
    @ManyToOne(
        () => Status,
        (status) => status.fractions,
        { nullable: false }
    )
    status: Status;

    @ApiProperty({ example: '2024-05-10 10:30:00', description: 'Business-level registration datetime of the session, set by the application' })
    @Column({ type: "timestamp", nullable: false, comment: 'Business-level registration datetime of the session, set by the application' })
    @Index()
    register: string;

    @ApiPropertyOptional({ type: () => FractionStatus, isArray: true, description: 'Historical statuses for this fraction' })
    @OneToMany(
        () => FractionStatus,
        (fractionStatus) => fractionStatus.fraction,
        { cascade: false, eager: false, onDelete: "NO ACTION", }
    )
    fractions: FractionStatus[];

    @ApiPropertyOptional({ type: () => Incident, isArray: true, description: 'Incidents registered against this fraction' })
    @OneToMany(
        () => Incident,
        (incident) => incident.fraction,
        { cascade: false, eager: false, onDelete: "NO ACTION", }
    )
    incidents: Incident[];

    @BeforeInsert()
    updateInsert(): void {
        // Split the timeByBlock into hours, minutes, and seconds
        const [hours, minutes, seconds] = this.timeByBlock.split(':').map(Number);

        // Calculate the new time by multiplying with the number of checkboxes
        const newHours = hours * this.checkboxes;
        const newMinutes = minutes * this.checkboxes;
        const newSeconds = seconds * this.checkboxes;

        // Adjust the new time
        const [adjustedHours, adjustedMinutes, adjustedSeconds] = this._adjustTime([
            newHours,
            newMinutes,
            newSeconds,
        ]);

        // Format the result with leading zeros
        const formatNumber = (number) => number.toString().padStart(2, '0');
        let result = `${formatNumber(adjustedHours)}:${formatNumber(
            adjustedMinutes
        )}:${formatNumber(adjustedSeconds)}`;

        // Add beforeTime to the result if it's not "00:00:00"
        if (this.beforeTime) {
            const [beforeHours, beforeMinutes, beforeSeconds] = this.beforeTime.split(':');

            const totalHours = adjustedHours + Number(beforeHours);
            const totalMinutes = adjustedMinutes + Number(beforeMinutes);
            const totalSeconds = adjustedSeconds + Number(beforeSeconds);

            // Adjust again in case the sum exceeds 24 hours
            const [finalHours, finalMinutes, finalSeconds] = this._adjustTime([
                totalHours,
                totalMinutes,
                totalSeconds,
            ]);

            result = `${formatNumber(finalHours)}:${formatNumber(finalMinutes)}:${formatNumber(finalSeconds)}`;
        }

        this.time = result;

        if (this.registerAt && this.time) {
            const registerDateTime = new Date(this.registerAt);
            const [hours, minutes, seconds] = this.time.split(':');

            registerDateTime.setHours(registerDateTime.getHours() + Number(hours));
            registerDateTime.setMinutes(registerDateTime.getMinutes() + Number(minutes));
            registerDateTime.setSeconds(registerDateTime.getSeconds() + Number(seconds));

            this.departureDate = registerDateTime;
        }
    }

    // Adjust minutes and seconds if they exceed 60
    private _adjustTime = (time: number[]) => {
        let [h, m, s] = time;
        if (s >= 60) {
            const minExtra = Math.floor(s / 60);
            m += minExtra;
            s %= 60;
        }
        if (m >= 60) {
            const hrExtra = Math.floor(m / 60);
            h += hrExtra;
            m %= 60;
        }
        if (h >= 24) {
            h %= 24;
        }
        return [h, m, s];
    };
}
