import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiStandardResponse } from 'src/common/decorators/api-standard-response.decorator';
import { ErrorCode } from 'src/common/glob/error';

import { AntService } from './ant.service';
/**
 * REST controller exposing ANT (Agencia Nacional de Tránsito) vehicle lookups.
 *
 * Base route: `api/ant`. Delegates all business logic to {@link AntService}.
 */
@ApiTags('Api - Ant')
@ApiBearerAuth('keycloak')
@Controller('api/ant')
export class AntController {
  /**
   * Creates the controller with its delegated ANT service.
   *
   * @param antService Service that performs ANT vehicle lookups.
   */
  constructor(private readonly antService: AntService) {}

  /**
   * Returns a simulated list of ANT records for development purposes.
   *
   * @returns Promise resolving to the simulated ANT records.
   */
  @ApiOperation({
    summary: 'Sample mock list of ANT entries (simulation only)',
  })
  @ApiStandardResponse({
    description: 'Simulated ANT records',
    errorCodes: [ErrorCode.NONE, ErrorCode.UNKNOWN],
    data: {
      data: {
        isArray: true,
        type: 'object',
        example: [
          { id: 1, name: 'Simulación ANT 1', status: 'Active' },
          { id: 2, name: 'Simulación ANT 2', status: 'Inactive' },
        ],
      },
    },
  })
  @Get()
  findAll() {
    return this.antService.findAll();
  }

  /**
   * Looks up vehicle owner data by plate through the ANT SOAP service.
   *
   * @param userId Identifier of the requesting user.
   * @param idDevice Identifier of the requesting device.
   * @param applicationId Identifier of the requesting application.
   * @param plate Vehicle plate number to query.
   * @returns Promise resolving to the ANT owner data or a not-found result.
   */
  @ApiOperation({
    summary: 'Look up vehicle owner data by plate via ANT SOAP service',
  })
  @ApiStandardResponse({
    description:
      'Owner data from ANT (fullName, identityCard, email, firstName, lastName)',
    errorCodes: [ErrorCode.NONE, ErrorCode.NOT_FOUND],
    data: {
      data: {
        type: 'object',
        nullable: true,
        example: {
          fullName: 'JUAN PEREZ LOPEZ',
          identityCard: '1104187768',
          email: 'juan@example.com',
          firstName: 'JUAN',
          lastName: 'PEREZ LOPEZ',
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
    return this.antService.getUserDataByPlateAnt(plate);
  }
}
