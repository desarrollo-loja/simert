import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsLatitude,
  IsLongitude,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { LengthDb } from 'src/common/glob/length.db';
import {
  IncidentCategory,
  IncidentStatus,
} from 'src/common/glob/type/type_incident';
import { InternalStateIncident } from 'src/common/glob/type/type_internal_state_incident';
import { TypeSizeVehicle } from 'src/common/glob/type/type_size_vehicle';
import { OptionalDataInterface } from 'src/common/intefaces/optional-data.interface'; // ajusta la ruta si no coincide

/**
 *
 */
export class CreateIncidentDto {
  @IsNumber()
  @IsOptional()
  id?: number;

  @IsOptional()
  @IsNumber()
  incidentTypeId?: number;

  @IsOptional()
  @IsString()
  @MaxLength(LengthDb.details)
  description?: string;

  @IsString()
  reference: string;

  @IsOptional()
  @IsString()
  @MaxLength(LengthDb.details)
  address?: string;

  @IsOptional()
  @Type(() => Number)
  @IsEnum(TypeSizeVehicle)
  vehicleType?: TypeSizeVehicle;

  @Type(() => Number)
  @IsEnum(IncidentStatus)
  statusIncident: IncidentStatus;

  @Type(() => Number)
  @IsEnum(InternalStateIncident)
  internalState: InternalStateIncident;

  @IsOptional()
  @IsString()
  @MaxLength(LengthDb.plate)
  plate?: string;

  //   @IsOptional()
  //   @IsArray()
  //   @ValidateNested({ each: true })
  //   @Type(() => OptionalDataDto)
  //   optionalData?: OptionalDataDto[];

  @Type(() => OptionalDataInterface)
  @IsOptional()
  optionalData: OptionalDataInterface[];

  @IsOptional()
  @IsString()
  @MaxLength(LengthDb.details)
  supervisorObservations?: string;

  @IsNumber()
  controllerId: number;

  @IsOptional()
  @IsString()
  @MaxLength(LengthDb.email)
  emailClient?: string;

  @IsNumber()
  blockOperatorId: number;

  @IsNumber()
  @IsOptional()
  zoneId?: number;

  @IsNumber()
  blockId: number;

  @IsString()
  @IsOptional()
  slot?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  images?: string[];

  @IsOptional()
  @IsString()
  dictumPdfUrl?: string;

  @IsOptional()
  @IsString()
  resolutionPdfUrl?: string;

  @IsOptional()
  @IsString()
  controllerReportPdfUrl?: string;

  @IsNumber()
  @IsLatitude()
  lt: number;

  @IsNumber()
  @IsLongitude()
  lg: number;

  @IsNumber()
  @IsOptional()
  amount?: number;

  @IsNumber()
  @IsOptional()
  bondId?: number;

  @IsOptional()
  @Type(() => Number)
  @IsEnum(IncidentCategory)
  incidentCategory?: IncidentCategory;

  @IsOptional()
  @IsBoolean()
  isActivated?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(250)
  nroTicket?: string;

  @IsOptional()
  @IsString()
  @MaxLength(250)
  nroObligation?: string;

  @IsOptional()
  @IsString()
  @MaxLength(LengthDb.identityCard)
  identityCard?: string;

  @IsOptional()
  @IsString()
  @MaxLength(LengthDb.fullName)
  fullNameClient?: string;

  @IsOptional()
  @IsArray()
  onResponseExternal?: any[];
}
