import {
  Body,
  Controller,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { CreateRangeSalePointTransactionDto } from './dto/create-range-sale-point-transaction.dto';
import { RangeSalePointTransactionService } from './range-sale-point-transaction.service';
/**
 * REST controller for creating range sale point transactions from the client app.
 *
 * Base route: `client/range-sale-point-transaction`. Delegates all business logic to {@link RangeSalePointTransactionService}.
 */
@ApiTags('Client - Range Sale Point Transaction')
@ApiBearerAuth('keycloak')
@Controller('client/range-sale-point-transaction')
export class RangeSalePointTransactionController {
  /**
   *
   * @param rangeSalePointTransactionService
   */
  constructor(
    private readonly rangeSalePointTransactionService: RangeSalePointTransactionService,
  ) {}

  /**
   *
   * @param userId
   * @param idDevice
   * @param version
   * @param createRangeSalePointTransactionDto
   */
  @ApiOperation({
    summary: 'Create a new range sale point transaction for a user',
  })
  @Post('create/:userId/:idDevice/:version')
  create(
    @Param('userId', ParseIntPipe) userId: number,
    @Param('idDevice', ParseUUIDPipe) idDevice: string,
    @Param('version', ParseIntPipe) version: number,
    @Body()
    createRangeSalePointTransactionDto: CreateRangeSalePointTransactionDto,
  ) {
    return this.rangeSalePointTransactionService.create(
      userId,
      createRangeSalePointTransactionDto,
    );
  }
}
