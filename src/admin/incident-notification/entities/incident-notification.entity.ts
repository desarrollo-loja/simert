import { IsNumber } from "class-validator";
import { LengthDb } from "src/common/glob/length.db";
import { IncidentStatus } from "src/common/glob/type/type_incident";
import { Column, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from "typeorm";

@Entity('incidentNotification')
export class IncidentNotification {

    @PrimaryGeneratedColumn('increment')
    @IsNumber()
    id: number;

    @Column("int", { comment: 'Incident type identifier linked to this notification' })
    @Index()
    incidentTypeId: number;

    @Column("int", { comment: 'Incident identifier this notification belongs to' })
    @Index()
    incidentId: number;

    @Column("int", { default: 0, comment: 'Month (1-12) when the notification was generated, used for period grouping' })
    @Index()
    month: number;

    @Column("int", { default: 0, comment: 'Year when the notification was generated, used for period grouping' })
    @Index()
    year: number;

    @Column("int", {
        default: IncidentStatus.ENTERED,
        comment: 'GIM system status of the incident at the time of notification: ENTERED(100), APPROVED(500), SUPPLIED(600), PAYED(700), etc.'
    })
    @Index()
    statusIncident: IncidentStatus;

    @Column("varchar", { default: '', length: LengthDb.details, comment: 'Free-text description of the notification' })
    description: string;

    @Column("varchar", { nullable: true, length: LengthDb.plate, comment: 'License plate of the vehicle involved in the incident' })
    @Index()
    plate: string;

    @Column({ type: "timestamp", default: () => "now()", comment: 'Timestamp when the record was created' })
    createdAt: Date;

    @UpdateDateColumn({ type: 'timestamp', nullable: true, comment: 'Timestamp of the last update. Null on creation, auto-set on every update' })
    updatedAt: Date;

}
