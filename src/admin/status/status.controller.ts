import { Controller, Get, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { StatusService } from './status.service';
/**
 * REST controller for managing fraction status definitions.
 *
 * Base route: `admin/status`. Delegates all business logic to {@link StatusService}.
 */
@ApiTags('Admin - Status')
@ApiBearerAuth('keycloak')
@Controller('admin/status')
export class StatusController {
    /**
     * Creates the controller and injects its delegated service.
     *
     * @param statusService Service handling fraction status operations.
     */
    constructor(private readonly statusService: StatusService) {}

    /**
     * Seeds the database with the initial set of fraction statuses.
     *
     * @returns Promise resolving once the initial fraction statuses are seeded.
     */
    @ApiOperation({
        summary: 'Seed initial fraction statuses (internal use only)',
    })
    @Post('initializeDatabase')
    initializeDatabase() {
        return this.statusService.initializeDatabase();
    }

    /**
     * Lists fraction statuses, optionally narrowed by filters.
     *
     * @returns Promise resolving to the list of fraction statuses.
     */
    @ApiOperation({ summary: 'List fraction statuses with optional filters' })
    @Get('filter')
    findAllByfilter() {
        return this.statusService.findAllByfilter();
    }
}
