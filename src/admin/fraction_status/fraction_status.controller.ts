import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { FilterDto } from 'src/common/dto/filter.dto';

import { FractionStatusService } from './fraction_status.service';

/**
 * REST controller for querying the status history of parking fractions.
 *
 * Base route: `admin/fraction-status`. Delegates all business logic to {@link FractionStatusService}.
 */
@ApiTags('Admin - Fraction Status')
@ApiBearerAuth('keycloak')
@Controller('admin/fraction-status')
export class FractionStatusController {
  /**
   *
   * @param fractionStatusService
   */
  constructor(private readonly fractionStatusService: FractionStatusService) {}

  /**
   * Returns all status-history entries for the given fraction id.
   * Optionally reads from a monthly historical table when `year` and `month`
   * are provided in the query string.
   * @param fractionId
   * @param filterDto
   */
  @ApiOperation({
    summary: 'List status history records for a given fraction id',
  })
  @Get('/:fractionId')
  findAll(
    @Param('fractionId') fractionId: number,
    @Query() filterDto?: FilterDto,
  ) {
    return this.fractionStatusService.findAllFractionState(
      fractionId,
      filterDto,
    );
  }
}
