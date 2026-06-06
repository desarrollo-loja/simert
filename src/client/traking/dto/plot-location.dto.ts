import { IsArray, IsNumber, IsOptional, IsString } from 'class-validator';

/**
 *
 */
export class PlotLocationDto {
  @IsOptional()
  p: string;

  @IsArray()
  @IsOptional()
  //[ [travelId, status], [travelId, status] ]
  t: any[][];

  @IsString()
  @IsOptional()
  //polyline
  l: string = '';

  @IsNumber()
  @IsOptional()
  //zone id the current position falls into (references Zone.id, null when outside any zone)
  zoneId: number;

  @IsNumber()
  @IsOptional()
  //block (sector) id the current position falls into (references Block.id, null when outside any block)
  blockId: number;
}
