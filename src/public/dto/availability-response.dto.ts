import { ApiProperty } from '@nestjs/swagger';

/** Real-time slot availability for a single sector. */
export class SectorAvailabilityResponseDto {
    @ApiProperty({ description: 'Sector ID', example: 1 })
    sectorId: number;

    @ApiProperty({ description: 'Sector display name', example: 'Sector A1' })
    sectorName: string;

    @ApiProperty({
        description: 'Total number of slots in the sector',
        example: 30,
    })
    totalSlots: number;

    @ApiProperty({
        description: 'Slots currently available (status 100)',
        example: 12,
    })
    available: number;

    @ApiProperty({
        description: 'Slots currently occupied (status 200)',
        example: 10,
    })
    occupied: number;

    @ApiProperty({
        description: 'Slots with exceeded time (status 301)',
        example: 3,
    })
    exceeded: number;

    @ApiProperty({
        description: 'Slots in grace time period (status 500)',
        example: 2,
    })
    graceTime: number;

    @ApiProperty({
        description: 'Slots out of service (status 700)',
        example: 1,
    })
    outOfService: number;

    @ApiProperty({
        description: 'Slots reserved for people with disabilities (status 600)',
        example: 2,
    })
    pcd: number;
}

/** Availability summary per sector within a zone. */
export class SectorAvailabilitySummaryDto {
    @ApiProperty({ description: 'Sector ID', example: 1 })
    sectorId: number;

    @ApiProperty({ description: 'Sector display name', example: 'Sector A1' })
    sectorName: string;

    @ApiProperty({ description: 'Total slots in sector', example: 30 })
    totalSlots: number;

    @ApiProperty({ description: 'Available slots', example: 12 })
    available: number;

    @ApiProperty({ description: 'Occupied slots', example: 18 })
    occupied: number;
}

/** Real-time availability consolidated for a zone. */
export class ZoneAvailabilityResponseDto {
    @ApiProperty({ description: 'Zone ID', example: 1 })
    zoneId: number;

    @ApiProperty({ description: 'Zone display name', example: 'Zona Centro' })
    zoneName: string;

    @ApiProperty({
        description: 'Total slots across all sectors in this zone',
        example: 120,
    })
    totalSlots: number;

    @ApiProperty({ description: 'Total available slots', example: 45 })
    available: number;

    @ApiProperty({ description: 'Total occupied slots', example: 50 })
    occupied: number;

    @ApiProperty({ description: 'Total exceeded slots', example: 10 })
    exceeded: number;

    @ApiProperty({ description: 'Total slots in grace time', example: 5 })
    graceTime: number;

    @ApiProperty({ description: 'Total out of service slots', example: 3 })
    outOfService: number;

    @ApiProperty({ description: 'Total PCD reserved slots', example: 7 })
    pcd: number;

    @ApiProperty({
        description: 'Availability breakdown per sector',
        type: [SectorAvailabilitySummaryDto],
    })
    sectors: SectorAvailabilitySummaryDto[];
}

/** Occupancy summary per zone in the general summary. */
export class ZoneOccupancySummaryDto {
    @ApiProperty({ description: 'Zone ID', example: 1 })
    zoneId: number;

    @ApiProperty({ description: 'Zone display name', example: 'Zona Centro' })
    zoneName: string;

    @ApiProperty({ description: 'Total slots in zone', example: 120 })
    totalSlots: number;

    @ApiProperty({ description: 'Available slots', example: 45 })
    available: number;

    @ApiProperty({ description: 'Occupied slots', example: 75 })
    occupied: number;

    @ApiProperty({
        description: 'Occupancy rate as a percentage (0-100)',
        example: 62.5,
    })
    occupancyRate: number;
}

/** General occupancy summary across all zones. */
export class OccupancySummaryResponseDto {
    @ApiProperty({ description: 'Total number of active zones', example: 5 })
    totalZones: number;

    @ApiProperty({ description: 'Total number of active sectors', example: 25 })
    totalSectors: number;

    @ApiProperty({
        description: 'Total number of slots system-wide',
        example: 500,
    })
    totalSlots: number;

    @ApiProperty({ description: 'Total available slots', example: 200 })
    available: number;

    @ApiProperty({ description: 'Total occupied slots', example: 220 })
    occupied: number;

    @ApiProperty({ description: 'Total exceeded slots', example: 30 })
    exceeded: number;

    @ApiProperty({ description: 'Total slots in grace time', example: 15 })
    graceTime: number;

    @ApiProperty({ description: 'Total out of service slots', example: 10 })
    outOfService: number;

    @ApiProperty({ description: 'Total PCD reserved slots', example: 25 })
    pcd: number;

    @ApiProperty({
        description: 'Overall occupancy rate as a percentage (0-100)',
        example: 58.0,
    })
    occupancyRate: number;

    @ApiProperty({
        description: 'Occupancy breakdown per zone',
        type: [ZoneOccupancySummaryDto],
    })
    zones: ZoneOccupancySummaryDto[];
}
