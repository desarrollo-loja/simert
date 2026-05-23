import { Body, Controller, Get, Param, ParseIntPipe, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthWithKeycloak, GetUser } from 'src/auth/decorators';
import { JwtPayload } from 'src/auth/interfaces';
import { ApiStandardResponse } from 'src/common/decorators/api-standard-response.decorator';
import { FilterDto } from 'src/common/dto/filter.dto';
import { ErrorCode } from 'src/common/glob/error';

import { BlockOperatorService } from './block_operator.service';
import { CreateBlockOperatorDto } from './dto/create-block_operator.dto';
import { FindUniqueUsersBlockOperatorDto } from './dto/find-unique-users-block-operator.dto';
import { UpdateBlockOperatorDto } from './dto/update-block_operator.dto';
import { BlockOperator } from './entities/block_operator.entity';

/**
 * REST controller for managing block operator shift assignments.
 *
 * Base route: `admin/block-operator`. Delegates all business logic to {@link BlockOperatorService}.
 */
@ApiTags('Admin - Block Operator')
@ApiBearerAuth('keycloak')
@Controller('admin/block-operator')
export class BlockOperatorController {
  constructor(private readonly blockOperatorService: BlockOperatorService) { }

  /**
   * Creates a new block operator shift assignment linking a municipal agent
   * to a parking block for a given time window.
   *
   * @param user - Keycloak JWT payload of the authenticated caller.
   * @param userId - Route param: ID of the requesting user used for audit logging.
   * @param idDevice - Route param: device UUID (version handshake).
   * @param version - Route param: client version (version handshake).
   * @param createBlockOperatorDto - Payload with blockId, userId, from/to range and flags.
   * @returns The newly created {@link BlockOperator} record.
   */
  @ApiOperation({ summary: 'Create a new block operator shift assignment' })
  @ApiStandardResponse({
    description: 'Block operator shift created',
    errorCodes: [ErrorCode.NONE],
    data: { blockOperator: { model: BlockOperator } },
  })
  @AuthWithKeycloak()
  @Post(':userId/:idDevice/:version')
  create(
    @GetUser() user: JwtPayload,
    @Param('userId', ParseIntPipe) userId: number,
    @Param('idDevice', ParseUUIDPipe) idDevice: string,
    @Param('version', ParseIntPipe) version: number,
    @Body() createBlockOperatorDto: CreateBlockOperatorDto
  ) {
    return this.blockOperatorService.create(userId, createBlockOperatorDto);
  }

  /**
   * Returns all block operator shifts for the block and date specified in the
   * filter, optionally narrowed to a single user.
   *
   * @param user - Keycloak JWT payload of the authenticated caller.
   * @param userId - Route param: ID of the requesting user (version handshake).
   * @param idDevice - Route param: device UUID (version handshake).
   * @param version - Route param: client version (version handshake).
   * @param filterDto - Query filters: blockId, date, userId.
   * @returns Array of matching {@link BlockOperator} records.
   */
  @ApiOperation({ summary: 'List block operator shifts filtered by block and date' })
  @ApiStandardResponse({
    description: 'Block operator shifts matching the filter',
    errorCodes: [ErrorCode.NONE],
    data: { blockOperators: { model: BlockOperator, isArray: true } },
  })
  @AuthWithKeycloak()
  @Get(':userId/:idDevice/:version')
  findAll(
    @GetUser() user: JwtPayload,
    @Param('userId', ParseIntPipe) userId: number,
    @Param('idDevice', ParseUUIDPipe) idDevice: string,
    @Param('version', ParseIntPipe) version: number,
    @Query() filterDto: FilterDto,
  ) {
    return this.blockOperatorService.findAll(filterDto);
  }

  /**
   * Returns all active (isInitialized=false, isFinalized=false) block operator
   * shifts for the user ID supplied in the filter query.
   *
   * @param user - Keycloak JWT payload of the authenticated caller.
   * @param userId - Route param: ID of the requesting user (version handshake).
   * @param idDevice - Route param: device UUID (version handshake).
   * @param version - Route param: client version (version handshake).
   * @param filterDto - Query filters: userId, isInitialized, isFinalized.
   * @returns Array of active {@link BlockOperator} records with joined block info.
   */
  @ApiOperation({ summary: 'List active block operator shifts for a given user' })
  @ApiStandardResponse({
    description: 'Active shifts (filtered by isInitialized and isFinalized) for the user',
    errorCodes: [ErrorCode.NONE],
    data: { blockOperators: { model: BlockOperator, isArray: true } },
  })
  @AuthWithKeycloak()
  @Get('active-by-user-id/:userId/:idDevice/:version')
  findAllActiveByUserId(
    @GetUser() user: JwtPayload,
    @Param('userId', ParseIntPipe) userId: number,
    @Param('idDevice', ParseUUIDPipe) idDevice: string,
    @Param('version', ParseIntPipe) version: number,
    @Query() filterDto: FilterDto,
  ) {
    return this.blockOperatorService.findAllActiveByUserId(filterDto);
  }

  /**
   * Returns all block operator shifts for a given block that overlap the
   * specified date range (dateFrom / dateTo).
   *
   * @param user - Keycloak JWT payload of the authenticated caller.
   * @param userId - Route param: ID of the requesting user (version handshake).
   * @param idDevice - Route param: device UUID (version handshake).
   * @param version - Route param: client version (version handshake).
   * @param filterDto - Query filters: blockId, dateFrom, dateTo.
   * @returns Array of matching {@link BlockOperator} records.
   */
  @ApiOperation({ summary: 'List block operator shifts filtered by block and date range' })
  @ApiStandardResponse({
    description: 'Block operator shifts matching the block/date range filter',
    errorCodes: [ErrorCode.NONE],
    data: { blockOperators: { model: BlockOperator, isArray: true } },
  })
  @AuthWithKeycloak()
  @Get('by-block-id/:userId/:idDevice/:version')
  findAllByBlockId(
    @GetUser() user: JwtPayload,
    @Param('userId', ParseIntPipe) userId: number,
    @Param('idDevice', ParseUUIDPipe) idDevice: string,
    @Param('version', ParseIntPipe) version: number,
    @Query() filterDto: FilterDto,
  ) {
    return this.blockOperatorService.findAllByBlockId(filterDto);
  }

  /**
   * Updates an existing block operator shift record by its numeric ID.
   *
   * @param id - Path param: primary key of the shift to update.
   * @param userId - Route param: ID of the requesting user used for audit logging.
   * @param idDevice - Route param: device UUID (version handshake).
   * @param version - Route param: client version (version handshake).
   * @param updateBlockOperatorDto - Fields to update on the shift.
   * @returns The updated {@link BlockOperator} record.
   */
  @ApiOperation({ summary: 'Update a block operator shift' })
  @ApiStandardResponse({
    description: 'Block operator shift updated',
    errorCodes: [ErrorCode.NONE],
    data: { blockOperator: { model: BlockOperator } },
  })
  @AuthWithKeycloak()
  @Patch(':id/:userId/:idDevice/:version')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Param('userId', ParseIntPipe) userId: number,
    @Param('idDevice', ParseUUIDPipe) idDevice: string,
    @Param('version', ParseIntPipe) version: number,
    @Body() updateBlockOperatorDto: UpdateBlockOperatorDto
  ) {
    return this.blockOperatorService.update(userId, id, updateBlockOperatorDto);
  }

  /**
   * Returns the unique user IDs (with block and zone context) for shifts that
   * are currently active — i.e. NOW() is within the from–to window,
   * isInitialized=true, and isFinalized=false.
   *
   * @param user - Keycloak JWT payload of the authenticated caller.
   * @param _userId - Route param: requesting user ID (version handshake, unused by service).
   * @param _idDevice - Route param: device UUID (version handshake, unused by service).
   * @param _version - Route param: client version (version handshake, unused by service).
   * @param findUniqueUsersDto - Optional blockIds and userId filters.
   * @returns Array of unique user records with blockId, blockName, zoneId, zoneName.
   */
  @ApiOperation({ summary: 'Unique user IDs with active shifts where NOW() is within from–to, isInitialized=true, isFinalized=false' })
  @ApiStandardResponse({
    description: 'Unique users with their block and zone info for active shifts',
    errorCodes: [ErrorCode.NONE],
    data: {
      users: {
        isArray: true,
        type: 'object',
        example: [{ userId: 1, blockId: 2, blockName: 'Bloque A', zoneId: 3, zoneName: 'Zona Norte' }],
      },
    },
  })
  @AuthWithKeycloak()
  @Post('unique-users/:userId/:idDevice/:version')
  findUniqueUsers(
    @GetUser() user: JwtPayload,
    @Param('userId', ParseIntPipe) _userId: number,
    @Param('idDevice', ParseUUIDPipe) _idDevice: string,
    @Param('version', ParseIntPipe) _version: number,
    @Body() findUniqueUsersDto: FindUniqueUsersBlockOperatorDto,
  ) {
    return this.blockOperatorService.findUniqueUsers(findUniqueUsersDto);
  }

  /**
   * Returns all block operator shifts formatted as name/label/value option
   * objects, suitable for populating select/dropdown components.
   *
   * @param _userId - Route param: requesting user ID (version handshake, unused by service).
   * @param _idDevice - Route param: device UUID (version handshake, unused by service).
   * @param _version - Route param: client version (version handshake, unused by service).
   * @returns Array of option objects: `{ name, label, id, value }`.
   */
  @ApiOperation({ summary: 'Simplified list of all block operator shifts formatted as name/label/value options' })
  @ApiStandardResponse({
    description: 'Options list built from all block operator shifts',
    errorCodes: [ErrorCode.NONE],
    data: {
      blockOperators: {
        isArray: true,
        type: 'object',
        example: [{ name: '2024-01-01 - 2024-01-02', label: '2024-01-01 - 2024-01-02', id: 1, value: 1 }],
      },
    },
  })
  @AuthWithKeycloak()
  @Get('get-block-operator/:userId/:idDevice/:version')
  getBlockOperator(
    @Param('userId', ParseIntPipe) _userId: number,
    @Param('idDevice', ParseUUIDPipe) _idDevice: string,
    @Param('version', ParseIntPipe) _version: number,
  ) {
    return this.blockOperatorService.getBlockOperator();
  }
}
