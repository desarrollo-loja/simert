import {
    Body,
    Controller,
    Delete,
    Get,
    Param,
    ParseIntPipe,
    ParseUUIDPipe,
    Patch,
    Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthWithKeycloak, GetUser } from 'src/auth/decorators';
import { JwtPayload } from 'src/auth/interfaces';

import { CreateIncidentTypeDto } from './dto/create-incident-type.dto';
import { IncidentTypeFilterDto } from './dto/incident-type-filterdto.dto';
import { UpdateIncidentTypeDto } from './dto/update-incident-type.dto';
import { IncidentTypeService } from './incident-type.service';
/**
 * REST controller for managing incident types.
 *
 * Base route: `admin/incident-type`. Delegates all business logic to {@link IncidentTypeService}.
 */
@ApiTags('Admin - Incident Type')
@ApiBearerAuth('keycloak')
@Controller('admin/incident-type')
export class IncidentTypeController {
    /**
     * Creates the controller and injects its dependencies.
     *
     * @param incidentTypeService Service that handles incident-type business logic.
     */
    constructor(private readonly incidentTypeService: IncidentTypeService) {}

    /**
     * Creates a new incident type.
     *
     * @param userId Identifier of the user performing the operation.
     * @param idDevice Identifier of the device originating the request.
     * @param createIncidentTypeDto Payload describing the incident type to create.
     * @returns Promise resolving to the created incident type.
     */
    @ApiOperation({ summary: 'Create a new incident type' })
    // @Auth()
    @Post('create/:userId/:idDevice')
    create(
        // @GetUser() user: JwtPayload,
        @Param('userId', ParseIntPipe) userId: number,
        @Param('idDevice', ParseUUIDPipe) idDevice: string,
        @Body() createIncidentTypeDto: CreateIncidentTypeDto,
    ) {
        return this.incidentTypeService.create(userId, createIncidentTypeDto);
    }

    /**
     * Lists incident types matching the provided filters.
     *
     * @param userId Identifier of the user performing the operation.
     * @param idDevice Identifier of the device originating the request.
     * @param filterDto Filter criteria used to narrow the results.
     * @returns Promise resolving to the list of matching incident types.
     */
    @ApiOperation({ summary: 'List incident types with filters' })
    // @Auth()
    @Patch('find-all/:userId/:idDevice')
    findAll(
        // @GetUser() user: JwtPayload,
        @Param('userId', ParseIntPipe) userId: number,
        @Param('idDevice', ParseUUIDPipe) idDevice: string,
        @Body() filterDto: IncidentTypeFilterDto,
    ) {
        return this.incidentTypeService.findAll(filterDto);
    }

    /**
     * Retrieves a single incident type by its identifier.
     *
     * @param userId Identifier of the user performing the operation.
     * @param idDevice Identifier of the device originating the request.
     * @param id Identifier of the incident type to retrieve.
     * @returns Promise resolving to the requested incident type.
     */
    @ApiOperation({ summary: 'Get a single incident type by id' })
    @Get('get-type-incident-by-id/:userId/:idDevice/:id')
    getTypeIncidentById(
        @Param('userId', ParseIntPipe) userId: number,
        @Param('idDevice', ParseUUIDPipe) idDevice: string,
        @Param('id', ParseIntPipe) id: number,
    ) {
        return this.incidentTypeService.getTypeIncidentById(id);
    }

    /**
     * Updates an existing incident type by its identifier.
     *
     * @param userId Identifier of the user performing the operation.
     * @param idDevice Identifier of the device originating the request.
     * @param id Identifier of the incident type to update.
     * @param updateIncidentTypeDto Payload describing the fields to update.
     * @returns Promise resolving to the updated incident type.
     */
    @ApiOperation({ summary: 'Update an incident type by id' })
    // @Auth()
    @Patch('update/:userId/:idDevice/:id')
    update(
        // @GetUser() user: JwtPayload,
        @Param('userId', ParseIntPipe) userId: number,
        @Param('idDevice', ParseUUIDPipe) idDevice: string,
        @Param('id') id: string,
        @Body() updateIncidentTypeDto: UpdateIncidentTypeDto,
    ) {
        return this.incidentTypeService.update(
            userId,
            +id,
            updateIncidentTypeDto,
        );
    }

    /**
     * Deletes an incident type by its identifier.
     *
     * @param user Authenticated user extracted from the Keycloak token.
     * @param userId Identifier of the user performing the operation.
     * @param idDevice Identifier of the device originating the request.
     * @param id Identifier of the incident type to delete.
     * @returns Promise resolving to the result of the delete operation.
     */
    @ApiOperation({ summary: 'Delete an incident type by id' })
    // @Auth()
    @AuthWithKeycloak()
    @Delete('remove/:userId/:idDevice/:id')
    remove(
        @GetUser() user: JwtPayload,
        @Param('userId', ParseIntPipe) userId: number,
        @Param('idDevice', ParseUUIDPipe) idDevice: string,
        @Param('id') id: string,
    ) {
        return this.incidentTypeService.remove(+id);
    }
}
