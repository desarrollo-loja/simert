import {
    Controller,
    Get,
    Param,
    ParseIntPipe,
    ParseUUIDPipe,
    Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiStandardResponse } from 'src/common/decorators/api-standard-response.decorator';
import { FilterDto } from 'src/common/dto/filter.dto';
import { ErrorCode } from 'src/common/glob/error';

import { SalePointService } from './sale-point.service';
/**
 * REST controller listing fixed and mobile sale points for the client app.
 *
 * Base route: `client/sale-point`. Delegates all business logic to {@link SalePointService}.
 */
@ApiTags('Client - Sale Point')
@ApiBearerAuth('keycloak')
@Controller('client/sale-point')
export class SalePointController {
    /**
     * @param salePointService Service that resolves sale point records.
     */
    constructor(private readonly salePointService: SalePointService) {}

    // @Auth(TypeRol.ADMIN)
    /**
     * Lists active sale points operating in FIXED mode.
     * @param userId Identifier of the requesting user.
     * @param idDevice Device UUID issuing the request.
     * @param version Client application version.
     * @param filterDto Pagination and filtering options.
     * @returns Promise resolving to the active fixed-mode sale points.
     */
    @ApiOperation({ summary: 'List active sale points in FIXED mode' })
    @ApiStandardResponse({
        description: 'Active fixed-mode sale points list',
        errorCodes: [ErrorCode.NONE],
        data: {
            salePoints: {
                isArray: true,
                type: 'object',
                example: [
                    {
                        id: 1,
                        mode: 1,
                        lt: -3.99,
                        lg: -79.2,
                        title: 'Main Office',
                        subTitle: 'Central',
                        userId: 10,
                    },
                ],
            },
        },
    })
    @Get('active-mode-fixed/:userId/:idDevice/:version')
    findAllActiveModeFixed(
        @Param('userId', ParseIntPipe) userId: number,
        @Param('idDevice', ParseUUIDPipe) idDevice: string,
        @Param('version', ParseIntPipe) version: number,
        @Query() filterDto: FilterDto,
    ) {
        return this.salePointService.findAllActiveModeFixed(filterDto);
    }

    // @Auth(TypeRol.ADMIN)
    /**
     * Lists active sale points operating in MOBILE mode, joined with their live location.
     * @param userId Identifier of the requesting user.
     * @param idDevice Device UUID issuing the request.
     * @param version Client application version.
     * @param filterDto Pagination and filtering options.
     * @returns Promise resolving to the active mobile-mode sale points with current location.
     */
    @ApiOperation({
        summary: 'List active sale points in MOBILE mode with live location',
    })
    @ApiStandardResponse({
        description:
            'Active mobile-mode sale points joined with current location',
        errorCodes: [ErrorCode.NONE],
        data: {
            salePoints: {
                isArray: true,
                type: 'object',
                example: [
                    {
                        id: 1,
                        mode: 2,
                        lt: -3.99,
                        lg: -79.2,
                        title: 'Mobile Agent',
                        subTitle: 'Zone A',
                        userId: 11,
                    },
                ],
            },
        },
    })
    @Get('active-mode-mobile/:userId/:idDevice/:version')
    findAllActiveModeMobile(
        @Param('userId', ParseIntPipe) userId: number,
        @Param('idDevice', ParseUUIDPipe) idDevice: string,
        @Param('version', ParseIntPipe) version: number,
        @Query() filterDto: FilterDto,
    ) {
        return this.salePointService.findAllActiveModeMobile(filterDto);
    }
}
