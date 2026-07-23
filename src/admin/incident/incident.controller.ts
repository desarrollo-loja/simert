import {
    BadRequestException,
    Body,
    Controller,
    Delete,
    Get,
    Param,
    ParseIntPipe,
    ParseUUIDPipe,
    Patch,
    Post,
    Query,
} from '@nestjs/common';
import { UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthWithKeycloak, GetUser } from 'src/auth/decorators';
import { JwtPayload } from 'src/auth/interfaces';
import { FilterDto } from 'src/common/dto/filter.dto';
import { TypeRol } from 'src/common/glob/type/type_rol';

import { CreateIncidentDto } from './dto/create-incident.dto';
import { IncidentDto } from './dto/incident.dto';
import { IncidentFilterDto } from './dto/incident-filterdto.dto';
import { UpdateIncidentDto } from './dto/update-incident.dto';
import { IncidentService } from './incident.service';
/**
 * REST controller for managing parking incidents (sanctions) and their GIM synchronization.
 *
 * Base route: `admin/incident`. Delegates all business logic to {@link IncidentService}.
 */
@ApiTags('Admin - Incident')
@ApiBearerAuth('keycloak')
@Controller('admin/incident')
export class IncidentController {
    /**
     * Creates the controller and injects its dependencies.
     *
     * @param incidentService Service handling incident business logic.
     */
    constructor(private readonly incidentService: IncidentService) {}

    /**
     * Creates a new incident record.
     *
     * @param createIncidentDto Payload describing the incident to create.
     * @returns The created incident.
     */
    @ApiOperation({ summary: 'Create a new incident record' })
    @Post()
    create(@Body() createIncidentDto: CreateIncidentDto) {
        return this.incidentService.create(createIncidentDto);
    }

    /**
     * Lists incidents matching the provided filters (admin role required).
     *
     * @param userId Identifier of the requesting user.
     * @param idDevice Identifier of the requesting device.
     * @param filterDto Filter criteria for the incident query.
     * @returns The list of incidents matching the filters.
     */
    @ApiOperation({
        summary: 'List incidents with filters (admin role required)',
    })
    @AuthWithKeycloak(TypeRol.ADMIN)
    @Patch('find-all/:userId/:idDevice')
    findAll(
        @Param('userId', ParseIntPipe) userId: number,
        @Param('idDevice', ParseUUIDPipe) idDevice: string,
        @Body() filterDto: IncidentFilterDto,
    ) {
        return this.incidentService.findAll(filterDto);
    }

    /**
     * Counts the total number of incidents matching the provided filters (admin role required).
     *
     * @param userId Identifier of the requesting user.
     * @param idDevice Identifier of the requesting device.
     * @param filterDto Filter criteria for the count query.
     * @returns The total number of matching incidents.
     */
    @ApiOperation({
        summary: 'Count total incidents matching filters (admin role required)',
    })
    @AuthWithKeycloak(TypeRol.ADMIN)
    @Patch('find-all-total/:userId/:idDevice')
    findAllTotal(
        @Param('userId', ParseIntPipe) userId: number,
        @Param('idDevice', ParseUUIDPipe) idDevice: string,
        @Body() filterDto: IncidentFilterDto,
    ) {
        return this.incidentService.findAllTotal(filterDto);
    }

    /**
     * Lists incidents filtered by their associated transaction identifiers.
     *
     * @param user Authenticated user extracted from the JWT payload.
     * @param filterDto Filter criteria including the transaction identifiers.
     * @returns The list of incidents matching the transaction filters.
     */
    @ApiOperation({
        summary:
            'List incidents filtered by transactionIds (id, transactionId, statusIncident, onResponseExternal)',
    })
    @AuthWithKeycloak()
    @Patch('find-all-by-transaction-id/:userId/:idDevice/:version')
    findAllByTransactionId(
        @GetUser() user: JwtPayload,
        @Body() filterDto: IncidentFilterDto,
    ) {
        return this.incidentService.findAllByTransactionId(filterDto);
    }

    /**
     * Lists distinct incident clients for combo-box search.
     *
     * @param filterDto Filter criteria for the client search.
     * @param _userId Identifier of the requesting user (unused).
     * @param _idDevice Identifier of the requesting device (unused).
     * @param _version Request version (unused).
     * @returns The list of distinct incident clients.
     */
    @ApiOperation({
        summary:
            'List distinct incident clients for combo search (id: identityCard, text: fullNameClient)',
    })
    @AuthWithKeycloak(TypeRol.ADMIN)
    @Get('find-all-client/:userId/:idDevice/:version')
    findAllClient(
        @Query() filterDto: IncidentFilterDto,
        @Param('userId', ParseIntPipe) _userId: number,
        @Param('idDevice', ParseUUIDPipe) _idDevice: string,
        @Param('version', ParseIntPipe) _version: number,
    ) {
        return this.incidentService.findAllClient(filterDto);
    }

    /**
     * Retrieves a single incident by its identifier.
     *
     * @param id Identifier of the incident to retrieve.
     * @returns The incident matching the given identifier.
     */
    @ApiOperation({ summary: 'Get a single incident by id' })
    @Get(':id')
    findOne(@Param('id') id: string) {
        return this.incidentService.findOne(+id);
    }

    /**
     * Updates an incident, optionally wrapping the operation in a database transaction.
     *
     * @param userId Identifier of the requesting user.
     * @param idDevice Identifier of the requesting device.
     * @param id Identifier of the incident to update.
     * @param isTransacional When 1, the update runs inside a database transaction.
     * @param updateIncidentDto Payload with the incident fields to update.
     * @returns The updated incident.
     */
    @ApiOperation({
        summary:
            'Update an incident (isTransacional=1 wraps in DB transaction)',
    })
    @Patch('update/:userId/:idDevice/:id/:isTransacional')
    update(
        @Param('userId', ParseIntPipe) userId: number,
        @Param('idDevice', ParseUUIDPipe) idDevice: string,
        @Param('id') id: string,
        @Param('isTransacional', ParseIntPipe) isTransacional: number,
        @Body() updateIncidentDto: UpdateIncidentDto,
    ) {
        return this.incidentService.update(
            +id,
            updateIncidentDto,
            isTransacional,
            userId,
        );
    }

    /**
     * Updates the GIM synchronization status of an incident after external emission.
     *
     * @param userId Identifier of the requesting user.
     * @param idDevice Identifier of the requesting device.
     * @param id Identifier of the incident to update.
     * @param updateIncidentDto Payload with the GIM status fields to update.
     * @returns The updated incident.
     */
    @ApiOperation({
        summary: 'Update incident GIM sync status after external emission',
    })
    @Patch('update-status-gim/:userId/:idDevice/:id')
    updateStatusGim(
        @Param('userId', ParseIntPipe) userId: number,
        @Param('idDevice', ParseUUIDPipe) idDevice: string,
        @Param('id') id: string,
        @Body() updateIncidentDto: UpdateIncidentDto,
    ) {
        return this.incidentService.updateStatusGim(
            +id,
            updateIncidentDto,
            userId,
        );
    }

    /**
     * Uploads an incident evidence file to Alfresco.
     *
     * @param userId Identifier of the requesting user.
     * @param idDevice Identifier of the requesting device.
     * @param file Multipart file sent under the form-data key `file`.
     * @returns The Alfresco upload result for the stored file.
     * @throws BadRequestException When no file is provided in the request.
     */
    @ApiOperation({
        summary:
            'Upload an incident evidence file to Alfresco (multipart form-data, key: file)',
    })
    @Post('upload-alfresco/:userId/:idDevice')
    @UseInterceptors(FileInterceptor('file')) // form-data field name must match 'file'
    uploadAlfresco(
        @Param('userId', ParseIntPipe) userId: number,
        @Param('idDevice', ParseUUIDPipe) idDevice: string,
        @UploadedFile() file: any,
    ) {
        if (!file) {
            throw new BadRequestException(
                'Debe enviar el archivo en form-data con key: file',
            );
        }

        // Multer always populates these properties on UploadedFile.
        const { buffer, originalname } = file;

        return this.incidentService.uploadToAlfresco(buffer, originalname);
    }

    /**
     * Builds a download URL for an Alfresco-stored file.
     *
     * @param userId Identifier of the requesting user.
     * @param idDevice Identifier of the requesting device.
     * @param alfrescoId Identifier of the Alfresco file.
     * @returns The download URL for the requested file.
     * @throws BadRequestException When no `alfrescoId` is provided.
     */
    @ApiOperation({
        summary: 'Get a download URL for an Alfresco-stored file by alfrescoId',
    })
    @Get('get-file-url-alfresco/:userId/:idDevice/:alfrescoId')
    getFileUrlAlfresco(
        @Param('userId', ParseIntPipe) userId: number,
        @Param('idDevice', ParseUUIDPipe) idDevice: string,
        @Param('alfrescoId') alfrescoId: string,
    ) {
        if (!alfrescoId) {
            throw new BadRequestException('Debe enviar el alfrescoId');
        }

        return this.incidentService.getFileUrlAlfresco(alfrescoId);
    }

    /**
     * Resolves the Alfresco nodeId from a stored shared-link URL or raw sharedId.
     *
     * @param userId Identifier of the requesting user.
     * @param idDevice Identifier of the requesting device.
     * @param sharedUrl Shared-link URL or raw sharedId to resolve.
     * @returns The resolved Alfresco nodeId.
     * @throws BadRequestException When no `sharedUrl` query string is provided.
     */
    @ApiOperation({
        summary:
            'Resolve the Alfresco nodeId from a stored shared-link URL (or raw sharedId)',
    })
    @Get('get-alfresco-id-by-shared/:userId/:idDevice')
    getAlfrescoIdBySharedUrl(
        @Param('userId', ParseIntPipe) userId: number,
        @Param('idDevice', ParseUUIDPipe) idDevice: string,
        @Query('sharedUrl') sharedUrl: string,
    ) {
        if (!sharedUrl) {
            throw new BadRequestException(
                'Debe enviar sharedUrl como query string',
            );
        }

        return this.incidentService.getAlfrescoIdBySharedUrl(sharedUrl);
    }

    /**
     * Deletes an incident by its identifier.
     *
     * @param user Authenticated user extracted from the JWT payload.
     * @param userId Identifier of the requesting user.
     * @param idDevice Identifier of the requesting device.
     * @param id Identifier of the incident to delete.
     * @returns The result of the delete operation.
     */
    @ApiOperation({ summary: 'Delete an incident by id' })
    @AuthWithKeycloak()
    @Delete('remove/:userId/:idDevice/:id')
    remove(
        @GetUser() user: JwtPayload,
        @Param('userId', ParseIntPipe) userId: number,
        @Param('idDevice', ParseUUIDPipe) idDevice: string,
        @Param('id') id: string,
    ) {
        return this.incidentService.remove(+id, userId);
    }

    /**
     * Aggregates incident statistics by date range and filters.
     *
     * @param filterDto Filter criteria including the date range.
     * @param _userId Identifier of the requesting user (unused).
     * @param _idDevice Identifier of the requesting device (unused).
     * @param _version Request version (unused).
     * @returns The aggregated incident statistics.
     */
    @ApiOperation({
        summary: 'Aggregate incident statistics by date range and filters',
    })
    @AuthWithKeycloak()
    @Get('find-statistics/:userId/:idDevice/:version')
    findStatistics(
        @Query() filterDto: FilterDto,
        @Param('userId', ParseIntPipe) _userId: number,
        @Param('idDevice', ParseUUIDPipe) _idDevice: string,
        @Param('version', ParseIntPipe) _version: number,
    ) {
        return this.incidentService.findStatistics(filterDto);
    }

    /**
     * Lists fractions that have sanctions, applying optional filters.
     *
     * @param filterDto Filter criteria for the fraction-sanction query.
     * @param _userId Identifier of the requesting user (unused).
     * @param _idDevice Identifier of the requesting device (unused).
     * @param _version Request version (unused).
     * @returns The list of fractions that have sanctions.
     */
    @ApiOperation({
        summary: 'List fractions that have sanctions, with optional filters',
    })
    @Get('find-all-fraction-sanction/:userId/:idDevice/:version')
    findAllFractionSanction(
        @Query() filterDto: IncidentFilterDto,
        @Param('userId', ParseIntPipe) _userId: number,
        @Param('idDevice', ParseUUIDPipe) _idDevice: string,
        @Param('version', ParseIntPipe) _version: number,
    ) {
        return this.incidentService.findAllFractionSanction(filterDto);
    }

    /**
     * Counts the total number of fractions with sanctions matching the filters.
     *
     * @param filterDto Filter criteria for the count query.
     * @param _userId Identifier of the requesting user (unused).
     * @param _idDevice Identifier of the requesting device (unused).
     * @param _version Request version (unused).
     * @returns The total number of matching fractions with sanctions.
     */
    @ApiOperation({
        summary: 'Count total fractions with sanctions matching filters',
    })
    @AuthWithKeycloak()
    @Get('find-all-fraction-sanction-total/:userId/:idDevice/:version')
    findAllFractionSanctionTotal(
        @Query() filterDto: IncidentFilterDto,
        @Param('userId', ParseIntPipe) _userId: number,
        @Param('idDevice', ParseUUIDPipe) _idDevice: string,
        @Param('version', ParseIntPipe) _version: number,
    ) {
        return this.incidentService.findAllFractionSanctionTotal(filterDto);
    }

    /**
     * Retrieves incident statistics grouped by fraction.
     *
     * @param filterDto Filter criteria for the statistics query.
     * @param _userId Identifier of the requesting user (unused).
     * @param _idDevice Identifier of the requesting device (unused).
     * @param _version Request version (unused).
     * @returns The incident statistics grouped by fraction.
     */
    @ApiOperation({ summary: 'Incident statistics grouped by fraction' })
    @AuthWithKeycloak()
    @Get('find-statistics-by-fraction/:userId/:idDevice/:version')
    findStatisticsByFraction(
        @Query() filterDto: FilterDto,
        @Param('userId', ParseIntPipe) _userId: number,
        @Param('idDevice', ParseUUIDPipe) _idDevice: string,
        @Param('version', ParseIntPipe) _version: number,
    ) {
        return this.incidentService.findStatisticsByFraction(filterDto);
    }

    /**
     * Aggregates the total parking time per vehicle/client from incident data.
     *
     * @param filterDto Filter criteria for the aggregation query.
     * @param _userId Identifier of the requesting user (unused).
     * @param _idDevice Identifier of the requesting device (unused).
     * @param _version Request version (unused).
     * @returns The aggregated total parking time per vehicle/client.
     */
    @ApiOperation({
        summary:
            'Aggregate total parking time per vehicle/client from incident data',
    })
    @Get('find-all-total-vehicle-client-time/:userId/:idDevice/:version')
    findAllTotalVehicleClientTime(
        @Query() filterDto: IncidentFilterDto,
        @Param('userId', ParseIntPipe) _userId: number,
        @Param('idDevice', ParseUUIDPipe) _idDevice: string,
        @Param('version', ParseIntPipe) _version: number,
    ) {
        return this.incidentService.findAllTotalVehicleClientTime(filterDto);
    }

    /**
     * Retrieves full statistics combining fraction and sanction data.
     *
     * @param filterDto Filter criteria for the statistics query.
     * @param _userId Identifier of the requesting user (unused).
     * @param _idDevice Identifier of the requesting device (unused).
     * @param _version Request version (unused).
     * @returns The combined fraction and sanction statistics.
     */
    @ApiOperation({
        summary: 'Full statistics combining fraction and sanction data',
    })
    @AuthWithKeycloak()
    @Get('find-all-statistics-fraction-sanction/:userId/:idDevice/:version')
    findAllStatisticsFractionSanction(
        @Query() filterDto: IncidentFilterDto,
        @Param('userId', ParseIntPipe) _userId: number,
        @Param('idDevice', ParseUUIDPipe) _idDevice: string,
        @Param('version', ParseIntPipe) _version: number,
    ) {
        return this.incidentService.findAllStatisticsFractionSanction(
            filterDto,
        );
    }

    /**
     * Finds pending incidents and synchronizes/emits them to GIM.
     *
     * @param user Authenticated user extracted from the JWT payload.
     * @param userId Identifier of the requesting user.
     * @param idDevice Identifier of the requesting device.
     * @param isTransacional When 1, the operation runs inside a database transaction.
     * @param version Request version.
     * @param filterDto Filter criteria used to select pending incidents.
     * @returns The result of the synchronize/emit operation.
     */
    @ApiOperation({
        summary: 'Find pending incidents and synchronize/emit them to GIM',
    })
    @AuthWithKeycloak()
    @Patch(
        'find-and-sincronize-to-emit/:userId/:idDevice/:isTransacional/:version',
    )
    findAndSincronizeToEmit(
        @GetUser() user: JwtPayload,
        @Param('userId', ParseIntPipe) userId: number,
        @Param('idDevice', ParseUUIDPipe) idDevice: string,
        @Param('isTransacional', ParseIntPipe) isTransacional: number,
        @Param('version', ParseIntPipe) version: number,
        @Body() filterDto: IncidentFilterDto,
    ) {
        return this.incidentService.findAndSincronizeToEmit(
            userId,
            idDevice,
            filterDto,
            isTransacional,
        );
    }

    /**
     * Lists incident notifications, applying optional filters.
     *
     * @param userId Identifier of the requesting user.
     * @param idDevice Identifier of the requesting device.
     * @param version Request version.
     * @param filterDto Filter criteria for the notification query.
     * @returns The list of incident notifications.
     */
    @ApiOperation({
        summary: 'List incident notifications with optional filters',
    })
    @Get('find-all-notification/:userId/:idDevice/:version')
    findAllNotification(
        @Param('userId', ParseIntPipe) userId: number,
        @Param('idDevice', ParseUUIDPipe) idDevice: string,
        @Param('version', ParseIntPipe) version: number,
        @Query() filterDto: IncidentFilterDto,
    ) {
        return this.incidentService.findAllNotification(filterDto);
    }

    /**
     * Advances an incident to the next workflow step.
     *
     * @param user Authenticated user extracted from the JWT payload.
     * @param userId Identifier of the requesting user.
     * @param idDevice Identifier of the requesting device.
     * @param isTransacional When 1, the operation runs inside a database transaction.
     * @param version Request version.
     * @param incidentDto Payload describing the incident to advance.
     * @returns The result of advancing the incident.
     */
    @ApiOperation({
        summary:
            'Advance incident to next workflow step (isTransacional=1 for transactional mode)',
    })
    @AuthWithKeycloak()
    @Patch('advance-next-process/:userId/:idDevice/:isTransacional/:version')
    advanceNextProcess(
        @GetUser() user: JwtPayload,
        @Param('userId', ParseIntPipe) userId: number,
        @Param('idDevice', ParseUUIDPipe) idDevice: string,
        @Param('isTransacional', ParseIntPipe) isTransacional: number,
        @Param('version', ParseIntPipe) version: number,
        @Body() incidentDto: IncidentDto,
    ) {
        return this.incidentService.advanceNextProcess(
            userId,
            idDevice,
            incidentDto,
            isTransacional,
        );
    }
}
