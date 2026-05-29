import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsNumber } from "class-validator";
import { RangeSalePoint } from "src/admin/range-sale-point/entities/range-sale-point.entity";
import { Column, Entity, Index, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn } from "typeorm";

@Entity('rangeSalePointTransaction')
export class RangeSalePointTransaction {
    @ApiProperty({ example: 1, description: 'Unique transaction identifier' })
    @PrimaryGeneratedColumn('increment')
    @IsNumber()
    id: number;

    @ApiProperty({ example: 20, description: 'User identifier of the agent who sold the card range' })
    @Column("int", { comment: 'User identifier of the agent who sold the card range' })
    @Index()
    userIdSell: number;

    @ApiProperty({ example: 10, description: 'User identifier of the agent who bought the card range' })
    @Column("int", { comment: 'User identifier of the agent who bought the card range' })
    @Index()
    userIdBuy: number;

    @ApiProperty({ example: 5, description: 'Number of cards (checkboxes) transferred in this transaction' })
    @Column("int", { comment: 'Number of cards (checkboxes) transferred in this transaction' })
    amount: number;

    @ApiPropertyOptional({ type: () => RangeSalePoint, description: 'Parent range-sale-point' })
    @ManyToOne(
        () => RangeSalePoint,
        rangeSalePoint => rangeSalePoint.rangeSalePointTransactions,
        { nullable: false }
    )
    rangeSalePoint: RangeSalePoint

    @ApiProperty({ type: String, format: 'date-time', description: 'Creation timestamp' })
    @Column({ type: "timestamp", default: () => "now()", comment: 'Timestamp when the record was created' })
    createdAt: Date;

    @ApiPropertyOptional({ type: String, format: 'date-time', description: 'Last update timestamp' })
    @UpdateDateColumn({ type: 'timestamp', nullable: true, comment: 'Timestamp of the last update. Null on creation, auto-set on every update' })
    updatedAt: Date;
}
