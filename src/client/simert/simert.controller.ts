import {
    Body,
    Controller,
    Get,
    Param,
    ParseIntPipe,
    ParseUUIDPipe,
    Post,
    Query,
    UseInterceptors,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Fraction } from 'src/admin/fraction/entities/fraction.entity';
import { Slot } from 'src/admin/slot/entities/slot.entity';
import { AuthWithKeycloak, GetUser } from 'src/auth/decorators';
import { JwtPayload } from 'src/auth/interfaces';
import { ApiStandardResponse } from 'src/common/decorators/api-standard-response.decorator';
import { GetMeta } from 'src/common/decorators/get-meta.decorator';
import { ErrorCode } from 'src/common/glob/error';
import { MetaInterface } from 'src/common/intefaces/meta.interface';
import { SystemStatusInterceptor } from 'src/common/interceptors/system-status.interceptor';

import { CreateSimertDto } from './dto/create-simert.dto';
import { IncrementSimertDto } from './dto/increment-simert.dto';
import { SearchFractionDto } from './dto/search-simert.dto';
import { SimertService } from './simert.service';
/**
 * REST controller for the end-user Simert parking workflow (fractions, parking, time increments).
 *
 * Base route: `client/simert`. Delegates all business logic to {@link SimertService}.
 */
@ApiTags('Client - Simert')
@ApiBearerAuth('keycloak')
@Controller('client/simert')
export class SimertController {
    /**
     * Creates a new SimertController.
     *
     * @param simertService Service handling the Simert parking business logic.
     */
    constructor(private readonly simertService: SimertService) {}

    /**
     * Returns all active fractions for the given user.
     *
     * @param user Authenticated user payload extracted from the Keycloak token.
     * @param userId Identifier of the user whose active fractions are requested.
     * @param _idDevice Identifier of the requesting device (unused).
     * @param _version Client API version (unused).
     * @returns Promise resolving to the user's active fractions with block/zone/slot info.
     */
    @ApiOperation({ summary: 'Find all active fractions for the given user' })
    @ApiStandardResponse({
        description: 'Active fractions list with block/zone/slot info',
        errorCodes: [ErrorCode.NONE],
        data: {
            currentDate: {
                type: 'string',
                example: '2026-04-24T12:00:00.000Z',
            },
            fractions: { model: Fraction, isArray: true },
        },
    })
    @AuthWithKeycloak()
    @Get('find-all-fractions/:userId/:idDevice/:version')
    findAllFractions(
        @GetUser() user: JwtPayload,
        @Param('userId', ParseIntPipe) userId: number,
        @Param('idDevice', ParseUUIDPipe) _idDevice: string,
        @Param('version', ParseIntPipe) _version: number,
    ) {
        return this.simertService.findAllFractions(userId);
    }

    /**
     * Returns a single fraction by its identifier with block/zone/slot info.
     *
     * @param user Authenticated user payload extracted from the Keycloak token.
     * @param userId Identifier of the requesting user.
     * @param idDevice Identifier of the requesting device.
     * @param fractionId Identifier of the fraction to retrieve.
     * @param _version Client API version (unused).
     * @returns Promise resolving to the fraction detail, or null if not found.
     */
    @ApiOperation({
        summary: 'Find a single fraction by id with block/zone/slot',
    })
    @ApiStandardResponse({
        description: 'Fraction detail',
        errorCodes: [ErrorCode.NONE],
        data: {
            currentDate: {
                type: 'string',
                example: '2026-04-24T12:00:00.000Z',
            },
            fraction: { model: Fraction, nullable: true },
        },
    })
    @AuthWithKeycloak()
    @Get('find-fraction-by-id/:userId/:idDevice/:fractionId/:version')
    findFractionById(
        @GetUser() user: JwtPayload,
        @Param('userId', ParseIntPipe) userId: number,
        @Param('idDevice', ParseUUIDPipe) idDevice: string,
        @Param('fractionId', ParseIntPipe) fractionId: number,
        @Param('version', ParseIntPipe) _version: number,
    ) {
        return this.simertService.findFractionById(fractionId);
    }

    /**
     * Starts a parking fraction on a slot, consuming checkboxes when the parking is paid.
     *
     * @param user Authenticated user payload extracted from the Keycloak token.
     * @param meta Request metadata attached to the parking operation.
     * @param userId Identifier of the requesting user.
     * @param idDevice Identifier of the requesting device.
     * @param version Client API version.
     * @param createSimertDto Payload describing the parking fraction to create.
     * @returns Promise resolving to the created parking fraction with the slot marked as occupied.
     */
    @ApiOperation({
        summary:
            'Start a parking fraction on a slot (consumes checkboxes if paid)',
    })
    @ApiStandardResponse({
        description: 'Parking fraction created and slot marked as occupied',
        errorCodes: [
            ErrorCode.NONE,
            ErrorCode.NOT_FOUND,
            ErrorCode.OCCUPIED,
            ErrorCode.TRANSACTION_REPIT,
            ErrorCode.UNAUTHORIZED,
        ],
        data: {
            currentDate: {
                type: 'string',
                example: '2026-04-24T12:00:00.000Z',
            },
            fraction: { model: Fraction, nullable: true },
        },
    })
    @AuthWithKeycloak()
    @UseInterceptors(SystemStatusInterceptor)
    @Post('parking/:userId/:idDevice/:version')
    parking(
        @GetUser() user: JwtPayload,
        @GetMeta() meta: MetaInterface,
        @Param('userId', ParseIntPipe) userId: number,
        @Param('idDevice', ParseUUIDPipe) idDevice: string,
        @Param('version', ParseIntPipe) version: number,
        @Body() createSimertDto: CreateSimertDto,
    ) {
        createSimertDto.meta = meta;
        return this.simertService.parking(idDevice, createSimertDto);
    }

    /**
     * Increments parking time on an existing fraction, consuming checkboxes.
     *
     * @param user Authenticated user payload extracted from the Keycloak token.
     * @param meta Request metadata attached to the increment operation.
     * @param userId Identifier of the requesting user.
     * @param idDevice Identifier of the requesting device.
     * @param version Client API version.
     * @param incrementSimertDto Payload describing the time increment to apply.
     * @returns Promise resolving to the new fraction created with the incremented time.
     */
    @ApiOperation({
        summary:
            'Increment parking time on an existing fraction (consumes checkboxes)',
    })
    @ApiStandardResponse({
        description: 'New fraction created with incremented time',
        errorCodes: [
            ErrorCode.NONE,
            ErrorCode.NOT_FOUND,
            ErrorCode.TRANSACTION_REPIT,
            ErrorCode.UNAUTHORIZED,
        ],
        data: {
            currentDate: {
                type: 'string',
                example: '2026-04-24T12:00:00.000Z',
            },
            fraction: { model: Fraction, nullable: true },
        },
    })
    @AuthWithKeycloak()
    @Post('increment-time/:userId/:idDevice/:version')
    incrementTime(
        @GetUser() user: JwtPayload,
        @GetMeta() meta: MetaInterface,
        @Param('userId', ParseIntPipe) userId: number,
        @Param('idDevice', ParseUUIDPipe) idDevice: string,
        @Param('version', ParseIntPipe) version: number,
        @Body() incrementSimertDto: IncrementSimertDto,
    ) {
        incrementSimertDto.meta = meta;
        return this.simertService.incrementTime(idDevice, incrementSimertDto);
    }

    /**
     * Finishes a parking fraction and frees its slot.
     *
     * @param user Authenticated user payload extracted from the Keycloak token.
     * @param userId Identifier of the requesting user.
     * @param idDevice Identifier of the requesting device.
     * @param fractionId Identifier of the fraction to finish.
     * @param _version Client API version (unused).
     * @returns Promise resolving once the fraction is finished and the slot is released.
     */
    @ApiOperation({ summary: 'Finish a parking fraction and free the slot' })
    @ApiStandardResponse({
        description: 'Fraction finished and slot released',
        errorCodes: [ErrorCode.NONE, ErrorCode.NOT_FOUND],
        data: {},
    })
    @AuthWithKeycloak()
    @Post('finished/:userId/:idDevice/:fractionId/:version')
    finished(
        @GetUser() user: JwtPayload,
        @Param('userId', ParseIntPipe) userId: number,
        @Param('idDevice', ParseUUIDPipe) idDevice: string,
        @Param('fractionId', ParseIntPipe) fractionId: number,
        @Param('version', ParseIntPipe) _version: number,
    ) {
        return this.simertService.finished(userId, fractionId);
    }

    /**
     * Returns a slot by name with its pricing, schedules and the user's available checkboxes.
     *
     * @param user Authenticated user payload extracted from the Keycloak token.
     * @param userId Identifier of the requesting user.
     * @param idDevice Identifier of the requesting device.
     * @param searchSlot Name of the slot to look up.
     * @param _version Client API version (unused).
     * @returns Promise resolving to the slot info with pricing and the user's available checkboxes.
     */
    @ApiOperation({
        summary:
            'Get a slot by name with pricing, schedules and user checkboxes',
    })
    @ApiStandardResponse({
        description: 'Slot info with pricing and user available checkboxes',
        errorCodes: [ErrorCode.NONE, ErrorCode.NOT_FOUND, ErrorCode.OCCUPIED],
        data: {
            slot: { model: Slot, nullable: true },
            checkboxes: { type: 'number', example: 10 },
        },
    })
    @AuthWithKeycloak()
    @Get('seach-slot/:userId/:idDevice/:searchSlot/:version')
    getPriceSlot(
        @GetUser() user: JwtPayload,
        @Param('userId', ParseIntPipe) userId: number,
        @Param('idDevice', ParseUUIDPipe) idDevice: string,
        @Param('searchSlot') searchSlot: string,
        @Param('version', ParseIntPipe) _version: number,
    ) {
        return this.simertService.getPriceSlot(userId, searchSlot);
    }

    /**
     * Returns the user's fraction history across the current month and history partitions.
     *
     * @param user Authenticated user payload extracted from the Keycloak token.
     * @param userId Identifier of the user whose fraction history is requested.
     * @param idDevice Identifier of the requesting device.
     * @param version Client API version.
     * @param searchFractionDto Filters for the history query (year/month and optional date range).
     * @returns Promise resolving to the user's fraction history matching the provided filters.
     */
    @ApiOperation({
        summary:
            'Fraction history (current month and history partitions) for the user',
    })
    @ApiStandardResponse({
        description:
            'Fraction history filtered by year/month and optional date range',
        errorCodes: [ErrorCode.NONE],
        data: {
            fraction: {
                isArray: true,
                type: 'object',
                example: [
                    {
                        time: 60,
                        plate: 'ABC-1234',
                        registerAt: '2026-04-24T12:00:00.000Z',
                        departureDate: '2026-04-24T13:00:00.000Z',
                        image: null,
                        statusId: 2,
                        checkboxes: 4,
                        zone: 'Centro',
                        block: 'Block A',
                        slot: 'A01',
                        ltSlot: -3.99,
                        lgSlot: -79.2,
                    },
                ],
            },
        },
    })
    @AuthWithKeycloak()
    @Get('find-fraction-history/:userId/:idDevice/:version')
    findFractionHistory(
        @GetUser() user: JwtPayload,
        @Param('userId', ParseIntPipe) userId: number,
        @Param('idDevice', ParseUUIDPipe) idDevice: string,
        @Param('version', ParseIntPipe) version: number,
        @Query() searchFractionDto: SearchFractionDto,
    ) {
        return this.simertService.findFractionHistory(
            userId,
            searchFractionDto,
        );
    }
}
