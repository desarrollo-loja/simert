import { IsPositive } from "class-validator";
import { Fraction } from "src/admin/fraction/entities/fraction.entity";
import { FractionStatus } from "src/admin/fraction_status/entities/fraction_status.entity";
import { Column, Entity, OneToMany, PrimaryColumn, UpdateDateColumn } from "typeorm";

@Entity('status')
export class Status {

    @PrimaryColumn({ primaryKeyConstraintName: 'pkStatusId', comment: 'Manual primary key matching the StatusFraction enum values' })
    @IsPositive()
    id: number;

    @Column("varchar", { length: 40, comment: 'Human-readable name for this fraction status' })
    name: string;

    @Column({ type: "timestamp", default: () => "now()", comment: 'Timestamp when the record was created' })
    createdAt: Date;

    @UpdateDateColumn({ type: 'timestamp', nullable: true, comment: 'Timestamp of the last update. Null on creation, auto-set on every update' })
    updatedAt: Date;

    @OneToMany(
        () => Fraction,
        (fraction) => fraction.status,
        { cascade: false, eager: false, onDelete: "NO ACTION", }

    )
    fractions: Fraction[];

    @OneToMany(
        () => FractionStatus,
        (fractionStatus) => fractionStatus.status,
        { cascade: false, eager: false, onDelete: "NO ACTION", }
    )
    fractionsStatus: FractionStatus[];

}
