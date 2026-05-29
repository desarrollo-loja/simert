import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsNumber } from "class-validator";
import { LengthDb } from "src/common/glob/length.db";
import { StatusRange } from "src/common/glob/status/status_range";
import { TypeCard } from "src/common/glob/type/type_card";
import { Column, Entity, Index, PrimaryGeneratedColumn, Unique, UpdateDateColumn } from "typeorm";

@Entity('range')
@Unique('uqRangeFromTo', ['from', 'to'])
export class Range {

    @ApiProperty({ example: 1, description: 'Unique range identifier' })
    @PrimaryGeneratedColumn('increment', { primaryKeyConstraintName: 'pkRangeId' })
    @IsNumber()
    id: number;

    @ApiPropertyOptional({ example: 'Batch 2026 Q1', description: 'Optional description or notes for this card range batch' })
    @Column("varchar", { length: LengthDb.description, nullable: true, comment: 'Optional description or notes for this card range batch' })
    description: string;

    @ApiProperty({ example: 1, description: 'Batch lot number identifying which physical printing batch this range belongs to' })
    @Column("bigint", {
        default: 0,
        comment: 'Batch lot number identifying which physical printing batch this range belongs to'
    })
    batchNumber: number;

    @ApiProperty({ enum: TypeCard, description: 'Card type (TypeCard)' })
    @Column("int", { default: TypeCard.PHYSICAL, comment: 'Card type: references TypeCard enum (PHYSICAL, VIRTUAL, etc.)' })
    type: TypeCard;

    @ApiProperty({ enum: StatusRange, description: 'Range status (StatusRange)' })
    @Column("int", { default: StatusRange.AUTHORIZED, comment: 'Range status: references StatusRange enum (AUTHORIZED, USED, etc.)' })
    status: StatusRange;

    @ApiPropertyOptional({ type: String, format: 'date-time', description: 'Date and time when this card range was officially authorized for use' })
    @Index('idxRangeAuthorizationDate')
    @Column({ type: 'timestamp', nullable: true, comment: 'Date and time when this card range was officially authorized for use' })
    authorizationDate: Date;

    @ApiProperty({ example: '000000000001', maxLength: 12, description: 'First card number in this range (inclusive)' })
    @Column("varchar", { length: 12, nullable: false, comment: 'First card number in this range (inclusive)' })
    @Index('idxRangeFrom')
    from: string;

    @ApiProperty({ example: '000000001000', maxLength: 12, description: 'Last card number in this range (inclusive)' })
    @Column("varchar", { length: 12, nullable: false, comment: 'Last card number in this range (inclusive)' })
    @Index('idxRangeTo')
    to: string;

    @ApiProperty({ example: true, description: 'Whether this range is currently active and cards can be issued from it' })
    @Column('boolean', { default: true, comment: 'Whether this range is currently active and cards can be issued from it' })
    isActivated: boolean;

    @ApiProperty({ type: String, format: 'date-time', description: 'Creation timestamp' })
    @Column({ type: "timestamp", default: () => "now()", comment: 'Timestamp when the record was created' })
    createdAt: Date;

    @ApiPropertyOptional({ type: String, format: 'date-time', description: 'Last update timestamp' })
    @UpdateDateColumn({ type: 'timestamp', nullable: true, comment: 'Timestamp of the last update. Null on creation, auto-set on every update' })
    updatedAt: Date;
}
