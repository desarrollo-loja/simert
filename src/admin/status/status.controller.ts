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
   *
   * @param statusService
   */
  constructor(private readonly statusService: StatusService) {}

  /**
   *
   */
  @ApiOperation({
    summary: 'Seed initial fraction statuses (internal use only)',
  })
  @Post('initializeDatabase')
  initializeDatabase() {
    return this.statusService.initializeDatabase();
  }

  /**
   *
   */
  @ApiOperation({ summary: 'List fraction statuses with optional filters' })
  @Get('filter')
  findAllByfilter() {
    return this.statusService.findAllByfilter();
  }
}
