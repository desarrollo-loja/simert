import { Body, Controller, Delete, Get, Param, ParseIntPipe, ParseUUIDPipe, Patch, Post, Query, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Incident } from 'src/admin/incident/entities/incident.entity';
import { IncidentPayment } from 'src/admin/incident-payment/entities/incident-payment.entity';
import { AuthWithKeycloak, GetUser } from 'src/auth/decorators';
import { JwtPayload } from 'src/auth/interfaces';
import { ApiStandardResponse } from 'src/common/decorators/api-standard-response.decorator';
import { ErrorCode } from 'src/common/glob/error';

import { GetIncidentDto } from './dto/get-incident.dto';
import { PayIncidentDto } from './dto/pay-incident.dto';
import { IncidentService } from './incident.service';

/**
 * REST controller for client-facing incident (fine) lookup and payment.
 *
 * Base route: `client/incident`. Delegates all business logic to {@link IncidentService}.
 */
@ApiTags('Client - Incident')
@ApiBearerAuth('keycloak')
@Controller('client/incident')
export class IncidentController {
  constructor(private readonly incidentService: IncidentService) { }

  @ApiOperation({ summary: 'Check outstanding fines by plate or identity card (external GIM)' })
  @ApiStandardResponse({
    description: 'Outstanding fines summary',
    errorCodes: [ErrorCode.NONE],
    data: {
      total: { type: 'number', example: 2 },
      fines: {
        isArray: true,
        type: 'object',
        example: [{ fineId: '9981', registerDate: '2026-01-10T12:00:00.000Z', status: 'PENDIENTE', titleNumber: 'T-991882', amount: 10.5, plate: 'ABC123' }],
      },
    },
  })
  @Get('check-my-incidents-outstanding/:userId/:idDevice/:version')
  checkMyIncidentsOutstanding(
    @Param('userId', ParseIntPipe) userId: number,
    @Param('idDevice', ParseUUIDPipe) idDevice: string,
    @Param('version', ParseIntPipe) version: number,
    @Query('plate') plate: string,
    @Query('identityCard') identityCard: string
  ) {
    return this.incidentService.checkMyFractionsOutstanding(plate, identityCard);
  }

  @ApiOperation({ summary: 'List sanctions/incidents linked to a fraction' })
  @ApiStandardResponse({
    description: 'Sanctions for the given fraction',
    errorCodes: [ErrorCode.NONE],
    data: {
      currentDate: { type: 'string', format: 'date-time' } as any,
      factionSanctions: {
        isArray: true,
        type: 'object',
        example: [{ id: 1, description: 'Exceeded time', images: [], plate: 'ABC123', createdAt: '2026-01-10T12:00:00.000Z', reason: 'Overtime' }],
      },
    },
  })
  @AuthWithKeycloak()
  @Get('find-all-sanctions-by-fraction/:userId/:idDevice/:fractionId/:version')
  findSanctionByFraction(
    @GetUser() user: JwtPayload,
    @Param('userId', ParseIntPipe) userId: number,
    @Param('idDevice', ParseUUIDPipe) idDevice: string,
    @Param('fractionId', ParseIntPipe) fractionId: number,
    @Param('version', ParseIntPipe) version: number,
    @Req() request: Request,
  ) {
    return this.incidentService.findSanctionByFraction(fractionId);
  }

  @ApiOperation({ summary: 'Find pending sanctions by identity card and sync with GIM' })
  @ApiStandardResponse({
    description: 'Pending incidents for the given identity card, emitted to GIM if needed',
    errorCodes: [ErrorCode.NONE, ErrorCode.NOT_FOUND, ErrorCode.NOT_VALID],
    data: {
      currentDate: { type: 'string', format: 'date-time' } as any,
      incidents: { model: Incident, isArray: true },
      message: { type: 'string', example: 'No se pudo verificar la información del cliente, por favor inténtelo más tarde' },
    },
  })
  @Post('find-by-identity-card/:userId/:idDevice/:identityCard/:version')
  findSanctionByIdentityCard(
    @Param('userId', ParseIntPipe) userId: number,
    @Param('idDevice', ParseUUIDPipe) idDevice: string,
    @Param('identityCard') identityCard: string,
    @Param('version', ParseIntPipe) version: number,
    @Body() getIncidentDto: GetIncidentDto,
  ) {
    return this.incidentService.findSanctionByIdentityCard(userId, idDevice, identityCard, getIncidentDto);
  }

  @ApiOperation({ summary: 'Start payment for one or multiple incidents' })
  @ApiStandardResponse({
    description: 'Payment intent created, awaiting provider response',
    errorCodes: [
      ErrorCode.NONE,
      ErrorCode.AWAITS_RESPONSE,
      ErrorCode.RESPONSE,
      ErrorCode.NOT_FOUND,
      ErrorCode.WAIT_TRANSACTION_PREVIEWS,
      ErrorCode.HTTP_ERROR_REINTENT,
      ErrorCode.UNAUTHORIZED,
    ],
    data: {
      incidentPaymentBuying: { model: IncidentPayment },
    },
  })
  @AuthWithKeycloak()
  @Post('pay/:userId/:idDevice/:version')
  pay(
    @GetUser() user: JwtPayload,
    @Param('userId', ParseIntPipe) userId: number,
    @Param('idDevice', ParseUUIDPipe) idDevice: string,
    @Param('version', ParseIntPipe) version: number,
    @Body() payIncidentDto: PayIncidentDto
  ) {
    return this.incidentService.pay(idDevice, payIncidentDto);
  }

  @ApiOperation({ summary: 'Webhook: provider payment success callback' })
  @ApiStandardResponse({
    description: 'Payment webhook processed',
    errorCodes: [ErrorCode.NONE, ErrorCode.NOT_FOUND],
    data: {},
  })
  @Patch('on-response-pay/:idDevice/:userId/:referenceId/:typePaymentMethod/:register/:typePaymentResponsibility/')
  onResponse(
    @Param('userId', ParseIntPipe) userId: number,
    @Param('typePaymentResponsibility', ParseIntPipe) typePaymentResponsibility: number,
    @Param('typePaymentMethod', ParseIntPipe) typePaymentMethod: number,
    @Param('referenceId') referenceId: string,
    @Param('idDevice', ParseUUIDPipe) idDevice: string,
    @Param('register') register: string,
    @Param('regiconceptster') concept: string,
  ) {
    return this.incidentService.onResponsePay(idDevice, userId, referenceId, typePaymentMethod, register, typePaymentResponsibility)
  }

  @ApiOperation({ summary: 'Webhook: provider payment error callback' })
  @ApiStandardResponse({
    description: 'Payment error webhook processed',
    data: {},
  })
  @Delete('on-response-pay/:idDevice/:userId/:referenceId/:typePaymentMethod/:register/:typePaymentResponsibility/')
  onResponsePayError(
    @Param('userId', ParseIntPipe) userId: number,
    @Param('typePaymentResponsibility', ParseIntPipe) typePaymentResponsibility: number,
    @Param('typePaymentMethod', ParseIntPipe) typePaymentMethod: number,
    @Param('referenceId') referenceId: string,
    @Param('idDevice', ParseUUIDPipe) idDevice: string,
    @Param('register') register: string,
    @Param('regiconceptster') concept: string,
  ) {
    return this.incidentService.onResponsePayError(idDevice, userId, referenceId, typePaymentMethod, register, typePaymentResponsibility)
  }

  @ApiOperation({ summary: 'Get payment transaction by reference id' })
  @ApiStandardResponse({
    description: 'Incident payment for the given reference',
    errorCodes: [ErrorCode.NONE, ErrorCode.NOT_FOUND],
    data: {
      incidentPaymentBuying: { model: IncidentPayment },
    },
  })
  @AuthWithKeycloak()
  @Get('get-transactions-by-reference/:userId/:idDevice/:reference/:version')
  getTransactionsByReference(
    @GetUser() user: JwtPayload,
    @Param('userId', ParseIntPipe) userId: number,
    @Param('idDevice', ParseUUIDPipe) idDevice: string,
    @Param('reference') reference: string,
  ) {
    return this.incidentService.getTransactionsByReference(userId, reference);
  }
}
