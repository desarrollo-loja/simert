import { Body, Controller, Get, Param, ParseIntPipe, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Auth, GetUser } from 'src/auth/decorators';
import { JwtPayload } from 'src/auth/interfaces';
import { CreateClientGimDto } from 'src/common/dto/create-client-gim.dto';
import { CreateClientGimNotExistDto } from 'src/common/dto/create-client-gim-not-exist.dto';
import { EmissionCreditCardDto } from 'src/common/dto/emission-credit-card.dto';
import { EmissionSanctionDto } from 'src/common/dto/emission-sanction.dto';
import { RegisterDepositGimDto } from 'src/common/dto/register-deposit-gim.dto';

import { CreateGimDto } from './dto/create-gim.dto';
import FindBondNumberDto from './dto/find-bond-number';
import { GetClientGimByCitationDto, GetClientGimByLicensePlateDto, GetClientGimDto } from './dto/get-client-gim.dto';
import { ValidateStatusGimDto } from './dto/validate-status-gim.dto';
import { GimService } from './gim.service';
/**
 * REST controller exposing GIM municipal-management integration operations
 * (incidents, sanctions, clients, obligations, deposits and till validation).
 *
 * Base route: `api/gim`. Delegates all business logic to {@link GimService}.
 */
@ApiTags('Api - Gim')
@ApiBearerAuth('keycloak')
@Controller('api/gim')
export class GimController {
  constructor(private readonly gimService: GimService) { }

  @ApiOperation({ summary: 'Issue an incident in GIM (generates a debt for the user)' })
  @Post('issue-incident-gim/:userId/:idDevice/:id/:isTransacional')
  issueIncidentGim(
    @Body() createGimDto: CreateGimDto,
    @Param('userId') userId: string,
    @Param('idDevice') idDevice: string,
    @Param('id') id: string,
    @Param('isTransacional', ParseIntPipe) isTransacional: number,
  ) {
    return this.gimService.issueIncidentGim(createGimDto, +id, isTransacional);
  }

  @ApiOperation({ summary: 'Emit an infraction directly to GIM (assumes all data is ready)' })
  @Post('emit-infraction-simert/:userId/:idDevice/:id/:isTransacional')
  emitInfractionSimert(
    @Body() createGimDto: CreateGimDto,
    @Param('userId') userId: string,
    @Param('idDevice') idDevice: string,
    @Param('id') id: string,
    @Param('isTransacional', ParseIntPipe) isTransacional: number,
  ) {
    return this.gimService.emitInfractionSimert(createGimDto, +id, isTransacional);
  }

  @ApiOperation({ summary: 'Create a GIM natural person record for an existing local client' })
  @Post('create-client-gim/:idDevice')
  createClientGim(
    @Body() createClientGimDto: CreateClientGimDto,
    @Param('idDevice') idDevice: string,
  ) {
    return this.gimService.createNewNaturalPersonGim(createClientGimDto);
  }

  @ApiOperation({ summary: 'Create a GIM natural person record for a client not in local registry' })
  @Post('create-client-gim-no-exist/:idDevice')
  createClientGimNoExist(
    @Body() createClientGimNotExistDto: CreateClientGimNotExistDto,
    @Param('idDevice') idDevice: string,
  ) {
    return this.gimService.createNewNaturalPersonGimNoExist(createClientGimNotExistDto);
  }

  @ApiOperation({ summary: 'Fetch a GIM client by identity card number and return the residentId' })
  @Post('get-client-gim/:idDevice')
  getClientGim(
    @Body() getClientGimDto: GetClientGimDto,
    @Param('idDevice') idDevice: string,
  ) {
    return this.gimService.getUserByIdentityCardGim(getClientGimDto.identificationNumber);
  }

  @ApiOperation({ summary: 'Find a GIM obligation (bond) by ticket number' })
  @Post('find-bond-by-number/:userId/:idDevice')
  findBondByNumber(
    @Body() findBondNumberDto: FindBondNumberDto,
    @Param('userId') userId: string,
    @Param('idDevice') idDevice: string,
  ) {
    return this.gimService.findBondByNumber(findBondNumberDto);
  }

  @ApiOperation({ summary: 'Verify whether an incident has been registered in GIM' })
  @Get('verifate-incident-gim/:userId/:idDevice/:id')
  verifateIncidentGim(
    @Param('userId') userId: string,
    @Param('idDevice') idDevice: string,
    @Param('id') id: string,
  ) {
    return this.gimService.verifateIncidentGim(id);
  }

  @ApiOperation({ summary: 'Validate that the GIM cash register (till) is open' })
  @Auth()
  @Get('validate-open-till/:userId/:idDevice/:id')
  validateOpenTill(
    @GetUser() user: JwtPayload,
    @Param('userId') userId: string,
    @Param('idDevice') idDevice: string,
    @Param('id') id: string,
  ) {
    return this.gimService.validateOpenTill();
  }

  @ApiOperation({ summary: 'Retrieve vehicle type catalogue from GIM for use in SIMERT' })
  @Post('find-vehicle-types-for-simert/:userId/:idDevice')
  findVehicleTypesForSimert(
    @Param('userId') _userId: string,
    @Param('idDevice') _idDevice: string,
  ) {
    return this.gimService.findVehicleTypesForSimert();
  }

  @ApiOperation({ summary: 'Emit a credit card payment title in GIM for card purchase' })
  @Post('emission-title-credit-card/:userId/:idDevice')
  emissionTitleCreditCard(
    @Param('userId') userId: string,
    @Param('idDevice') idDevice: string,
    @Body() emissionCreditCardDto: EmissionCreditCardDto,
  ) {
    return this.gimService.emissionTitleCreditCard(emissionCreditCardDto);
  }

  @ApiOperation({ summary: 'Register a deposit in GIM' })
  @Post('register-deposit/:userId/:idDevice')
  registerDeposit(
    @Param('userId') userId: string,
    @Param('idDevice') idDevice: string,
    @Body() registerDepositGimDto: RegisterDepositGimDto,
  ) {
    return this.gimService.registerDeposit(registerDepositGimDto);
  }

  @ApiOperation({ summary: 'Find outstanding obligations (debts) for a client in GIM' })
  @Post('find-obligations/:userId/:idDevice')
  findObligations(
    @Param('userId') userId: string,
    @Param('idDevice') idDevice: string,
    @Body() getClientGimDto: GetClientGimDto,
  ) {
    return this.gimService.findObligations(getClientGimDto);
  }

  @ApiOperation({ summary: 'Find obligations by identity card and citation ticket number' })
  @Post('find-obligations-by-citation/:userId/:idDevice')
  findObligationsByCitation(
    @Param('userId') userId: string,
    @Param('idDevice') idDevice: string,
    @Body() getClientGimByCitationDto: GetClientGimByCitationDto,
  ) {
    return this.gimService.findObligationsByCitation(getClientGimByCitationDto.nroTicket, getClientGimByCitationDto.identityCard);
  }

  @ApiOperation({ summary: 'Find obligations by vehicle license plate' })
  @Post('find-obligations-by-license-plate/:userId/:idDevice')
  findObligationsByLicensePlate(
    @Param('userId') userId: string,
    @Param('idDevice') idDevice: string,
    @Body() getClientGimByLicensePlateDto: GetClientGimByLicensePlateDto,
  ) {
    return this.gimService.findObligationsByLicensePlate(getClientGimByLicensePlateDto.licensePlate);
  }

  @ApiOperation({ summary: 'Validate the SIMERT system status against GIM and sync if needed' })
  @Post('validate-status-with-gim/:userId/:idDevice')
  validateStatusWithGim(
    @Param('userId') userId: string,
    @Param('idDevice') idDevice: string,
    @Body() validateStatusGimDto: ValidateStatusGimDto,
  ) {
    const { debtDataObligations, incidentId, createGimDto, isTransacional } = validateStatusGimDto;
    return this.gimService.validateStatusSistemWithGim(debtDataObligations, incidentId, createGimDto as CreateGimDto, isTransacional);
  }

  @ApiOperation({ summary: 'Emit a traffic sanction in GIM' })
  @Post('emit-sanction/:userId/:idDevice')
  emitSanction(
    @Param('userId') userId: string,
    @Param('idDevice') idDevice: string,
    @Body() emissionSanctionDto: EmissionSanctionDto,
  ) {
    return this.gimService.emitSanction(emissionSanctionDto);
  }
}
