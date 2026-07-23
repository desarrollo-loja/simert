import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNumber } from 'class-validator';
import {
    Column,
    Entity,
    Index,
    PrimaryGeneratedColumn,
    UpdateDateColumn,
} from 'typeorm';

/**
 *
 */
@Entity({
    name: 'card',
    comment:
        'Catalog of purchasable card types defining price, commission and number of parking fractions granted',
})
export class Card {
    @ApiProperty({ example: 1, description: 'Unique card type identifier' })
    @PrimaryGeneratedColumn('increment', {
        primaryKeyConstraintName: 'pkCardId',
    })
    @IsNumber()
    id: number;

    @ApiProperty({
        example: 'Daily',
        maxLength: 20,
        description: 'Display name of the card type (e.g. "Daily", "Weekly")',
    })
    @Column('varchar', {
        length: 20,
        comment: 'Display name of the card type (e.g. "Daily", "Weekly")',
    })
    @Index('idxCardName')
    name: string;

    @ApiProperty({
        example: true,
        description:
            'Whether this card type is currently available for purchase',
    })
    @Column('boolean', {
        default: true,
        comment: 'Whether this card type is currently available for purchase',
    })
    isActivated: boolean;

    @ApiProperty({
        example: 1.5,
        description: 'Base price of the card charged to the buyer',
    })
    @Column('decimal', {
        precision: 12,
        scale: 2,
        default: 0,
        comment: 'Base price of the card charged to the buyer',
    })
    price: number;

    @ApiProperty({
        example: 0.1,
        description: 'Commission fee applied on top of the card price',
    })
    @Column('decimal', {
        precision: 12,
        scale: 2,
        default: 0,
        comment: 'Commission fee applied on top of the card price',
    })
    commission: number;

    @ApiProperty({
        example: 12,
        description:
            'Number of parking fractions (checkboxes) granted to the buyer when purchasing this card',
    })
    @Column('smallint', {
        unsigned: true,
        comment:
            'Number of parking fractions (checkboxes) granted to the buyer when purchasing this card',
    })
    checkboxes: number;

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
}
