import {
    Body,
    Controller,
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

import { CreateScheduleDto } from './dto/create-schedule.dto';
import { UpdateScheduleDto } from './dto/update-schedule.dto';
import { ScheduleService } from './schedule.service';
/**
 * REST controller for managing parking schedules associated with blocks.
 *
 * Base route: `admin/schedule`. Delegates all business logic to {@link ScheduleService}.
 */
@ApiTags('Admin - Schedule')
@ApiBearerAuth('keycloak')
@Controller('admin/schedule')
export class ScheduleController {
    /**
     * Creates a new schedule controller instance.
     *
     * @param scheduleService Service that handles schedule business logic.
     */
    constructor(private readonly scheduleService: ScheduleService) {}

    /**
     * Creates a new parking schedule for a block.
     *
     * @param user Authenticated user payload extracted from the Keycloak token.
     * @param userId Identifier of the user performing the operation.
     * @param idDevice Identifier of the device originating the request.
     * @param version Application version of the requesting client.
     * @param createScheduleDto Payload describing the schedule to create.
     * @returns Promise resolving to the created schedule.
     */
    @ApiOperation({ summary: 'Create a new parking schedule for a block' })
    // @Auth()
    @AuthWithKeycloak()
    @Post(':userId/:idDevice/:version')
    create(
        @GetUser() user: JwtPayload,
        @Param('userId', ParseIntPipe) userId: number,
        @Param('idDevice', ParseUUIDPipe) idDevice: string,
        @Param('version', ParseIntPipe) version: number,
        @Body() createScheduleDto: CreateScheduleDto,
    ) {
        return this.scheduleService.create(userId, createScheduleDto);
    }

    /**
     * Lists all schedules associated with a given block.
     *
     * @param user Authenticated user payload extracted from the Keycloak token.
     * @param id Identifier of the block whose schedules are retrieved.
     * @returns Promise resolving to the schedules for the block.
     */
    @ApiOperation({ summary: 'List all schedules for a given block id' })
    // @Auth()
    @AuthWithKeycloak()
    @Get('by-block/:id/:userId/:idDevice/:version')
    findAllScheduleByBlock(
        @GetUser() user: JwtPayload,
        @Param('id', ParseIntPipe) id: number,
    ) {
        return this.scheduleService.findAllScheduleByBlock(id);
    }

    /**
     * Activates or deactivates a schedule by its identifier.
     *
     * @param user Authenticated user payload extracted from the Keycloak token.
     * @param id Identifier of the schedule to activate or deactivate.
     * @param userId Identifier of the user performing the operation.
     * @param idDevice Identifier of the device originating the request.
     * @param version Application version of the requesting client.
     * @param updateScheduleDto Payload describing the active state to apply.
     * @returns Promise resolving to the updated schedule.
     */
    @ApiOperation({ summary: 'Activate or deactivate a schedule by id' })
    // @Auth()
    @AuthWithKeycloak()
    @Patch('active/:id/:userId/:idDevice/:version')
    updateActive(
        @GetUser() user: JwtPayload,
        @Param('id', ParseIntPipe) id: number,
        @Param('userId', ParseIntPipe) userId: number,
        @Param('idDevice', ParseUUIDPipe) idDevice: string,
        @Param('version', ParseIntPipe) version: number,
        @Body() updateScheduleDto: UpdateScheduleDto,
    ) {
        return this.scheduleService.updateActive(userId, id, updateScheduleDto);
    }

    /**
     * Updates schedule properties such as time ranges and days.
     *
     * @param user Authenticated user payload extracted from the Keycloak token.
     * @param userId Identifier of the user performing the operation.
     * @param idDevice Identifier of the device originating the request.
     * @param version Application version of the requesting client.
     * @param updateScheduleDto Payload describing the schedule properties to update.
     * @returns Promise resolving to the updated schedule.
     */
    @ApiOperation({
        summary: 'Update schedule properties (time ranges, days, etc.)',
    })
    // @Auth()
    @AuthWithKeycloak()
    @Patch(':userId/:idDevice/:version')
    update(
        @GetUser() user: JwtPayload,
        @Param('userId', ParseIntPipe) userId: number,
        @Param('idDevice', ParseUUIDPipe) idDevice: string,
        @Param('version', ParseIntPipe) version: number,
        @Body() updateScheduleDto: UpdateScheduleDto,
    ) {
        return this.scheduleService.update(userId, updateScheduleDto);
    }
}
