import {
    Body,
    Controller,
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

import { CreateSlotDto } from './dto/create-slot.dto';
import { UpdateSlotDto } from './dto/update-slot.dto';
import { Slot } from './entities/slot.entity';
import { SlotService } from './slot.service';
/**
 * REST controller for managing parking slots.
 *
 * Base route: `admin/slot`. Delegates all business logic to {@link SlotService}.
 */
@ApiTags('Admin - Slot')
@ApiBearerAuth('keycloak')
@Controller('admin/slot')
export class SlotController {
    /**
     * Creates a new {@link SlotController}.
     *
     * @param slotService Service that handles parking slot business logic.
     */
    constructor(private readonly slotService: SlotService) {}

    /**
     * Initializes the database with a sample slot (internal use only).
     *
     * @returns Promise resolving to the created initial slot.
     */
    @ApiOperation({ summary: 'Initialize a sample slot (internal use only)' })
    @ApiStandardResponse({
        description: 'Initial slot created',
        data: { slot1: { model: Slot } },
    })
    @Post('initializeDatabase')
    initializeDatabase() {
        return this.slotService.initializeDatabase();
    }

    /**
     * Creates a new parking slot.
     *
     * @param user Authenticated user extracted from the Keycloak token.
     * @param userId Identifier of the user performing the operation.
     * @param idDevice Identifier of the device performing the operation.
     * @param createSlotDto Payload describing the slot to create.
     * @returns Promise resolving to the created slot.
     */
    @ApiOperation({ summary: 'Create a new parking slot' })
    @ApiStandardResponse({
        description:
            'Slot created. `NAMEUNIQUE` when the name already exists in the zone.',
        errorCodes: [ErrorCode.NONE, ErrorCode.NAMEUNIQUE],
        data: { slot: { model: Slot } },
    })
    @AuthWithKeycloak()
    @Post(':userId/:idDevice')
    create(
        @GetUser() user: JwtPayload,
        @Param('userId', ParseIntPipe) userId: number,
        @Param('idDevice', ParseUUIDPipe) idDevice: string,
        @Body() createSlotDto: CreateSlotDto,
    ) {
        return this.slotService.create(userId, createSlotDto);
    }

    /**
     * Retrieves a paginated list of slots including their zone and block.
     *
     * @param user Authenticated user extracted from the Keycloak token.
     * @param userId Identifier of the user performing the operation.
     * @param idDevice Identifier of the device performing the operation.
     * @param filterDto Pagination and filtering options.
     * @returns Promise resolving to the paginated slots list with totals.
     */
    @ApiOperation({ summary: 'Paginated list of slots with zone and block' })
    @ApiStandardResponse({
        description: 'Paginated slots list',
        data: {
            slots: { model: Slot, isArray: true },
            total: { type: 'number', example: 120 },
            offset: { type: 'number', example: 0 },
            limit: { type: 'number', example: 10 },
        },
    })
    @AuthWithKeycloak()
    @Get('all/:userId/:idDevice')
    findAll(
        @GetUser() user: JwtPayload,
        @Param('userId', ParseIntPipe) userId: number,
        @Param('idDevice', ParseUUIDPipe) idDevice: string,
        @Query() filterDto: FilterDto,
    ) {
        return this.slotService.findAll(filterDto);
    }

    /**
     * Retrieves slots filtered by block and zone as a reduced id/name list.
     *
     * @param blockId Identifier of the block to filter by.
     * @param zoneId Identifier of the zone to filter by.
     * @returns Promise resolving to a reduced list of slots ({id, name}).
     */
    @ApiOperation({ summary: 'Slots by block and zone (raw id/name)' })
    @ApiStandardResponse({
        description: 'Reduced list {id, name}',
        data: {
            slots: {
                isArray: true,
                type: 'object',
                example: [{ id: 1, name: 'A01' }],
            },
        },
    })
    @Get('filter/:blockId/:zoneId')
    findAllByfilter(
        @Param('blockId') blockId: number,
        @Param('zoneId') zoneId: number,
    ) {
        return this.slotService.findAllByfilter(blockId, zoneId);
    }

    /**
     * Retrieves slots filtered by block and zone including their fractions info.
     *
     * @param user Authenticated user extracted from the Keycloak token.
     * @param userId Identifier of the user performing the operation.
     * @param idDevice Identifier of the device performing the operation.
     * @param blockId Identifier of the block to filter by.
     * @param zoneId Identifier of the zone to filter by.
     * @param version Client version sent in the request path.
     * @param paginationDto Pagination and filtering options.
     * @returns Promise resolving to the slots with their fractions information.
     */
    @ApiOperation({
        summary: 'Slots by block and zone including fractions info',
    })
    @ApiStandardResponse({
        description: 'Slots with fractions. `slot` is empty if no results.',
        errorCodes: [ErrorCode.NONE, ErrorCode.NOT_FOUND],
        data: {
            slot: { model: Slot, isArray: true },
        },
    })
    @AuthWithKeycloak()
    @Get(
        'filter-slot-block/parking/:userId/:idDevice/:blockId/:zoneId/:version',
    )
    findAllSlotBlockParking(
        @GetUser() user: JwtPayload,
        @Param('userId', ParseIntPipe) userId: number,
        @Param('idDevice', ParseUUIDPipe) idDevice: string,
        @Param('blockId') blockId: number,
        @Param('zoneId') zoneId: number,
        @Param('version', ParseIntPipe) version: number,
        @Query() paginationDto: FilterDto,
    ) {
        return this.slotService.findAllSlotBlockParking(
            blockId,
            zoneId,
            paginationDto,
        );
    }

    /**
     * Updates an existing parking slot.
     *
     * @param user Authenticated user extracted from the Keycloak token.
     * @param userId Identifier of the user performing the operation.
     * @param idDevice Identifier of the device performing the operation.
     * @param id Identifier of the slot to update.
     * @param updateSlotDto Payload describing the fields to update.
     * @returns Promise resolving to the updated slot.
     */
    @ApiOperation({ summary: 'Update a parking slot' })
    @ApiStandardResponse({
        description:
            'Slot updated. `NAMEUNIQUE` when the name already exists in the zone.',
        errorCodes: [ErrorCode.NONE, ErrorCode.NAMEUNIQUE],
        data: { slot: { model: Slot } },
    })
    @AuthWithKeycloak()
    @Patch(':userId/:idDevice/:id')
    update(
        @GetUser() user: JwtPayload,
        @Param('userId', ParseIntPipe) userId: number,
        @Param('idDevice', ParseUUIDPipe) idDevice: string,
        @Param('id') id: string,
        @Body() updateSlotDto: UpdateSlotDto,
    ) {
        return this.slotService.update(userId, +id, updateSlotDto);
    }

    /**
     * Retrieves slots by block and zone as raw records including coordinates.
     *
     * @param user Authenticated user extracted from the Keycloak token.
     * @param blockId Identifier of the block to filter by.
     * @param zoneId Identifier of the zone to filter by.
     * @param _userId Identifier of the user performing the operation (unused).
     * @param _idDevice Identifier of the device performing the operation (unused).
     * @param _version Client version sent in the request path (unused).
     * @returns Promise resolving to the raw slot list with coordinates.
     */
    @ApiOperation({ summary: 'Slots by block and zone (raw with coordinates)' })
    @ApiStandardResponse({
        description: 'Raw slot list with coordinates',
        data: {
            slots: {
                isArray: true,
                type: 'object',
                example: [
                    {
                        id: 1,
                        nameSlot: 'A01',
                        ltSlot: -3.99,
                        lgSlot: -79.2,
                        blockId: 1,
                        zoneId: 1,
                    },
                ],
            },
        },
    })
    @AuthWithKeycloak()
    @Get(
        'get-slots-by-block-by-zone/:blockId/:zoneId/:userId/:idDevice/:version',
    )
    getSlotsByBlockByZone(
        @GetUser() user: JwtPayload,
        @Param('blockId') blockId: number,
        @Param('zoneId') zoneId: number,
        @Param('userId', ParseIntPipe) _userId: number,
        @Param('idDevice', ParseUUIDPipe) _idDevice: string,
        @Param('version', ParseIntPipe) _version: number,
    ) {
        return this.slotService.getSlotsByBlockByZone(blockId, zoneId);
    }

    /**
     * Retrieves slots located within a polygon (geofence).
     *
     * @param user Authenticated user extracted from the Keycloak token.
     * @param blockId Identifier of the block to filter by.
     * @param zoneId Identifier of the zone to filter by.
     * @param userId Identifier of the user performing the operation.
     * @param idDevice Identifier of the device performing the operation.
     * @param version Client version sent in the request path.
     * @param filterDto Filtering options describing the polygon geofence.
     * @returns Promise resolving to the slots inside the polygon.
     */
    @ApiOperation({ summary: 'Slots within a polygon (geofence)' })
    @ApiStandardResponse({
        description:
            'Slots inside the polygon. `slots` empty if table does not exist.',
        data: {
            slots: {
                isArray: true,
                type: 'object',
                example: [
                    {
                        id: 1,
                        nameSlot: 'A01',
                        ltSlot: -3.99,
                        lgSlot: -79.2,
                        blockId: 1,
                        zoneId: 1,
                    },
                ],
            },
        },
    })
    @AuthWithKeycloak()
    @Get('get-slots-by-polygon/:userId/:idDevice/:version')
    getSlotsByPolygon(
        @GetUser() user: JwtPayload,
        @Param('blockId') blockId: number,
        @Param('zoneId') zoneId: number,
        @Param('userId', ParseIntPipe) userId: number,
        @Param('idDevice', ParseUUIDPipe) idDevice: string,
        @Param('version', ParseIntPipe) version: number,
        @Query() filterDto: FilterDto,
    ) {
        return this.slotService.getSlotsByPolygon(filterDto);
    }

    /**
     * Retrieves slot occupancy statistics grouped by status.
     *
     * @param userId Identifier of the user performing the operation.
     * @param idDevice Identifier of the device performing the operation.
     * @param version Client version sent in the request path.
     * @param filterDto Filtering options for the statistics query.
     * @returns Promise resolving to the occupancy counts per status.
     */
    @ApiOperation({ summary: 'Slot occupancy statistics' })
    @ApiStandardResponse({
        description:
            'Counts per status (available, occupied, exceeded, sanctioned, grace_time, pcd, out_of_service)',
        errorCodes: [ErrorCode.NONE, ErrorCode.NOT_FOUND],
        data: {
            message: { type: 'string', example: 'Resultados encontrados' },
            slots: {
                isArray: true,
                type: 'object',
                example: [
                    {
                        available: 10,
                        occupied: 5,
                        exceeded: 1,
                        sanctioned: 0,
                        grace_time: 0,
                        pcd: 2,
                        out_of_service: 0,
                    },
                ],
            },
        },
    })
    @AuthWithKeycloak()
    @Get('find-statistics/:userId/:idDevice/:version')
    findStatistics(
        @Param('userId', ParseIntPipe) userId: number,
        @Param('idDevice', ParseUUIDPipe) idDevice: string,
        @Param('version', ParseIntPipe) version: number,
        @Query() filterDto: FilterDto,
    ) {
        return this.slotService.findStatistics(filterDto);
    }
}
