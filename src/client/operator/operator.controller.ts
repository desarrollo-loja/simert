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
   *
   * @param operatorService
   */
  constructor(private readonly operatorService: OperatorService) {}

  /**
   *
   * @param createIncidentDto
   * @param userId
   * @param idDevice
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
   *
   * @param user
   * @param userId
   * @param idDevice
   * @param fractionId
   * @param _version
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
   *
   * @param user
   * @param meta
   * @param userId
   * @param idDevice
   * @param version
   * @param createOperatorDto
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
   *
   * @param user
   * @param meta
   * @param userId
   * @param idDevice
   * @param version
   * @param incrementOperatorDto
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
   *
   * @param user
   * @param criteria
   * @param userId
   * @param _idDevice
   * @param _version
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
   *
   * @param paginationDto
   * @param userId
   * @param idDevice
   * @param blockId
   * @param _version
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
   *
   * @param user
   * @param paginationDto
   * @param userId
   * @param idDevice
   * @param fractionId
   * @param _version
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
   *
   * @param user
   * @param criteria
   * @param _userId
   * @param _idDevice
   * @param _version
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
   *
   * @param _user
   * @param _criteria
   * @param _userId
   * @param _idDevice
   * @param _version
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
   *
   * @param user
   * @param card
   * @param _userId
   * @param _idDevice
   * @param _version
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
   *
   * @param user
   * @param userId
   * @param idDevice
   * @param searchSlot
   * @param _version
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
   *
   * @param user
   * @param userId
   * @param idDevice
   * @param identityCard
   * @param version
   * @param getIncidentDto
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
