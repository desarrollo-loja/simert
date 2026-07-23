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
    Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthWithKeycloak } from 'src/auth/decorators';
import { FilterDto } from 'src/common/dto/filter.dto';
import { TypeRol } from 'src/common/glob/type/type_rol';

import { CheckboxUserService } from './checkbox-user.service';
import { CreateCheckboxUserDto } from './dto/create-checkbox-user.dto';
import { UpdateCheckboxUserDto } from './dto/update-checkbox-user.dto';

/**
 * REST controller for managing checkbox-user balance associations and the
 * digital-consumption report ("Consumo Digital").
 *
 * Base route: `admin/checkbox-user`.
 */
@ApiTags('Admin - Checkbox User')
@ApiBearerAuth('keycloak')
@Controller('admin/checkbox-user')
export class CheckboxUserController {
    /**
     * Creates the controller and injects its delegate service.
     * @param checkboxUserService Service that handles checkbox-user persistence and reporting.
     */
    constructor(private readonly checkboxUserService: CheckboxUserService) {}

    /**
     * Returns the digital-consumption report (balance, top-ups and consumption per user).
     * @param _userId Authenticated user identifier from the route (unused in delegation).
     * @param _idDevice Device UUID from the route (unused in delegation).
     * @param _version Client version from the route (unused in delegation).
     * @param filterDto Pagination and filtering criteria for the report.
     * @returns Promise resolving to the digital-consumption report rows.
     */
    @ApiOperation({
        summary:
            'Digital consumption report: balance, top-ups and consumption per user',
    })
    @AuthWithKeycloak(TypeRol.ADMIN)
    @Get('report/:userId/:idDevice/:version')
    findReport(
        @Param('userId', ParseIntPipe) _userId: number,
        @Param('idDevice', ParseUUIDPipe) _idDevice: string,
        @Param('version', ParseIntPipe) _version: number,
        @Query() filterDto: FilterDto,
    ) {
        return this.checkboxUserService.findReport(filterDto);
    }

    /**
     * Returns the total number of rows for the digital-consumption report (used for pagination).
     * @param _userId Authenticated user identifier from the route (unused in delegation).
     * @param _idDevice Device UUID from the route (unused in delegation).
     * @param _version Client version from the route (unused in delegation).
     * @param filterDto Filtering criteria applied to the row count.
     * @returns Promise resolving to the total row count of the report.
     */
    @ApiOperation({
        summary: 'Total rows of the digital-consumption report (pagination)',
    })
    @AuthWithKeycloak(TypeRol.ADMIN)
    @Get('report/total/:userId/:idDevice/:version')
    findReportTotal(
        @Param('userId', ParseIntPipe) _userId: number,
        @Param('idDevice', ParseUUIDPipe) _idDevice: string,
        @Param('version', ParseIntPipe) _version: number,
        @Query() filterDto: FilterDto,
    ) {
        return this.checkboxUserService.findReportTotal(filterDto);
    }

    /**
     * Creates a new checkbox-user association.
     * @param createCheckboxUserDto Payload describing the association to create.
     * @returns Promise resolving to the created checkbox-user association.
     */
    @ApiOperation({ summary: 'Create a new checkbox-user association' })
    @Post()
    create(@Body() createCheckboxUserDto: CreateCheckboxUserDto) {
        return this.checkboxUserService.create(createCheckboxUserDto);
    }

    /**
     * Retrieves all checkbox-user associations.
     * @returns Promise resolving to the list of checkbox-user associations.
     */
    @ApiOperation({ summary: 'List all checkbox-user associations' })
    @Get()
    findAll() {
        return this.checkboxUserService.findAll();
    }

    /**
     * Retrieves a single checkbox-user association by its identifier.
     * @param id Identifier of the checkbox-user association to retrieve.
     * @returns Promise resolving to the matching checkbox-user association.
     */
    @ApiOperation({ summary: 'Get a single checkbox-user association by id' })
    @Get(':id')
    findOne(@Param('id') id: string) {
        return this.checkboxUserService.findOne(+id);
    }

    /**
     * Updates an existing checkbox-user association by its identifier.
     * @param id Identifier of the checkbox-user association to update.
     * @param updateCheckboxUserDto Payload with the fields to update.
     * @returns Promise resolving to the updated checkbox-user association.
     */
    @ApiOperation({ summary: 'Update a checkbox-user association by id' })
    @Patch(':id')
    update(
        @Param('id') id: string,
        @Body() updateCheckboxUserDto: UpdateCheckboxUserDto,
    ) {
        return this.checkboxUserService.update(+id, updateCheckboxUserDto);
    }

    /**
     * Deletes a checkbox-user association by its identifier.
     * @param id Identifier of the checkbox-user association to delete.
     * @returns Promise resolving to the result of the deletion.
     */
    @ApiOperation({ summary: 'Delete a checkbox-user association by id' })
    @Delete(':id')
    remove(@Param('id') id: string) {
        return this.checkboxUserService.remove(+id);
    }
}
