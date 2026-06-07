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
import { AuthWithKeycloak, GetUser } from 'src/auth/decorators';
import { JwtPayload } from 'src/auth/interfaces';
import { GetMeta } from 'src/common/decorators/get-meta.decorator';
import { PaginationDto } from 'src/common/dto/pagination.dto';
import { MetaInterface } from 'src/common/intefaces/meta.interface';

import { CreateIncidentDto } from '../incident/dto/create-incident.dto';
import { GetIncidentDto } from '../incident/dto/get-incident.dto';
import { CreateOperatorDto } from './dto/create-operator.dto';
import { IncrementOperatorDto } from './dto/increment-operator.dto';
import { OperatorService } from './operator.service';
/**
 * REST controller for the operator mobile app parking and incident workflow.
 *
 * Base route: `client/operator`. Delegates all business logic to {@link OperatorService}.
 */
@ApiTags('Client - Operator')
@ApiBearerAuth('keycloak')
@Controller('client/operator')
export class OperatorController {
  /**
   * Creates the controller instance.
   *
   * @param operatorService Service that handles the operator business logic.
   */
  constructor(private readonly operatorService: OperatorService) {}

  /**
   * Creates an incident reported from the operator app.
   *
   * @param createIncidentDto Payload describing the incident to create.
   * @param userId Identifier of the operator user creating the incident.
   * @param idDevice UUID of the device the request originates from.
   * @returns Promise resolving to the created incident.
   */
  @ApiOperation({ summary: 'Create an incident from the operator app' })
  // @Auth()
  @AuthWithKeycloak()
  @Post('create-incident/:userId/:idDevice')
  createIncident(
    @Body() createIncidentDto: CreateIncidentDto,
    @Param('userId', ParseIntPipe) userId: number,
    @Param('idDevice', ParseUUIDPipe) idDevice: string,
  ) {
    return this.operatorService.createIncident(
      userId,
      idDevice,
      createIncidentDto,
    );
  }

  /**
   * Finishes an active parking fraction from the operator app.
   *
   * @param user Authenticated operator user payload.
   * @param userId Identifier of the operator user finishing the fraction.
   * @param idDevice UUID of the device the request originates from.
   * @param fractionId Identifier of the parking fraction to finish.
   * @param _version Client app version (unused).
   * @returns Promise resolving to the finished parking fraction.
   */
  @ApiOperation({
    summary: 'Finish an active parking fraction from the operator app',
  })
  // @Auth()
  @AuthWithKeycloak()
  @Post('finished/:userId/:idDevice/:fractionId/:version')
  finished(
    @GetUser() user: JwtPayload,
    @Param('userId', ParseIntPipe) userId: number,
    @Param('idDevice', ParseUUIDPipe) idDevice: string,
    @Param('fractionId', ParseIntPipe) fractionId: number,
    @Param('version', ParseIntPipe) _version: number,
  ) {
    return this.operatorService.finished(userId, fractionId);
  }

  /**
   * Registers (starts) a parking session from the operator app.
   *
   * @param user Authenticated operator user payload.
   * @param meta Request metadata attached to the parking session.
   * @param userId Identifier of the operator user starting the session.
   * @param idDevice UUID of the device the request originates from.
   * @param version Client app version.
   * @param createOperatorDto Payload describing the parking session to start.
   * @returns Promise resolving to the created parking session.
   */
  @ApiOperation({
    summary: 'Register (start) a parking session from the operator app',
  })
  // @Auth()
  @AuthWithKeycloak()
  @Post('register/:userId/:idDevice/:version')
  register(
    @GetUser() user: JwtPayload,
    @GetMeta() meta: MetaInterface,
    @Param('userId', ParseIntPipe) userId: number,
    @Param('idDevice', ParseUUIDPipe) idDevice: string,
    @Param('version', ParseIntPipe) version: number,
    @Body() createOperatorDto: CreateOperatorDto,
  ) {
    createOperatorDto.meta = meta;
    return this.operatorService.parking(createOperatorDto);
  }

  /**
   * Extends parking time for an active fraction from the operator app.
   *
   * @param user Authenticated operator user payload.
   * @param meta Request metadata attached to the increment.
   * @param userId Identifier of the operator user extending the time.
   * @param idDevice UUID of the device the request originates from.
   * @param version Client app version.
   * @param incrementOperatorDto Payload describing the time extension to apply.
   * @returns Promise resolving to the updated parking fraction.
   */
  @ApiOperation({
    summary: 'Extend parking time for an active fraction (operator app)',
  })
  // @Auth()
  @AuthWithKeycloak()
  @Post('increment-time/:userId/:idDevice/:version')
  incrementTime(
    @GetUser() user: JwtPayload,
    @GetMeta() meta: MetaInterface,
    @Param('userId', ParseIntPipe) userId: number,
    @Param('idDevice', ParseUUIDPipe) idDevice: string,
    @Param('version', ParseIntPipe) version: number,
    @Body() incrementOperatorDto: IncrementOperatorDto,
  ) {
    incrementOperatorDto.meta = meta;
    return this.operatorService.incrementTime(idDevice, incrementOperatorDto);
  }

  /**
   * Lists the blocks assigned to the operator user.
   *
   * @param user Authenticated operator user payload.
   * @param criteria Optional filter criteria for the blocks.
   * @param userId Identifier of the operator user whose blocks are listed.
   * @param _idDevice UUID of the device the request originates from (unused).
   * @param _version Client app version (unused).
   * @returns Promise resolving to the list of assigned blocks.
   */
  @ApiOperation({ summary: 'List blocks assigned to the operator user' })
  // @Auth()
  @AuthWithKeycloak()
  @Get('find-all-bloclks/:userId/:idDevice/:version')
  findAllBlocks(
    @GetUser() user: JwtPayload,
    @Param('criteria') criteria: string,
    @Param('userId', ParseIntPipe) userId: number,
    @Param('idDevice', ParseUUIDPipe) _idDevice: string,
    @Param('version', ParseIntPipe) _version: number,
  ) {
    return this.operatorService.findAllBlocks(userId);
  }

  /**
   * Lists the active parking fractions for a block (operator view).
   *
   * @param paginationDto Pagination parameters for the result set.
   * @param userId Identifier of the operator user requesting the fractions.
   * @param idDevice UUID of the device the request originates from.
   * @param blockId Identifier of the block whose fractions are listed.
   * @param _version Client app version (unused).
   * @returns Promise resolving to the paginated list of parking fractions.
   */
  @ApiOperation({
    summary: 'List active parking fractions for a block (operator view)',
  })
  // @Auth()
  //@AuthWithKeycloak()
  @Get('find-all-fractions/:userId/:idDevice/:blockId/:version')
  findAllFractions(
    //@GetUser() user: JwtPayload,
    @Query() paginationDto: PaginationDto,
    @Param('userId', ParseIntPipe) userId: number,
    @Param('idDevice', ParseUUIDPipe) idDevice: string,
    @Param('blockId', ParseIntPipe) blockId: number,
    @Param('version', ParseIntPipe) _version: number,
  ) {
    return this.operatorService.findAllFractions(
      blockId,
      userId,
      paginationDto,
    );
  }

  /**
   * Gets a single parking fraction detail by its identifier (operator view).
   *
   * @param user Authenticated operator user payload.
   * @param paginationDto Pagination parameters for the result set.
   * @param userId Identifier of the operator user requesting the fraction.
   * @param idDevice UUID of the device the request originates from.
   * @param fractionId Identifier of the parking fraction to retrieve.
   * @param _version Client app version (unused).
   * @returns Promise resolving to the requested parking fraction detail.
   */
  @ApiOperation({
    summary: 'Get a single fraction detail by fractionId (operator view)',
  })
  // @Auth()
  @AuthWithKeycloak()
  @Get('find-fraction-by-id/:userId/:idDevice/:fractionId/:version')
  findFractionById(
    @GetUser() user: JwtPayload,
    @Query() paginationDto: PaginationDto,
    @Param('userId', ParseIntPipe) userId: number,
    @Param('idDevice', ParseUUIDPipe) idDevice: string,
    @Param('fractionId', ParseIntPipe) fractionId: number,
    @Param('version', ParseIntPipe) _version: number,
  ) {
    return this.operatorService.findFractionById(fractionId);
  }

  /**
   * Searches active parking fractions by plate number or other criteria.
   *
   * @param user Authenticated operator user payload.
   * @param criteria Search criteria such as a plate number.
   * @param _userId Identifier of the operator user (unused).
   * @param _idDevice UUID of the device the request originates from (unused).
   * @param _version Client app version (unused).
   * @returns Promise resolving to the matching parking fractions.
   */
  @ApiOperation({
    summary: 'Search active fractions by plate number or other criteria',
  })
  // @Auth()
  @AuthWithKeycloak()
  @Get('find-by-criteria/:criteria/:userId/:idDevice/:version')
  findAllFractionsByPlate(
    @GetUser() user: JwtPayload,
    @Param('criteria') criteria: string,
    @Param('userId', ParseIntPipe) _userId: number,
    @Param('idDevice', ParseUUIDPipe) _idDevice: string,
    @Param('version', ParseIntPipe) _version: number,
  ) {
    return this.operatorService.findAllFractionsBycriteria(criteria);
  }

  /**
   * Gets the current virtual server time for operator clock synchronization.
   *
   * @param _user Authenticated operator user payload (unused).
   * @param _criteria Optional request criteria (unused).
   * @param _userId Identifier of the operator user (unused).
   * @param _idDevice UUID of the device the request originates from (unused).
   * @param _version Client app version (unused).
   * @returns Promise resolving to the current virtual server time.
   */
  @ApiOperation({
    summary: 'Get the current virtual server time (for operator clock sync)',
  })
  // @Auth()
  @AuthWithKeycloak()
  @Get('time-virtual/:userId/:idDevice/:version')
  timeVirtual(
    @GetUser() _user: JwtPayload,
    @Param('criteria') _criteria: string,
    @Param('userId', ParseIntPipe) _userId: number,
    @Param('idDevice', ParseUUIDPipe) _idDevice: string,
    @Param('version', ParseIntPipe) _version: number,
  ) {
    return this.operatorService.timeVirtual();
  }

  /**
   * Lists the physical card slots available for the given card identifier.
   *
   * @param user Authenticated operator user payload.
   * @param card Card identifier whose physical slots are listed.
   * @param _userId Identifier of the operator user (unused).
   * @param _idDevice UUID of the device the request originates from (unused).
   * @param _version Client app version (unused).
   * @returns Promise resolving to the available physical card slots.
   */
  @ApiOperation({
    summary: 'List physical card slots available for the given card identifier',
  })
  // @Auth()
  @AuthWithKeycloak()
  @Get('find-all-physic/:userId/:idDevice/:card/:version')
  findAllPhysic(
    @GetUser() user: JwtPayload,
    @Param('card') card: string,
    @Param('userId', ParseIntPipe) _userId: number,
    @Param('idDevice', ParseUUIDPipe) _idDevice: string,
    @Param('version', ParseIntPipe) _version: number,
  ) {
    return this.operatorService.findAllPhysic(card);
  }

  /**
   * Gets slot pricing and availability by slot name or code (operator view).
   *
   * @param user Authenticated operator user payload.
   * @param userId Identifier of the operator user requesting the slot.
   * @param idDevice UUID of the device the request originates from.
   * @param searchSlot Slot name or code to look up.
   * @param _version Client app version (unused).
   * @returns Promise resolving to the slot pricing and availability.
   */
  @ApiOperation({
    summary: 'Get slot pricing and availability by slot name/code (operator)',
  })
  // @Auth()
  @AuthWithKeycloak()
  @Get('seach-slot/:userId/:idDevice/:searchSlot/:version')
  getPriceSlot(
    @GetUser() user: JwtPayload,
    @Param('userId', ParseIntPipe) userId: number,
    @Param('idDevice', ParseUUIDPipe) idDevice: string,
    @Param('searchSlot') searchSlot: string,
    @Param('version', ParseIntPipe) _version: number,
  ) {
    return this.operatorService.getPriceSlot(userId, searchSlot);
  }

  /**
   * Finds outstanding sanctions by identity card number (operator view).
   *
   * @param user Authenticated operator user payload.
   * @param userId Identifier of the operator user performing the search.
   * @param idDevice UUID of the device the request originates from.
   * @param identityCard Identity card number to search sanctions for.
   * @param version Client app version.
   * @param getIncidentDto Payload with additional sanction search parameters.
   * @returns Promise resolving to the outstanding sanctions found.
   */
  @ApiOperation({
    summary: 'Find outstanding sanctions by identity card number (operator)',
  })
  // @Auth()
  @AuthWithKeycloak()
  @Post('find-by-identity-card/:userId/:idDevice/:identityCard/:version')
  findSanctionByIdentityCard(
    @GetUser() user: JwtPayload,
    @Param('userId', ParseIntPipe) userId: number,
    @Param('idDevice', ParseUUIDPipe) idDevice: string,
    @Param('identityCard') identityCard: string,
    @Param('version', ParseIntPipe) version: number,
    @Body() getIncidentDto: GetIncidentDto,
  ) {
    return this.operatorService.findSanctionByIdentityCard(
      userId,
      idDevice,
      identityCard,
      getIncidentDto,
    );
  }
}
