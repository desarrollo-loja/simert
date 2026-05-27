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
import { IncidentCategory, IncidentStatus } from 'src/common/glob/type/type_incident';
import { TypeSizeVehicle } from 'src/common/glob/type/type_size_vehicle';
import { OptionalDataInterface } from 'src/common/intefaces/optional-data.interface'; // ajusta la ruta si no coincide

export class CreateIncidentDto {
    @IsOptional()
    @IsNumber()
    incidentTypeId?: number;

    @IsOptional()
    @IsString()
    @MaxLength(LengthDb.details)
    description?: string;

    @IsOptional()
    @IsString()
    @MaxLength(LengthDb.details)
    reference?: string;

    @IsOptional()
    @IsString()
    @MaxLength(LengthDb.details)
    address?: string;

    @IsOptional()
    @IsString()
    @MaxLength(LengthDb.code)
    code?: string;

    @IsOptional()
    @Type(() => Number)
    @IsEnum(TypeSizeVehicle)
    vehicleType?: TypeSizeVehicle;

    @IsOptional()
    @Type(() => Number)
    @IsEnum(IncidentStatus)
    statusIncident?: IncidentStatus;

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
    commission?: number;

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

    @IsNumber()
    @IsOptional()
    fractionId?: number;
}
