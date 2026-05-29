import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsNumber } from "class-validator";
import { RangeSalePointTransaction } from "src/admin/range-sale-point-transaction/entities/range-sale-point-transaction.entity";
import { SalePoint } from "src/admin/sale-point/entities/sale-point.entity";
import { LengthDb } from "src/common/glob/length.db";
import { Column, Entity, Index, JoinColumn, ManyToOne, OneToMany, PrimaryGeneratedColumn, UpdateDateColumn } from "typeorm";

@Entity('rangeSalePoint')
export class RangeSalePoint {
    @ApiProperty({ example: 1, description: 'Unique range-sale-point identifier' })
    @PrimaryGeneratedColumn('increment')
    @IsNumber()
    id: number;

    @ApiProperty({ example: 10, description: 'User identifier of the agent who wants to buy (receive) the card range' })
    @Column("int", { comment: 'User identifier of the agent who wants to buy (receive) the card range' })
    @Index()
    userId: number;

    @ApiProperty({ example: 20, description: 'User identifier of the agent who performs the sale (provides the cards)' })
    @Column("int", { comment: 'User identifier of the agent who performs the sale (provides the cards)' })
    @Index()
    userIdSale: number;

    @ApiPropertyOptional({ example: 1, description: 'Sale point identifier from which this range was issued' })
    @Column({ type: "int", nullable: true, comment: 'Sale point identifier from which this range was issued' })
    @Index()
    salePointId: number;

    @ApiPropertyOptional({ type: () => SalePoint, description: 'Associated sale point' })
    @ManyToOne(() => SalePoint, (salePoint) => salePoint.rangeSalePoints, { nullable: true })
    @JoinColumn({ name: 'salePointId' })
    salePoint: SalePoint;

    @ApiProperty({ example: 100, description: 'Number of cards currently available (not yet used) in this range' })
    @Column("int", { comment: 'Number of cards currently available (not yet used) in this range' })
    available: number;

    @ApiProperty({ example: 50, description: 'Number of cards already sold from this range' })
    @Column("int", { comment: 'Number of cards already sold from this range' })
    sold: number;

    @ApiProperty({ example: 'Batch delivered on 2026-01-15', description: 'Optional notes or description about this card range assignment' })
    @Column("varchar", { default: '', length: LengthDb.details, comment: 'Optional notes or description about this card range assignment' })
    description: string;

    @ApiPropertyOptional({ type: () => RangeSalePointTransaction, isArray: true, description: 'Transactions related to this range-sale-point' })
    @OneToMany(
        () => RangeSalePointTransaction,
        rangeSalePointTransaction => rangeSalePointTransaction.rangeSalePoint,
        { cascade: false, eager: false, onDelete: "NO ACTION", }
    )
    rangeSalePointTransactions: RangeSalePointTransaction[];

    @ApiProperty({ type: String, format: 'date-time', description: 'Creation timestamp' })
    @Column({ type: "timestamp", default: () => "now()", comment: 'Timestamp when the record was created' })
    createdAt: Date;

    @ApiPropertyOptional({ type: String, format: 'date-time', description: 'Last update timestamp' })
    @UpdateDateColumn({ type: 'timestamp', nullable: true, comment: 'Timestamp of the last update. Null on creation, auto-set on every update' })
    updatedAt: Date;
}
