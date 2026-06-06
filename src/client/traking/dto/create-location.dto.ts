import {
  IsArray,
  IsLatitude,
  IsLongitude,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';
import { ActivityTracking } from 'src/common/glob/status/activity_traking';
import { StatusTracking } from 'src/common/glob/status/status_tracking';
import { TypeSizeVehicle } from 'src/common/glob/type/type_size_vehicle';

/**
 *
 */
export class CreateLocationDto {
  @IsOptional()
  @IsNumber()
  version: number = 0;

  @IsOptional()
  @IsNumber()
  time: number = 15;

  @IsOptional()
  @IsNumber()
  distanceOnline: number = 0;

  @IsOptional()
  @IsNumber()
  distanceOfline: number = 0;

  @IsOptional()
  @IsNumber()
  typeSize: number = TypeSizeVehicle.VEHICLE;

  @IsNumber()
  userId: number;

  @IsNumber()
  vehicleId: number;

  @IsUUID()
  idDevice: string;

  @IsLatitude()
  latitude: number;

  @IsLongitude()
  longitude: number;

  @IsNumber()
  altitude: number;

  @IsNumber()
  speed: number;

  @IsNumber()
  accuracy: number;

  @IsNumber()
  heading: number;

  @IsString()
  timestamp: string;

  @IsOptional()
  location: string;

  @IsNumber()
  statusTracking: StatusTracking = StatusTracking.undefined;

  @IsNumber()
  activityTracking: ActivityTracking = ActivityTracking.undefined;

  @IsArray()
  @IsOptional()
  //[ [travelId, status], [travelId, status] ]
  travels: any[][];

  @IsOptional()
  @IsNumber()
  taken: number = 0;

  @IsString()
  @IsOptional()
  polyline: string = '';
}
