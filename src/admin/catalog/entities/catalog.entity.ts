import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Column, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from "typeorm";

@Entity()
export class Catalog {
    @ApiProperty({ example: 1, description: 'Unique catalog type identifier' })
    @PrimaryGeneratedColumn()
    id: number;

    @ApiProperty({ example: 'Zona', description: 'Type of catalog' })
    @Column({ unique: true })
    type: string;

    @ApiProperty({ example: '{}', description: 'Data of catalog' })
    @Column('json', { comment: 'Data of catalog' })
    data: any;

    @ApiProperty({ example: 'Description of catalog', description: 'Description of catalog' })
    @Column("varchar", { length: 255, default: '', comment: 'Description of catalog' })
    description: string;

    @ApiProperty({ example: true, description: 'Whether this catalog is currently available for use' })
    @Column("boolean", { default: true, comment: 'Whether this catalog is currently available for use' })
    isActivated: boolean;

    @ApiProperty({ type: String, format: 'date-time', description: 'Creation timestamp' })
    @Column({ type: "timestamp", default: () => "now()", comment: 'Timestamp when the record was created' })
    createdAt: Date;

    @ApiPropertyOptional({ type: String, format: 'date-time', description: 'Last update timestamp' })
    @UpdateDateColumn({ type: 'timestamp', nullable: true, comment: 'Timestamp of the last update. Null on creation, auto-set on every update' })
    updatedAt: Date;
}