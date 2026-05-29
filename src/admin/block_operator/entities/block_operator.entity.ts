import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Block } from "src/admin/block/entities/block.entity";
import { Column, Entity, Index, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn } from "typeorm";

@Entity('blockOperator')
@Index(['userId', 'block'])
export class BlockOperator {

    @ApiProperty({ example: 1, description: 'Unique block operator shift identifier' })
    @PrimaryGeneratedColumn('increment')
    id: number;

    @ApiProperty({ example: true, description: 'Whether this shift assignment is currently active' })
    @Column('boolean', { default: true, comment: 'Whether this shift assignment is currently active' })
    isActivated: boolean;

    @ApiProperty({ example: 42, description: 'User identifier of the control officer assigned to this shift' })
    @Column("int", { comment: 'User identifier of the control officer assigned to this shift' })
    @Index()
    userId: number;

    @ApiPropertyOptional({ type: String, format: 'date-time', description: 'Start datetime of the operator shift' })
    @Index()
    @Column({ type: 'timestamp', nullable: true, comment: 'Start datetime of the operator shift' })
    from: Date;

    @ApiPropertyOptional({ type: String, format: 'date-time', description: 'End datetime of the operator shift' })
    @Index()
    @Column({ type: 'timestamp', nullable: true, comment: 'End datetime of the operator shift' })
    to: Date;

    @ApiProperty({ example: false, description: 'Whether the operator has started (initialized) the shift' })
    @Column('boolean', { default: false, comment: 'Whether the operator has started (initialized) the shift' })
    isInitialized: boolean;

    @ApiProperty({ example: false, description: 'Whether the operator has finished (finalized) the shift' })
    @Column('boolean', { default: false, comment: 'Whether the operator has finished (finalized) the shift' })
    isFinalized: boolean;

    @ApiPropertyOptional({ type: String, format: 'date-time', description: 'Exact datetime when the operator initialized the shift' })
    @Column({ type: 'timestamp', default: null, nullable: true, comment: 'Exact datetime when the operator initialized the shift' })
    dateInitialized: Date;

    @ApiPropertyOptional({ type: String, format: 'date-time', description: 'Exact datetime when the operator finalized the shift' })
    @Column({ type: 'timestamp', default: null, nullable: true, comment: 'Exact datetime when the operator finalized the shift' })
    dateFinalized: Date;

    @ApiPropertyOptional({ type: () => Block, description: 'Associated block (sector) to which the operator is assigned' })
    @Index()
    @ManyToOne(
        () => Block,
        (block) => block.blocksOperator,
        { nullable: false }
    )
    block: Block;

    @ApiProperty({ type: String, format: 'date-time', description: 'Creation timestamp' })
    @Column({ type: "timestamp", default: () => "now()", comment: 'Timestamp when the record was created' })
    createdAt: Date;

    @ApiPropertyOptional({ type: String, format: 'date-time', description: 'Last update timestamp' })
    @UpdateDateColumn({ type: 'timestamp', nullable: true, comment: 'Timestamp of the last update. Null on creation, auto-set on every update' })
    updatedAt: Date;
}
