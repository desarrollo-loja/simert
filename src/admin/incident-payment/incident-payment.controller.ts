import { Body, Controller, Patch } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthWithKeycloak, GetUser } from 'src/auth/decorators';
import { JwtPayload } from 'src/auth/interfaces';
import { FilterDto } from 'src/common/dto/filter.dto';
import { TypeRol } from 'src/common/glob/type/type_rol';

import { IncidentPaymentService } from './incident-payment.service';
@ApiTags('Admin - Incident Payment')
@ApiBearerAuth('keycloak')
@Controller('admin/incident-payment')
export class IncidentPaymentController {
  constructor(private readonly incidentPaymentService: IncidentPaymentService) { }

  @ApiOperation({ summary: 'List incident payments filtered by transactionIds (id, transactionId, optionalData)' })
  @AuthWithKeycloak(TypeRol.ADMIN)
  @Patch('find-all-by-transaction-id/:userId/:idDevice/:version')
  findAllByTransactionId(
    @GetUser() user: JwtPayload,
    @Body() filterDto: FilterDto
  ) {
    return this.incidentPaymentService.findAllByTransactionId(filterDto);
  }
}
