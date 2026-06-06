import { IsNumber } from 'class-validator';
import { Fraction } from 'src/admin/fraction/entities/fraction.entity';
import { LengthDb } from 'src/common/glob/length.db';
import { StatusPayment } from 'src/common/glob/status/status_payment';
import {
  IncidentCategory,
  IncidentStatus,
} from 'src/common/glob/type/type_incident';
import { InternalStateIncident } from 'src/common/glob/type/type_internal_state_incident';
import { TypePaymentMethod } from 'src/common/glob/type/type_payment_method';
import { TypeSizeVehicle } from 'src/common/glob/type/type_size_vehicle';
import { OptionalDataInterface } from 'src/common/intefaces/optional-data.interface';
import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';

/**
 *
 */
@Entity({
  name: 'incident',
  comment:
    'Stores parking fines, reports and log entries with vehicle, location, GIM workflow status and payment data',
})
@Unique('uqIncidentNroTicket', ['nroTicket'])
export class Incident {
  @PrimaryGeneratedColumn('increment', {
    primaryKeyConstraintName: 'pkIncidentId',
  })
  @IsNumber()
  id: number;

  @Column('int', {
    nullable: true,
    comment:
      'Incident type identifier (fine category). Only applies to fines (NOTIFICATION), not reports or sanctions',
  })
  @Index('idxIncidentIncidentTypeId')
  incidentTypeId: number;

  @Column('int', {
    nullable: true,
    comment:
      'Incident category: NOTIFICATION (100) = fine, INCIDENT_BITACORA (200) = log entry, REPORT (300) = report',
  })
  @Index('idxIncidentIncidentCategory')
  incidentCategory: IncidentCategory;

  @Column('int', {
    default: IncidentStatus.ENTERED,
    comment:
      'GIM system status of the incident: ENTERED(100), APPEALED(200), ERRONEOUS(300), CANCELED(400), APPROVED(500), SUPPLIED(600), PAYED(700), CANCELED_BY_SUPERVISOR(800), CONVENIO(900), ON_CREDIT(1000), PENDIENTE_LIQUIDACION(1100)',
  })
  @Index('idxIncidentStatusIncident')
  statusIncident: IncidentStatus;

  @Column('int', {
    default: InternalStateIncident.SIMERT_ADMINISTRATION,
    comment:
      'Internal workflow state: SIMERT_ADMINISTRATION(100) = pending data review, TRAFFIC_POLICE_STATION(200) = generating documents, REVENUE_DEPARTMENT(300) = issuing credit titles',
  })
  @Index('idxIncidentInternalState')
  internalState: InternalStateIncident;

  @Column('int', {
    nullable: true,
    comment:
      'Vehicle type involved in the incident: UNDEFINED(0), VEHICLE(1), BIKE(19), OTHERS(26)',
  })
  @Index('idxIncidentVehicleType')
  vehicleType: TypeSizeVehicle;

  @Column('varchar', {
    default: '',
    length: LengthDb.details,
    comment: 'Free-text description of the incident',
  })
  description: string;

  @Column('uuid', {
    default: () => 'gen_random_uuid()',
    comment: 'Unique UUID reference for the incident, auto-generated on insert',
  })
  reference: string;

  @Column('varchar', {
    default: '',
    length: LengthDb.details,
    comment: 'Street address where the incident took place',
  })
  address: string;

  @Column('varchar', {
    nullable: true,
    length: LengthDb.plate,
    comment: 'License plate of the vehicle involved in the incident',
  })
  @Index('idxIncidentPlate')
  plate: string;

  @Column('varchar', {
    default: '',
    length: LengthDb.code,
    comment:
      'GIM system code (rubro) that uniquely identifies this infraction type in the external system',
  })
  code: string;

  @Column('json', {
    nullable: true,
    comment:
      'Extra key-value pairs for incident data not covered by explicit columns',
  })
  optionalData: OptionalDataInterface[];

  @Column('varchar', {
    default: '',
    length: LengthDb.details,
    comment:
      'Supervisor notes when correcting erroneous data entered by the control officer',
  })
  supervisorObservations: string;

  @Column('int', {
    comment: 'User ID of the control officer who registered the incident',
  })
  @Index('idxIncidentControllerId')
  controllerId: number;

  @Column('varchar', {
    length: LengthDb.identityCard,
    nullable: true,
    comment: 'National identity card number of the vehicle owner or client',
  })
  @Index('idxIncidentIdentityCard')
  identityCard: string;

  @Column('varchar', {
    length: LengthDb.fullName,
    nullable: true,
    comment: 'Full name of the vehicle owner or client',
  })
  fullNameClient: string;

  @Column('varchar', {
    length: LengthDb.email,
    nullable: true,
    comment: 'Email address of the vehicle owner or client',
  })
  @Index('idxIncidentEmailClient')
  emailClient: string;

  @Column('varchar', {
    nullable: true,
    default: null,
    comment:
      'Physical ticket number left on the vehicle (citationNumber in GIM system)',
  })
  @Index('idxIncidentNroTicket')
  nroTicket: string | null;

  @Column('varchar', {
    nullable: true,
    comment:
      'Obligation number (credit title number in GIM). Populated only after the title has been issued',
  })
  @Index('idxIncidentNroObligation')
  nroObligation: string;

  @Column('int', {
    comment: 'Block operator shift ID under which the incident was registered',
  })
  @Index('idxIncidentBlockOperatorId')
  blockOperatorId: number;

  @Column('int', {
    nullable: true,
    comment: 'Zone identifier where the incident occurred',
  })
  @Index('idxIncidentZoneId')
  zoneId: number;

  @Column('int', {
    comment: 'Block (sector) identifier where the incident occurred',
  })
  @Index('idxIncidentBlockId')
  blockId: number;

  @Column('varchar', {
    length: 5,
    nullable: true,
    comment:
      'Parking slot number (display number, not the slot ID) where the incident occurred',
  })
  @Index('idxIncidentSlot')
  slot: string;

  @Column('varchar', {
    array: true,
    default: () => 'ARRAY[]::varchar[]',
    comment: 'Array of image URLs attached as evidence of the incident',
  })
  images: string[];

  @Column('varchar', {
    nullable: true,
    comment:
      'URL of the dictum PDF document generated during the incident workflow',
  })
  dictumPdfUrl: string;

  @Column('varchar', {
    nullable: true,
    comment:
      'URL of the resolution PDF document generated during the incident workflow',
  })
  resolutionPdfUrl: string;

  @Column({
    type: 'decimal',
    precision: 10,
    scale: 6,
    comment: 'Latitude coordinate where the incident was registered',
  })
  lt: number;

  @Column({
    type: 'decimal',
    precision: 10,
    scale: 6,
    comment: 'Longitude coordinate where the incident was registered',
  })
  lg: number;

  @Column('decimal', {
    nullable: true,
    precision: 12,
    scale: 2,
    default: 0,
    comment: 'Fine amount to be charged for the incident',
  })
  amount: number;

  @Column('decimal', {
    nullable: true,
    precision: 12,
    scale: 2,
    default: 0,
    comment: 'Commission amount charged on top of the fine',
  })
  commission: number;

  @Column('int', {
    nullable: true,
    comment:
      'Obligation ID registered in the GIM system, linked to the credit title',
  })
  @Index('idxIncidentBondId')
  bondId: number;

  @Column('varchar', {
    length: 36,
    nullable: true,
    comment: 'Unique transaction ID sent when a payment is processed',
  })
  @Index('idxIncidentTransactionId')
  transactionId: string | null;

  @Column({
    type: 'int',
    nullable: true,
    comment: 'Payment method used: references TypePaymentMethod enum',
  })
  @Index('idxIncidentTypePaymentMethod')
  typePaymentMethod: TypePaymentMethod | null;

  @Column({
    type: 'int',
    nullable: true,
    comment:
      'Current payment status of the incident: references StatusPayment enum',
  })
  @Index('idxIncidentStatusPayment')
  statusPayment: StatusPayment | null;

  @Column('boolean', {
    default: true,
    comment: 'Soft-delete flag. False means the incident has been deactivated',
  })
  isActivated: boolean;

  @Column('boolean', {
    default: false,
    comment:
      'Whether the client email has been validated by ANT before sending the resolution document',
  })
  mailValidate: boolean;

  @Column('boolean', {
    default: false,
    comment:
      'True when the client paid voluntarily; false means the full fine process must continue',
  })
  voluntaryPayment: boolean;

  @Column('varchar', {
    nullable: true,
    comment:
      'URL of the PDF report written by the control officer to document a registration error',
  })
  controllerReportPdfUrl: string;

  @Column('json', {
    nullable: true,
    comment:
      'Array of raw response objects received from the GIM external system during the incident lifecycle',
  })
  onResponseExternal: any[];

  @ManyToOne(() => Fraction, (fraction) => fraction.incidents, {
    cascade: false,
    eager: false,
    onDelete: 'NO ACTION',
    nullable: true,
  })
  @JoinColumn({
    name: 'fractionId',
    foreignKeyConstraintName: 'fkIncidentFraction',
  })
  fraction: Fraction;

  @Column({
    type: 'timestamp',
    default: () => 'now()',
    comment: 'Timestamp when the record was created',
  })
  createdAt: Date;

  @UpdateDateColumn({
    type: 'timestamp',
    nullable: true,
    comment:
      'Timestamp of the last update. Null on creation, auto-set on every update',
  })
  updatedAt: Date;

  @Column({
    type: 'timestamp',
    nullable: false,
    comment:
      'Business-level registration datetime of the incident, set by the application',
  })
  @Index('idxIncidentRegister')
  register: string;
}
