import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { FilterDto } from 'src/common/dto/filter.dto';

import { CreateRangeSalePointTransactionDto } from './dto/create-range-sale-point-transaction.dto';
import { RangeSalePointTransactionService } from './range-sale-point-transaction.service';
/**
 * REST controller for managing range sale point transactions.
 *
 * Base route: `admin/range-sale-point-transaction`. Delegates all business logic to {@link RangeSalePointTransactionService}.
 */
@ApiTags('Admin - Range Sale Point Transaction')
@ApiBearerAuth('keycloak')
@Controller('admin/range-sale-point-transaction')
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
  @ApiOperation({ summary: 'Create a new range sale point transaction' })
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

  /**
   *
   * @param userId
   * @param idDevice
   * @param version
   * @param filterDto
   */
  @ApiOperation({
    summary: 'List range sale point transactions with optional filters',
  })
  @Get('all/:userId/:idDevice/:version')
  findAll(
    @Param('userId', ParseIntPipe) userId: number,
    @Param('idDevice', ParseUUIDPipe) idDevice: string,
    @Param('version', ParseIntPipe) version: number,
    @Query() filterDto: FilterDto,
  ) {
    return this.rangeSalePointTransactionService.findAll(filterDto);
  }

  /**
   *
   * @param userId
   * @param idDevice
   * @param version
   * @param filterDto
   */
  @ApiOperation({
    summary: 'Count total range sale point transactions matching filters',
  })
  @Get('total/:userId/:idDevice/:version')
  countAll(
    @Param('userId', ParseIntPipe) userId: number,
    @Param('idDevice', ParseUUIDPipe) idDevice: string,
    @Param('version', ParseIntPipe) version: number,
    @Query() filterDto: FilterDto,
  ) {
    return this.rangeSalePointTransactionService.countAll(filterDto);
  }
}
