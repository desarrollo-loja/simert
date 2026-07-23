import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/** A zone item returned in list responses. */
export class ZoneListItemDto {
    @ApiProperty({ description: 'Unique zone identifier', example: 1 })
    id: number;

    @ApiProperty({
        description: 'Display name of the zone',
        example: 'Zona Centro',
    })
    name: string;

    @ApiProperty({ description: 'Short identifier', example: 'ZC' })
    acronym: string;

    @ApiProperty({
        description: 'Hex color code for map rendering',
        example: '#FF5733',
    })
    color: string;

    @ApiProperty({ description: 'Center latitude', example: -0.220197 })
    lt: number;

    @ApiProperty({ description: 'Center longitude', example: -78.512432 })
    lg: number;

    @ApiProperty({
        description: 'Zone type: 100 = NORMAL, 200 = TEMPORARY',
        example: 100,
    })
    type: number;

    @ApiProperty({
        description: 'Whether the zone is currently active',
        example: true,
    })
    isActivated: boolean;
}

/** Detailed zone information including sector and slot summaries. */
export class ZoneDetailItemDto extends ZoneListItemDto {
    @ApiProperty({
        description: 'Detailed description of the zone',
        example: 'Downtown parking zone',
    })
    description: string;

    @ApiProperty({
        description: 'Total number of sectors in this zone',
        example: 5,
    })
    totalSectors: number;

    @ApiProperty({
        description: 'Total number of parking slots in this zone',
        example: 120,
    })
    totalSlots: number;

    @ApiProperty({
        description: 'Number of currently available slots',
        example: 45,
    })
    availableSlots: number;

    @ApiProperty({
        description: 'Number of currently occupied slots',
        example: 75,
    })
    occupiedSlots: number;
}

/** Response for GET /public/zones. */
export class ZoneListResponseDto {
    @ApiProperty({
        description: 'List of active zones',
        type: [ZoneListItemDto],
    })
    zones: ZoneListItemDto[];

    @ApiProperty({ description: 'Total number of matching zones', example: 10 })
    total: number;
}

/** Response for GET /public/zones/:id. */
export class ZoneDetailResponseDto {
    @ApiPropertyOptional({
        description: 'Zone detail or null if not found',
        type: ZoneDetailItemDto,
    })
    zone: ZoneDetailItemDto | null;
}
