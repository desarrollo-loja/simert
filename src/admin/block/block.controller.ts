import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthWithKeycloak, GetUser } from 'src/auth/decorators';
import { JwtPayload } from 'src/auth/interfaces';
import { ApiStandardResponse } from 'src/common/decorators/api-standard-response.decorator';
import { FilterDto } from 'src/common/dto/filter.dto';
import { ErrorCode } from 'src/common/glob/error';

import { BlockService } from './block.service';
import { CreateBlockDto } from './dto/create-block.dto';
import { UpdateBlockDto } from './dto/update-block.dto';
import { Block } from './entities/block.entity';
/**
 * REST controller for managing parking blocks (sectors).
 *
 * Base route: `admin/block`. Delegates all business logic to {@link BlockService}.
 */
@ApiTags('Admin - Block')
@ApiBearerAuth('keycloak')
@Controller('admin/block')
export class BlockController {
  /**
   *
   * @param blockService
   */
  constructor(private readonly blockService: BlockService) {}

  /**
   *
   */
  @ApiOperation({ summary: 'Initialize sample blocks (internal use only)' })
  @ApiStandardResponse({
    description: 'Initial blocks created',
    data: {
      block1: { model: Block },
      block2: { model: Block },
    },
  })
  @Post('initializeDatabase')
  initializeDatabase() {
    return this.blockService.initializeDatabase();
  }

  // @Auth()
  /**
   *
   * @param user
   * @param userId
   * @param idDevice
   * @param createBlockDto
   */
  @ApiOperation({ summary: 'Create a new block (sector)' })
  @ApiStandardResponse({
    description: 'Block created',
    data: { block: { model: Block } },
  })
  @AuthWithKeycloak()
  @Post(':userId/:idDevice')
  create(
    @GetUser() user: JwtPayload,
    @Param('userId', ParseIntPipe) userId: number,
    @Param('idDevice', ParseUUIDPipe) idDevice: string,
    @Body() createBlockDto: CreateBlockDto,
  ) {
    return this.blockService.create(userId, createBlockDto);
  }

  // @Auth()
  /**
   *
   * @param user
   * @param filterDto
   * @param _userId
   * @param _idDevice
   */
  @ApiOperation({ summary: 'Paginated list of blocks with zone info' })
  @ApiStandardResponse({
    description: 'Paginated blocks list',
    data: {
      blocks: { model: Block, isArray: true },
      total: { type: 'number', example: 30 },
      offset: { type: 'number', example: 0 },
      limit: { type: 'number', example: 10 },
    },
  })
  @AuthWithKeycloak()
  @Get('all/:userId/:idDevice')
  findAll(
    @GetUser() user: JwtPayload,
    @Query() filterDto: FilterDto,
    @Param('userId', ParseIntPipe) _userId: number,
    @Param('idDevice', ParseUUIDPipe) _idDevice: string,
  ) {
    return this.blockService.findAll(filterDto);
  }

  /**
   *
   * @param zoneId
   */
  @ApiOperation({ summary: 'Blocks filtered by zone (reduced fields)' })
  @ApiStandardResponse({
    description: 'Reduced blocks list (id, name, geofence)',
    data: { blocks: { model: Block, isArray: true } },
  })
  @Get('filter/:zoneId')
  findAllByfilter(@Param('zoneId') zoneId: number) {
    return this.blockService.findAllByfilter(zoneId);
  }

  /**
   *
   * @param version
   * @param filterDto
   */
  @ApiOperation({ summary: 'Blocks for parking module (with parsed geofence)' })
  @ApiStandardResponse({
    description: 'Blocks list with parsed multi-polygon geofence',
    data: {
      blocks: {
        isArray: true,
        type: 'object',
        example: [{ id: 1, name: 'Zona A', color: '#7986CB', geofence: [] }],
      },
    },
  })
  @Get('filter/parking/:version')
  findAllByFilterParking(
    @Param('version', ParseIntPipe) version: number,
    @Query() filterDto: FilterDto,
  ) {
    return this.blockService.findAllByFilterParking(version, filterDto);
  }

  /**
   *
   * @param id
   */
  @ApiOperation({ summary: 'Get a block by id (placeholder)' })
  @ApiStandardResponse({
    description: 'Placeholder response string',
    data: {},
  })
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.blockService.findOne(+id);
  }

  // @Auth()
  /**
   *
   * @param user
   * @param userId
   * @param idDevice
   * @param id
   * @param updateBlockDto
   */
  @ApiOperation({ summary: 'Update a block' })
  @ApiStandardResponse({
    description: 'Block updated',
    data: { block: { model: Block } },
  })
  @AuthWithKeycloak()
  @Patch(':userId/:idDevice/:id')
  update(
    @GetUser() user: JwtPayload,
    @Param('userId', ParseIntPipe) userId: number,
    @Param('idDevice', ParseUUIDPipe) idDevice: string,
    @Param('id') id: string,
    @Body() updateBlockDto: UpdateBlockDto,
  ) {
    if (user.id !== userId || user.idDevice !== idDevice) {
      throw new ForbiddenException(`Unauthorized user`);
    }
    return this.blockService.update(userId, +id, updateBlockDto);
  }

  /**
   *
   * @param id
   */
  @ApiOperation({ summary: 'Delete a block (placeholder)' })
  @ApiStandardResponse({
    description: 'Placeholder response string',
    data: {},
  })
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.blockService.remove(+id);
  }

  // SIMERT SECTOR MODULE
  // @Auth()
  /**
   *
   * @param user
   * @param userId
   * @param idDevice
   * @param version
   * @param filterDto
   */
  @ApiOperation({
    summary: 'List blocks for the sector module (raw SQL with zone info)',
  })
  @ApiStandardResponse({
    description: 'Blocks with parsed geofence and zone data',
    errorCodes: [ErrorCode.NONE, ErrorCode.NOT_FOUND],
    data: {
      blocks: {
        isArray: true,
        type: 'object',
        example: [
          {
            id: 1,
            name: 'Zona A',
            acronym: 'ZA',
            color: '#7986CB',
            geofence: [],
            numberPolygon: 1,
            nameZone: 'Centro',
            geofenceZone: [],
            numberPolygonZone: 1,
          },
        ],
      },
    },
  })
  @AuthWithKeycloak()
  @Get('get-all-block-sector/:userId/:idDevice/:version')
  getAllBlockSector(
    @GetUser() user: JwtPayload,
    @Param('userId', ParseIntPipe) userId: number,
    @Param('idDevice', ParseUUIDPipe) idDevice: string,
    @Param('version', ParseIntPipe) version: number,
    @Query() filterDto: FilterDto,
  ) {
    return this.blockService.getAllBlockSector(filterDto);
  }

  // @Auth()
  /**
   *
   * @param user
   * @param userId
   * @param idDevice
   * @param version
   * @param createBlockDto
   */
  @ApiOperation({ summary: 'Create a new block for the sector module' })
  @ApiStandardResponse({
    description: 'Block created',
    errorCodes: [ErrorCode.NONE, ErrorCode.NAMEUNIQUE, ErrorCode.ACRONYMUNIQUE],
    data: { block: { model: Block } },
  })
  @AuthWithKeycloak()
  @Post('create-block-sector/:userId/:idDevice/:version')
  createBlockSector(
    @GetUser() user: JwtPayload,
    @Param('userId', ParseIntPipe) userId: number,
    @Param('idDevice', ParseUUIDPipe) idDevice: string,
    @Param('version', ParseIntPipe) version: number,
    @Body() createBlockDto: CreateBlockDto,
  ) {
    return this.blockService.createBlockSector(userId, createBlockDto);
  }

  // @Auth()
  /**
   *
   * @param user
   * @param userId
   * @param idDevice
   * @param version
   * @param id
   * @param updateBlockDto
   */
  @ApiOperation({ summary: 'Update a block in the sector module' })
  @ApiStandardResponse({
    description: 'Block updated',
    errorCodes: [ErrorCode.NONE, ErrorCode.NAMEUNIQUE, ErrorCode.ACRONYMUNIQUE],
    data: { block: { model: Block } },
  })
  @AuthWithKeycloak()
  @Patch('update-block-sector/:userId/:idDevice/:version/:id')
  updateBlockSector(
    @GetUser() user: JwtPayload,
    @Param('userId', ParseIntPipe) userId: number,
    @Param('idDevice', ParseUUIDPipe) idDevice: string,
    @Param('version', ParseIntPipe) version: number,
    @Param('id') id: string,
    @Body() updateBlockDto: UpdateBlockDto,
  ) {
    if (user.id !== userId || user.idDevice !== idDevice) {
      throw new ForbiddenException(`Unauthorized user`);
    }
    return this.blockService.updateBlockSector(userId, +id, updateBlockDto);
  }
}
