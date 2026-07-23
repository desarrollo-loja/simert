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
import { FilterDto } from 'src/common/dto/filter.dto';

import { CreateSalePointDto } from './dto/create-sale-point.dto';
import { UpdateSalePointDto } from './dto/update-sale-point.dto';
import { SalePointService } from './sale-point.service';

/**
 * REST controller for managing sale points.
 *
 * Base route: `admin/sale-point`. Delegates all business logic to {@link SalePointService}.
 */
@ApiTags('Admin - Sale Point')
@ApiBearerAuth('keycloak')
@Controller('admin/sale-point')
export class SalePointController {
    /**
     * Creates the controller and injects its dependencies.
     *
     * @param salePointService Service that handles sale point business logic.
     */
    constructor(private readonly salePointService: SalePointService) {}

    /**
     * Creates a new sale point linked to the given user.
     *
     * @param userId Identifier of the user the sale point is linked to.
     * @param idDevice Identifier of the device issuing the request.
     * @param version Client application version.
     * @param createSalePointDto Payload with the data of the sale point to create.
     * @returns Promise resolving to the created sale point.
     */
    @ApiOperation({ summary: 'Create a new sale point linked to a user' })
    @Post(':userId/:idDevice/:version')
    create(
        @Param('userId', ParseIntPipe) userId: number,
        @Param('idDevice', ParseUUIDPipe) idDevice: string,
        @Param('version', ParseIntPipe) version: number,
        @Body() createSalePointDto: CreateSalePointDto,
    ) {
        return this.salePointService.create(userId, createSalePointDto);
    }

    /**
     * Lists sale points applying the provided filters.
     *
     * @param userId Identifier of the user issuing the request.
     * @param idDevice Identifier of the device issuing the request.
     * @param version Client application version.
     * @param filterDto Filter and pagination criteria.
     * @returns Promise resolving to the matching sale points.
     */
    @ApiOperation({ summary: 'List sale points with optional filters' })
    @Get(':userId/:idDevice/:version')
    findAll(
        @Param('userId', ParseIntPipe) userId: number,
        @Param('idDevice', ParseUUIDPipe) idDevice: string,
        @Param('version', ParseIntPipe) version: number,
        @Query() filterDto: FilterDto,
    ) {
        return this.salePointService.findAll(filterDto);
    }

    /**
     * Lists sale points applying additional filter criteria.
     *
     * @param userId Identifier of the user issuing the request.
     * @param idDevice Identifier of the device issuing the request.
     * @param version Client application version.
     * @param filterDto Additional filter criteria.
     * @returns Promise resolving to the matching sale points.
     */
    @ApiOperation({
        summary: 'List sale points applying additional filter criteria',
    })
    @Get('filter/:userId/:idDevice/:version')
    findAllFilter(
        @Param('userId', ParseIntPipe) userId: number,
        @Param('idDevice', ParseUUIDPipe) idDevice: string,
        @Param('version', ParseIntPipe) version: number,
        @Query() filterDto: FilterDto,
    ) {
        return this.salePointService.findAllFilter(filterDto);
    }

    /**
     * Counts the total number of sale points matching the provided filters.
     *
     * @param userId Identifier of the user issuing the request.
     * @param idDevice Identifier of the device issuing the request.
     * @param version Client application version.
     * @param filterDto Filter criteria used to count sale points.
     * @returns Promise resolving to the total number of matching sale points.
     */
    @ApiOperation({ summary: 'Count total sale points matching filters' })
    @Get('total/:userId/:idDevice/:version')
    findAllTotal(
        @Param('userId', ParseIntPipe) userId: number,
        @Param('idDevice', ParseUUIDPipe) idDevice: string,
        @Param('version', ParseIntPipe) version: number,
        @Query() filterDto: FilterDto,
    ) {
        return this.salePointService.findAllTotal(filterDto);
    }

    /**
     * Updates a sale point identified by its id.
     *
     * @param id Identifier of the sale point to update.
     * @param userId Identifier of the user issuing the request.
     * @param idDevice Identifier of the device issuing the request.
     * @param version Client application version.
     * @param updateSalePointDto Payload with the fields to update.
     * @returns Promise resolving to the updated sale point.
     */
    @ApiOperation({ summary: 'Update a sale point by id' })
    @Patch(':id/:userId/:idDevice/:version')
    update(
        @Param('id', ParseIntPipe) id: number,
        @Param('userId', ParseIntPipe) userId: number,
        @Param('idDevice', ParseUUIDPipe) idDevice: string,
        @Param('version', ParseIntPipe) version: number,
        @Body() updateSalePointDto: UpdateSalePointDto,
    ) {
        return this.salePointService.update(userId, id, updateSalePointDto);
    }

    /**
     * Checks whether a sale point exists for the given target user.
     *
     * @param targetUserId Identifier of the user whose sale point existence is checked.
     * @param _userId Identifier of the user issuing the request.
     * @param _idDevice Identifier of the device issuing the request.
     * @param _version Client application version.
     * @returns Promise resolving to whether a sale point exists for the target user.
     */
    @ApiOperation({
        summary: 'Check whether a sale point exists for a given userId',
    })
    @Get('exists/:targetUserId/:userId/:idDevice/:version')
    existsByUserId(
        @Param('targetUserId', ParseIntPipe) targetUserId: number,
        @Param('userId', ParseIntPipe) _userId: number,
        @Param('idDevice', ParseUUIDPipe) _idDevice: string,
        @Param('version', ParseIntPipe) _version: number,
    ) {
        return this.salePointService.existsByUserId(targetUserId);
    }
}
