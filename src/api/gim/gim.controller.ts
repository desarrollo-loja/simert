import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
} from '@nestjs/common';
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
import {
  GetClientGimByCitationDto,
  GetClientGimByLicensePlateDto,
  GetClientGimDto,
} from './dto/get-client-gim.dto';
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
  /**
   *
   * @param gimService
   */
  constructor(private readonly gimService: GimService) {}

  /**
   *
   * @param createGimDto
   * @param userId
   * @param idDevice
   * @param id
   * @param isTransacional
   */
  @ApiOperation({
    summary: 'Issue an incident in GIM (generates a debt for the user)',
  })
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

  /**
   *
   * @param createGimDto
   * @param userId
   * @param idDevice
   * @param id
   * @param isTransacional
   */
  @ApiOperation({
    summary: 'Emit an infraction directly to GIM (assumes all data is ready)',
  })
  @Post('emit-infraction-simert/:userId/:idDevice/:id/:isTransacional')
  emitInfractionSimert(
    @Body() createGimDto: CreateGimDto,
    @Param('userId') userId: string,
    @Param('idDevice') idDevice: string,
    @Param('id') id: string,
    @Param('isTransacional', ParseIntPipe) isTransacional: number,
  ) {
    return this.gimService.emitInfractionSimert(
      createGimDto,
      +id,
      isTransacional,
    );
  }

  /**
   *
   * @param createClientGimDto
   * @param _idDevice
   */
  @ApiOperation({
    summary: 'Create a GIM natural person record for an existing local client',
  })
  @Post('create-client-gim/:idDevice')
  createClientGim(
    @Body() createClientGimDto: CreateClientGimDto,
    @Param('idDevice') _idDevice: string,
  ) {
    return this.gimService.createNewNaturalPersonGim(createClientGimDto);
  }

  /**
   *
   * @param createClientGimNotExistDto
   * @param _idDevice
   */
  @ApiOperation({
    summary:
      'Create a GIM natural person record for a client not in local registry',
  })
  @Post('create-client-gim-no-exist/:idDevice')
  createClientGimNoExist(
    @Body() createClientGimNotExistDto: CreateClientGimNotExistDto,
    @Param('idDevice') _idDevice: string,
  ) {
    return this.gimService.createNewNaturalPersonGimNoExist(
      createClientGimNotExistDto,
    );
  }

  /**
   *
   * @param getClientGimDto
   * @param _idDevice
   */
  @ApiOperation({
    summary:
      'Fetch a GIM client by identity card number and return the residentId',
  })
  @Post('get-client-gim/:idDevice')
  getClientGim(
    @Body() getClientGimDto: GetClientGimDto,
    @Param('idDevice') _idDevice: string,
  ) {
    return this.gimService.getUserByIdentityCardGim(
      getClientGimDto.identificationNumber,
    );
  }

  /**
   *
   * @param findBondNumberDto
   * @param _userId
   * @param _idDevice
   */
  @ApiOperation({ summary: 'Find a GIM obligation (bond) by ticket number' })
  @Post('find-bond-by-number/:userId/:idDevice')
  findBondByNumber(
    @Body() findBondNumberDto: FindBondNumberDto,
    @Param('userId') _userId: string,
    @Param('idDevice') _idDevice: string,
  ) {
    return this.gimService.findBondByNumber(findBondNumberDto);
  }

  /**
   *
   * @param userId
   * @param idDevice
   * @param id
   */
  @ApiOperation({
    summary: 'Verify whether an incident has been registered in GIM',
  })
  @Get('verifate-incident-gim/:userId/:idDevice/:id')
  verifateIncidentGim(
    @Param('userId') userId: string,
    @Param('idDevice') idDevice: string,
    @Param('id') id: string,
  ) {
    return this.gimService.verifateIncidentGim(id);
  }

  /**
   *
   * @param _user
   * @param _userId
   * @param _idDevice
   * @param _id
   */
  @ApiOperation({
    summary: 'Validate that the GIM cash register (till) is open',
  })
  @Auth()
  @Get('validate-open-till/:userId/:idDevice/:id')
  validateOpenTill(
    @GetUser() _user: JwtPayload,
    @Param('userId') _userId: string,
    @Param('idDevice') _idDevice: string,
    @Param('id') _id: string,
  ) {
    return this.gimService.validateOpenTill();
  }

  /**
   *
   * @param _userId
   * @param _idDevice
   */
  @ApiOperation({
    summary: 'Retrieve vehicle type catalogue from GIM for use in SIMERT',
  })
  @Post('find-vehicle-types-for-simert/:userId/:idDevice')
  findVehicleTypesForSimert(
    @Param('userId') _userId: string,
    @Param('idDevice') _idDevice: string,
  ) {
    return this.gimService.findVehicleTypesForSimert();
  }

  /**
   *
   * @param userId
   * @param idDevice
   * @param emissionCreditCardDto
   */
  @ApiOperation({
    summary: 'Emit a credit card payment title in GIM for card purchase',
  })
  @Post('emission-title-credit-card/:userId/:idDevice')
  emissionTitleCreditCard(
    @Param('userId') userId: string,
    @Param('idDevice') idDevice: string,
    @Body() emissionCreditCardDto: EmissionCreditCardDto,
  ) {
    return this.gimService.emissionTitleCreditCard(emissionCreditCardDto);
  }

  /**
   *
   * @param userId
   * @param idDevice
   * @param registerDepositGimDto
   */
  @ApiOperation({ summary: 'Register a deposit in GIM' })
  @Post('register-deposit/:userId/:idDevice')
  registerDeposit(
    @Param('userId') userId: string,
    @Param('idDevice') idDevice: string,
    @Body() registerDepositGimDto: RegisterDepositGimDto,
  ) {
    return this.gimService.registerDeposit(registerDepositGimDto);
  }

  /**
   *
   * @param userId
   * @param idDevice
   * @param getClientGimDto
   */
  @ApiOperation({
    summary: 'Find outstanding obligations (debts) for a client in GIM',
  })
  @Post('find-obligations/:userId/:idDevice')
  findObligations(
    @Param('userId') userId: string,
    @Param('idDevice') idDevice: string,
    @Body() getClientGimDto: GetClientGimDto,
  ) {
    return this.gimService.findObligations(getClientGimDto);
  }

  /**
   *
   * @param userId
   * @param idDevice
   * @param getClientGimByCitationDto
   */
  @ApiOperation({
    summary: 'Find obligations by identity card and citation ticket number',
  })
  @Post('find-obligations-by-citation/:userId/:idDevice')
  findObligationsByCitation(
    @Param('userId') userId: string,
    @Param('idDevice') idDevice: string,
    @Body() getClientGimByCitationDto: GetClientGimByCitationDto,
  ) {
    return this.gimService.findObligationsByCitation(
      getClientGimByCitationDto.nroTicket,
      getClientGimByCitationDto.identityCard,
    );
  }

  /**
   *
   * @param userId
   * @param idDevice
   * @param getClientGimByLicensePlateDto
   */
  @ApiOperation({ summary: 'Find obligations by vehicle license plate' })
  @Post('find-obligations-by-license-plate/:userId/:idDevice')
  findObligationsByLicensePlate(
    @Param('userId') userId: string,
    @Param('idDevice') idDevice: string,
    @Body() getClientGimByLicensePlateDto: GetClientGimByLicensePlateDto,
  ) {
    return this.gimService.findObligationsByLicensePlate(
      getClientGimByLicensePlateDto.licensePlate,
    );
  }

  /**
   *
   * @param userId
   * @param idDevice
   * @param validateStatusGimDto
   */
  @ApiOperation({
    summary: 'Validate the SIMERT system status against GIM and sync if needed',
  })
  @Post('validate-status-with-gim/:userId/:idDevice')
  validateStatusWithGim(
    @Param('userId') userId: string,
    @Param('idDevice') idDevice: string,
    @Body() validateStatusGimDto: ValidateStatusGimDto,
  ) {
    const { debtDataObligations, incidentId, createGimDto, isTransacional } =
      validateStatusGimDto;
    return this.gimService.validateStatusSistemWithGim(
      debtDataObligations,
      incidentId,
      createGimDto as CreateGimDto,
      isTransacional,
    );
  }

  /**
   *
   * @param userId
   * @param idDevice
   * @param emissionSanctionDto
   */
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
