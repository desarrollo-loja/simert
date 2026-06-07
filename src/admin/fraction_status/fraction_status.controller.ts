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
   * Creates a new FractionStatusController.
   * @param fractionStatusService Service that resolves the status history of parking fractions.
   */
  constructor(private readonly fractionStatusService: FractionStatusService) {}

  /**
   * Returns all status-history entries for the given fraction id.
   * Optionally reads from a monthly historical table when `year` and `month`
   * are provided in the query string.
   * @param fractionId Identifier of the fraction whose status history is requested.
   * @param filterDto Optional filter that may target a monthly historical table via `year` and `month`.
   * @returns The list of status-history records for the requested fraction.
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
