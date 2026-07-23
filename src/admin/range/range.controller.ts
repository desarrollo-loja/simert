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
import { FilterDto } from 'src/common/dto/filter.dto';

import { CreateRangeDto } from './dto/create-range.dto';
import { UpdateRangeDto } from './dto/update-range.dto';
import { RangeService } from './range.service';
/**
 * REST controller for managing price ranges associated with blocks.
 *
 * Base route: `admin/range`. Delegates all business logic to {@link RangeService}.
 */
@ApiTags('Admin - Range')
@ApiBearerAuth('keycloak')
@Controller('admin/range')
export class RangeController {
    /**
     * Creates a new RangeController instance.
     *
     * @param rangeService Service that handles price range business logic.
     */
    constructor(private readonly rangeService: RangeService) {}

    /**
     * Creates a new price range for a block.
     *
     * @param user Authenticated user payload extracted from the Keycloak token.
     * @param userId Identifier of the user performing the operation.
     * @param idDevice Identifier of the device originating the request.
     * @param version Client API version.
     * @param createRangeDto Payload describing the price range to create.
     * @returns Promise resolving to the created price range.
     */
    @ApiOperation({ summary: 'Create a new price range for a block' })
    @AuthWithKeycloak()
    @Post('create/:userId/:idDevice/:version')
    create(
        @GetUser() user: JwtPayload,
        @Param('userId', ParseIntPipe) userId: number,
        @Param('idDevice', ParseUUIDPipe) idDevice: string,
        @Param('version', ParseIntPipe) version: number,
        @Body() createRangeDto: CreateRangeDto,
    ) {
        return this.rangeService.create(userId, createRangeDto);
    }

    /**
     * Updates an existing price range.
     *
     * @param user Authenticated user payload extracted from the Keycloak token.
     * @param userId Identifier of the user performing the operation.
     * @param idDevice Identifier of the device originating the request.
     * @param id Identifier of the price range to update.
     * @param version Client API version.
     * @param updateRangeDto Payload with the fields to update.
     * @returns Promise resolving to the updated price range.
     */
    @ApiOperation({ summary: 'Update an existing price range' })
    @AuthWithKeycloak()
    @Patch('update/:userId/:idDevice/:id/:version')
    update(
        @GetUser() user: JwtPayload,
        @Param('userId', ParseIntPipe) userId: number,
        @Param('idDevice', ParseUUIDPipe) idDevice: string,
        @Param('id') id: string,
        @Param('version', ParseIntPipe) version: number,
        @Body() updateRangeDto: UpdateRangeDto,
    ) {
        return this.rangeService.update(userId, +id, updateRangeDto);
    }

    /**
     * Lists price ranges that match the provided filters.
     *
     * @param user Authenticated user payload extracted from the Keycloak token.
     * @param userId Identifier of the user performing the operation.
     * @param idDevice Identifier of the device originating the request.
     * @param version Client API version.
     * @param filterDto Filtering and pagination criteria.
     * @returns Promise resolving to the list of matching price ranges.
     */
    @ApiOperation({ summary: 'List price ranges with optional filters' })
    @AuthWithKeycloak()
    @Get('findAll/:userId/:idDevice/:version')
    findAll(
        @GetUser() user: JwtPayload,
        @Param('userId', ParseIntPipe) userId: number,
        @Param('idDevice', ParseUUIDPipe) idDevice: string,
        @Param('version', ParseIntPipe) version: number,
        @Query() filterDto: FilterDto,
    ) {
        return this.rangeService.findAll(filterDto);
    }

    /**
     * Counts the total number of price ranges matching the provided filters.
     *
     * @param user Authenticated user payload extracted from the Keycloak token.
     * @param userId Identifier of the user performing the operation.
     * @param idDevice Identifier of the device originating the request.
     * @param filterDto Filtering criteria.
     * @returns Promise resolving to the total count of matching price ranges.
     */
    @ApiOperation({ summary: 'Count total price ranges matching filters' })
    @AuthWithKeycloak()
    @Get('findAllTotal/:userId/:idDevice/:version')
    findAllTotal(
        @GetUser() user: JwtPayload,
        @Param('userId', ParseIntPipe) userId: number,
        @Param('idDevice', ParseUUIDPipe) idDevice: string,
        @Query() filterDto: FilterDto,
    ) {
        return this.rangeService.findAllTotal(filterDto);
    }

    /**
     * Verifies whether a valid price range exists for the given filters.
     *
     * @param user Authenticated user payload extracted from the Keycloak token.
     * @param userId Identifier of the user performing the operation.
     * @param idDevice Identifier of the device originating the request.
     * @param version Client API version.
     * @param filterDto Filtering criteria used to locate a valid range.
     * @returns Promise resolving to the verification result.
     */
    @ApiOperation({
        summary: 'Verify whether a valid range exists for the given filters',
    })
    @AuthWithKeycloak()
    @Get('verifyRange/:userId/:idDevice/:version')
    verifyRange(
        @GetUser() user: JwtPayload,
        @Param('userId', ParseIntPipe) userId: number,
        @Param('idDevice', ParseUUIDPipe) idDevice: string,
        @Param('version', ParseIntPipe) version: number,
        @Query() filterDto: FilterDto,
    ) {
        return this.rangeService.verifyRange(filterDto);
    }
}
