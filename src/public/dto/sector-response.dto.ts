import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import { ScheduleItemDto } from './schedule-response.dto';

/** A sector item returned in list responses. */
export class SectorListItemDto {
  @ApiProperty({ description: 'Unique sector identifier', example: 1 })
  id: number;

  @ApiProperty({ description: 'Display name of the sector', example: 'Sector A1' })
  name: string;

  @ApiProperty({ description: 'Short identifier', example: 'SA1' })
  acronym: string;

  @ApiProperty({ description: 'Hex color code for map rendering', example: '#3498DB' })
  color: string;

  @ApiProperty({ description: 'Center latitude', example: -0.220197 })
  lt: number;

  @ApiProperty({ description: 'Center longitude', example: -78.512432 })
  lg: number;

  @ApiProperty({ description: 'Display priority (lower values shown first)', example: 1 })
  priority: number;

  @ApiProperty({ description: 'Neighborhood or district name', example: 'Centro Historico' })
  neighborhood: string;

  @ApiProperty({ description: 'Primary street name', example: 'Av. 10 de Agosto' })
  mainStreet: string;

  @ApiProperty({ description: 'Secondary or cross street name', example: 'Calle Guayaquil' })
  sideStreet: string;

  @ApiProperty({ description: 'Maximum parking duration (HH:mm:ss)', example: '01:30:00' })
  timeLimit: string;

  @ApiProperty({ description: 'Grace period before fine (HH:mm:ss)', example: '00:15:00' })
  timeGrace: string;

  @ApiProperty({ description: 'Duration per billing fraction (HH:mm:ss)', example: '00:15:00' })
  timePerFraction: string;

  @ApiProperty({ description: 'Whether the sector is currently active', example: true })
  isActivated: boolean;

  @ApiProperty({ description: 'Parent zone ID', example: 1 })
  zoneId: number;

  @ApiProperty({ description: 'Parent zone name', example: 'Zona Centro' })
  zoneName: string;
}

/** Detailed sector information including slot counts and schedules. */
export class SectorDetailItemDto extends SectorListItemDto {
  @ApiProperty({ description: 'Detailed description of the sector', example: 'Downtown sector near plaza' })
  description: string;

  @ApiProperty({ description: 'Total number of parking slots', example: 30 })
  totalSlots: number;

  @ApiProperty({ description: 'Number of currently available slots', example: 12 })
  availableSlots: number;

  @ApiProperty({ description: 'Number of currently occupied slots', example: 18 })
  occupiedSlots: number;

  @ApiProperty({ description: 'Operating schedules for this sector', type: [ScheduleItemDto] })
  schedules: ScheduleItemDto[];
}

/** Response for GET /public/sectors. */
export class SectorListResponseDto {
  @ApiProperty({ description: 'List of sectors', type: [SectorListItemDto] })
  sectors: SectorListItemDto[];

  @ApiProperty({ description: 'Total number of matching sectors', example: 25 })
  total: number;
}

/** Response for GET /public/sectors/:id. */
export class SectorDetailResponseDto {
  @ApiPropertyOptional({ description: 'Sector detail or null if not found', type: SectorDetailItemDto })
  sector: SectorDetailItemDto | null;
}
