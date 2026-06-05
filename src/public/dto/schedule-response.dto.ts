import { ApiProperty } from '@nestjs/swagger';

/** A schedule entry describing operating hours for a sector. */
export class ScheduleItemDto {
  @ApiProperty({ description: 'Unique schedule identifier', example: 1 })
  id: number;

  @ApiProperty({ description: 'Whether this schedule rule is active', example: true })
  isActivated: boolean;

  @ApiProperty({ description: 'Start day of the week (0=Sunday, 1=Monday, ..., 6=Saturday)', example: 1 })
  dayOfWeekInit: number;

  @ApiProperty({ description: 'End day of the week (0=Sunday, 1=Monday, ..., 6=Saturday)', example: 5 })
  dayOfWeekEnd: number;

  @ApiProperty({ description: 'Opening time in HH:mm:ss format', example: '08:00:00' })
  openingTime: string;

  @ApiProperty({ description: 'Closing time in HH:mm:ss format', example: '18:00:00' })
  closingTime: string;
}

/** Response for GET /public/sectors/:id/schedules. */
export class ScheduleListResponseDto {
  @ApiProperty({ description: 'List of operating schedules', type: [ScheduleItemDto] })
  schedules: ScheduleItemDto[];
}
