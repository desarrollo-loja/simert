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
   * Creates the controller and injects its dependencies.
   *
   * @param rangeSalePointTransactionService Service that handles range sale point transaction logic.
   */
  constructor(
    private readonly rangeSalePointTransactionService: RangeSalePointTransactionService,
  ) {}

  /**
   * Creates a new range sale point transaction for the given user.
   *
   * @param userId Identifier of the user owning the transaction.
   * @param idDevice Identifier of the requesting device (route context only).
   * @param version Client application version (route context only).
   * @param createRangeSalePointTransactionDto Payload describing the transaction to create.
   * @returns Promise resolving to the created range sale point transaction.
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
   * Lists range sale point transactions matching the provided filters.
   *
   * @param userId Identifier of the requesting user (route context only).
   * @param idDevice Identifier of the requesting device (route context only).
   * @param version Client application version (route context only).
   * @param filterDto Optional filtering, pagination and sorting criteria.
   * @returns Promise resolving to the list of matching transactions.
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
   * Counts the total number of range sale point transactions matching the filters.
   *
   * @param userId Identifier of the requesting user (route context only).
   * @param idDevice Identifier of the requesting device (route context only).
   * @param version Client application version (route context only).
   * @param filterDto Optional filtering criteria.
   * @returns Promise resolving to the total count of matching transactions.
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
