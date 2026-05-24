import { Body, Controller, Get, Param, ParseIntPipe, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { FilterDto } from "../../common/dto/filter.dto";
import { CardService } from './card.service';
import { CreateCardDto } from './dto/create-card.dto';
import { UpdateCardDto } from './dto/update-card.dto';

/**
 * REST controller for managing payment cards.
 *
 * Base route: `admin/card`. Delegates all business logic to {@link CardService}.
 */
@ApiTags('Admin - Card')
@ApiBearerAuth('keycloak')
@Controller('admin/card')
export class CardController {
  constructor(private readonly cardService: CardService) { }

  /**
   * Creates a new card record and writes an audit log entry.
   *
   * @param userId - Route param: ID of the requesting user used for audit logging.
   * @param idDevice - Route param: device UUID (version handshake).
   * @param version - Route param: client version (version handshake).
   * @param createCardDto - Payload with card name, price, commission and checkbox count.
   * @returns The newly created card record.
   */
  @ApiOperation({ summary: 'Create a new card' })
  @Post(':userId/:idDevice/:version')
  create(
    @Param('userId', ParseIntPipe) userId: number,
    @Param('idDevice', ParseUUIDPipe) idDevice: string,
    @Param('version', ParseIntPipe) version: number,
    @Body() createCardDto: CreateCardDto) {
    return this.cardService.create(userId, createCardDto);
  }

  /**
   * Returns a paginated list of card records, optionally filtered by name.
   *
   * @param userId - Route param: ID of the requesting user (version handshake).
   * @param idDevice - Route param: device UUID (version handshake).
   * @param version - Route param: client version (version handshake).
   * @param filterDto - Query filters: search, limit, offset.
   * @returns Paginated card list with offset and limit echo.
   */
  @ApiOperation({ summary: 'List cards with optional filters' })
  @Get(':userId/:idDevice/:version')
  findAll(
    @Param('userId', ParseIntPipe) userId: number,
    @Param('idDevice', ParseUUIDPipe) idDevice: string,
    @Param('version', ParseIntPipe) version: number,
    @Query() filterDto: FilterDto,
  ) {
    return this.cardService.findAll(filterDto);
  }

  /**
   * Returns the total count of card records matching the optional name filter.
   *
   * @param userId - Route param: ID of the requesting user (version handshake).
   * @param idDevice - Route param: device UUID (version handshake).
   * @param version - Route param: client version (version handshake).
   * @param filterDto - Query filters: search.
   * @returns Object containing the numeric total count.
   */
  @ApiOperation({ summary: 'Count total cards with optional filters' })
  @Get('find-total/:userId/:idDevice/:version')
  findAllTotal(
    @Param('userId', ParseIntPipe) userId: number,
    @Param('idDevice', ParseUUIDPipe) idDevice: string,
    @Param('version', ParseIntPipe) version: number,
    @Query() filterDto: FilterDto,
  ) {
    return this.cardService.findAllTotal(filterDto);
  }

  /**
   * Applies a partial update to an existing card record.
   *
   * @param id - Path param: primary key of the card to update.
   * @param userId - Route param: ID of the requesting user (version handshake).
   * @param idDevice - Route param: device UUID (version handshake).
   * @param version - Route param: client version (version handshake).
   * @param updateCardDto - Fields to update on the card.
   * @returns The updated card record.
   */
  @ApiOperation({ summary: 'Update a card by id' })
  @Patch(':id/:userId/:idDevice/:version')
  update(
    @Param('id') id: string,
    @Param('userId', ParseIntPipe) userId: number,
    @Param('idDevice', ParseUUIDPipe) idDevice: string,
    @Param('version', ParseIntPipe) version: number,
    @Body() updateCardDto: UpdateCardDto
  ) {
    return this.cardService.update(+id, updateCardDto);
  }
}
