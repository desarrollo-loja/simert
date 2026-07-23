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

import { CheckboxService } from './checkbox.service';
/**
 * REST controller for querying checkbox balance records.
 *
 * Base route: `admin/checkbox`. Delegates all business logic to {@link CheckboxService}.
 */
@ApiTags('Admin - Checkbox')
@ApiBearerAuth('keycloak')
@Controller('admin/checkbox')
export class CheckboxController {
    /**
     * Creates the controller and injects its dependencies.
     *
     * @param checkboxService Service that handles checkbox balance queries and updates.
     */
    constructor(private readonly checkboxService: CheckboxService) {}

    /**
     * Lists all checkbox balance records, applying the optional query filters.
     *
     * @param user Authenticated user extracted from the Keycloak token.
     * @param userId Numeric identifier of the user that owns the checkboxes.
     * @param idDevice UUID of the device associated with the request.
     * @param version Numeric version supplied by the client.
     * @param filterDto Query filters used to narrow down the results.
     * @returns Promise resolving to the list of matching checkbox records.
     */
    @ApiOperation({
        summary: 'List all checkboxes with optional filters (admin)',
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
        return this.checkboxService.findAll(filterDto);
    }

    /**
     * Lists checkboxes filtered by the transaction identifiers provided in the body.
     *
     * @param user Authenticated user extracted from the Keycloak token.
     * @param filterDto Filter payload containing the transaction identifiers and fields to match.
     * @returns Promise resolving to the list of matching checkbox records.
     */
    @ApiOperation({
        summary:
            'List checkboxes filtered by transactionIds (id, transactionId, statusIncident, onResponseExternal)',
    })
    @AuthWithKeycloak()
    @Patch('find-all-by-transaction-id/:userId/:idDevice/:version')
    findAllByTransactionId(
        @GetUser() user: JwtPayload,
        @Body() filterDto: FilterDto,
    ) {
        return this.checkboxService.findAllByTransactionId(filterDto);
    }

    // ─── Internal endpoints consumed by CommonCheckboxService ─────────────

    /**
     * Returns paid checkboxes whose statusIncident is NULL.
     *
     * @returns Promise resolving to the list of paid checkboxes without a linked incident.
     */
    @ApiOperation({
        summary:
            'List paid checkboxes with no linked incident (statusIncident = NULL)',
    })
    /**
     * Returns PAID checkboxes whose statusIncident is NULL.
     * GET /admin/checkbox/common/paid-without-incident
     */
    @Get('common/paid-without-incident')
    findPaidWithoutIncident() {
        return this.checkboxService.findPaidWithoutIncident();
    }

    /**
     * Returns paid checkboxes with a statusIncident pending in GIM.
     *
     * @returns Promise resolving to the list of paid checkboxes with a pending incident.
     */
    @ApiOperation({
        summary: 'List paid checkboxes with a pending GIM incident status',
    })
    /**
     * Returns PAID checkboxes with a statusIncident pending in GIM.
     * GET /admin/checkbox/common/paid-pending-incident
     */
    @Get('common/paid-pending-incident')
    findPaidWithPendingIncident() {
        return this.checkboxService.findPaidWithPendingIncident();
    }

    /**
     * Performs a partial update of a checkbox identified by its id.
     *
     * @param id Numeric identifier of the checkbox to update.
     * @param fields Partial checkbox object with the fields to update (excluding `id`).
     * @returns Promise resolving to the updated checkbox.
     */
    @ApiOperation({
        summary:
            'Update a checkbox by id (partial update, any field except id)',
    })
    /**
     * Updates a checkbox by its id.
     * PATCH /admin/checkbox/common/update/:id
     * Body: partial Checkbox object (without 'id').
     */
    @Patch('common/update/:id')
    updateCheckboxById(
        @Param('id', ParseIntPipe) id: number,
        @Body() fields: Record<string, any>,
    ) {
        return this.checkboxService.updateCheckboxById(id, fields);
    }

    /**
     * Transfers a checkbox record to its corresponding history table.
     *
     * @param id Numeric identifier of the checkbox to move to history.
     * @returns Promise resolving once the checkbox has been moved to history.
     */
    @ApiOperation({ summary: 'Move a checkbox record to its history table' })
    /**
     * Transfers a checkbox to the corresponding historical table.
     * POST /admin/checkbox/common/move-to-history/:id
     */
    @Post('common/move-to-history/:id')
    moveCheckboxToHistory(@Param('id', ParseIntPipe) id: number) {
        return this.checkboxService.moveCheckboxToHistory(id);
    }
}
