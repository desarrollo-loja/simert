import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiStandardResponse } from 'src/common/decorators/api-standard-response.decorator';
import { ErrorCode } from 'src/common/glob/error';

import { DinardapAntService } from './dinardap-ant.service';
/**
 * REST controller exposing DINARDAP ANT vehicle owner and vehicle data lookups by plate.
 *
 * Base route: `api/dinardap-ant`. Delegates all business logic to {@link DinardapAntService}.
 */
@ApiTags('Api - Dinardap Ant')
@ApiBearerAuth('keycloak')
@Controller('api/dinardap-ant')
export class DinardapAntController {
    /**
     * @param dinardapAntService Service that performs DINARDAP ANT data lookups.
     */
    constructor(private readonly dinardapAntService: DinardapAntService) {}

    /**
     * Looks up vehicle owner and vehicle data by plate via the DINARDAP ANT service.
     *
     * @param userId        ID of the authenticated user performing the lookup.
     * @param idDevice      Identifier of the requesting device.
     * @param applicationId Identifier of the calling application.
     * @param plate         Vehicle plate to look up.
     * @returns Promise resolving to the owner and vehicle data for the given plate.
     */
    @ApiOperation({
        summary:
            'Look up vehicle owner + vehicle data by plate via DINARDAP ANT REST service',
    })
    @ApiStandardResponse({
        description: 'Owner and vehicle data from DINARDAP ANT',
        errorCodes: [ErrorCode.NONE, ErrorCode.NOT_FOUND],
        data: {
            data: {
                type: 'object',
                nullable: true,
                example: {
                    fullName: 'PEREZ LOPEZ JUAN',
                    firstName: 'JUAN',
                    lastName: 'PEREZ LOPEZ',
                    identityCard: '1104187768',
                    email: 'juan@example.com',
                    phone: '0939700013',
                    address: 'Av. Universitaria',
                    brand: 'CHEVROLET',
                    model: 'SAIL',
                    year: '2018',
                    color: 'BLANCO',
                    chassis: '9GAJM69408B000000',
                    motor: 'LDE1234567',
                    vehicleType: 'AUTOMOVIL',
                    serviceType: 'PARTICULAR',
                    fuelType: 'GASOLINA',
                    passengers: '5',
                    matriculaYear: '2024',
                    matriculaDate: '2024-01-15',
                    expirationDate: '2025-01-15',
                },
            },
            message: {
                type: 'string',
                example: 'No se encontró información del vehículo',
            },
        },
    })
    @Get('get-user-data-by-plate-ant/:userId/:idDevice/:applicationId')
    async getUserDataByPlateAnt(
        @Param('userId') userId: string,
        @Param('idDevice') idDevice: string,
        @Param('applicationId') applicationId: string,
        @Query('plate') plate: string,
    ) {
        return this.dinardapAntService.getUserDataByPlateAnt(plate);
    }
}
