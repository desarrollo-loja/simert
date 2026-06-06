import { ApiProperty } from '@nestjs/swagger';

/** Sector data optimized for map rendering. */
export class MapSectorItemDto {
  @ApiProperty({ description: 'Sector ID', example: 1 })
  id: number;

  @ApiProperty({ description: 'Sector display name', example: 'Sector A1' })
  name: string;

  @ApiProperty({ description: 'Short identifier', example: 'SA1' })
  acronym: string;

  @ApiProperty({ description: 'Hex color for rendering', example: '#3498DB' })
  color: string;

  @ApiProperty({ description: 'Center latitude', example: -0.220197 })
  lt: number;

  @ApiProperty({ description: 'Center longitude', example: -78.512432 })
  lg: number;

  @ApiProperty({
    description:
      'Parsed GeoJSON polygon coordinates for map rendering (array of coordinate rings)',
    example: [
      [
        { lat: -0.22, lng: -78.51 },
        { lat: -0.23, lng: -78.52 },
      ],
    ],
    nullable: true,
  })
  geofence: any;

  @ApiProperty({ description: 'Total number of parking slots', example: 30 })
  totalSlots: number;

  @ApiProperty({
    description: 'Number of currently available slots',
    example: 12,
  })
  availableSlots: number;
}

/** Zone data optimized for map rendering. */
export class MapZoneItemDto {
  @ApiProperty({ description: 'Zone ID', example: 1 })
  id: number;

  @ApiProperty({ description: 'Zone display name', example: 'Zona Centro' })
  name: string;

  @ApiProperty({ description: 'Short identifier', example: 'ZC' })
  acronym: string;

  @ApiProperty({ description: 'Hex color for rendering', example: '#FF5733' })
  color: string;

  @ApiProperty({ description: 'Center latitude', example: -0.220197 })
  lt: number;

  @ApiProperty({ description: 'Center longitude', example: -78.512432 })
  lg: number;

  @ApiProperty({
    description:
      'Parsed GeoJSON polygon coordinates for map rendering (array of coordinate rings)',
    example: [
      [
        { lat: -0.22, lng: -78.51 },
        { lat: -0.23, lng: -78.52 },
      ],
    ],
    nullable: true,
  })
  geofence: any;

  @ApiProperty({
    description: 'Sectors within this zone',
    type: [MapSectorItemDto],
  })
  sectors: MapSectorItemDto[];
}

/** Response for GET /public/map. */
export class MapDataResponseDto {
  @ApiProperty({
    description: 'Zones with their sectors, geofences and availability',
    type: [MapZoneItemDto],
  })
  zones: MapZoneItemDto[];
}
