import {
    Body,
    Controller,
    Get,
    Param,
    ParseIntPipe,
    Post,
    Query,
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
import { PaidObligationsDto } from './dto/paid-obligations.dto';
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
     * Creates the controller and injects the GIM service.
     *
     * @param gimService Service handling all GIM integration business logic.
     */
    constructor(private readonly gimService: GimService) {}

    /**
     * Normalizes the `:userId` path segment into the acting user id recorded in
     * the audit trail.
     *
     * These routes are unguarded, so the path segment is the only source for
     * the actor. Anything that is not a positive number (missing, `'null'`,
     * `'0'`) yields `undefined`, which the audit trail reads as "no user"
     * instead of storing a bogus id.
     *
     * @param userId Raw `:userId` path segment.
     * @returns The acting user id, or `undefined` when there is none.
     */
    private _actingUserId(userId: string): number | undefined {
        const parsed = Number(userId);
        return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
    }

    /**
     * Issues an incident in GIM, generating a debt for the user.
     *
     * @param createGimDto Payload describing the incident to issue.
     * @param userId Identifier of the user issuing the incident.
     * @param idDevice Identifier of the device performing the operation.
     * @param id Incident identifier used by the service.
     * @param isTransacional Flag indicating whether the operation is transactional.
     * @returns Result of issuing the incident in GIM.
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
        return this.gimService.issueIncidentGim(
            createGimDto,
            +id,
            isTransacional,
            this._actingUserId(userId),
        );
    }

    /**
     * Emits an infraction directly to GIM, assuming all required data is ready.
     *
     * @param createGimDto Payload describing the infraction to emit.
     * @param userId Identifier of the user emitting the infraction.
     * @param idDevice Identifier of the device performing the operation.
     * @param id Infraction identifier used by the service.
     * @param isTransacional Flag indicating whether the operation is transactional.
     * @returns Result of emitting the infraction in GIM.
     */
    @ApiOperation({
        summary:
            'Emit an infraction directly to GIM (assumes all data is ready)',
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
            this._actingUserId(userId),
        );
    }

    /**
     * Creates a GIM natural person record for an existing local client.
     *
     * @param createClientGimDto Payload with the client data to register in GIM.
     * @param _idDevice Identifier of the device performing the operation.
     * @returns Result of creating the natural person record in GIM.
     */
    @ApiOperation({
        summary:
            'Create a GIM natural person record for an existing local client',
    })
    @Post('create-client-gim/:idDevice')
    createClientGim(
        @Body() createClientGimDto: CreateClientGimDto,
        @Param('idDevice') _idDevice: string,
    ) {
        return this.gimService.createNewNaturalPersonGim(createClientGimDto);
    }

    /**
     * Creates a GIM natural person record for a client not present in the local registry.
     *
     * @param createClientGimNotExistDto Payload with the data of the client to register in GIM.
     * @param _idDevice Identifier of the device performing the operation.
     * @returns Result of creating the natural person record in GIM.
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
     * Fetches a GIM client by identity card number and returns the resident identifier.
     *
     * @param getClientGimDto Payload containing the client identification number.
     * @param _idDevice Identifier of the device performing the operation.
     * @returns The GIM client data including the resident identifier.
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
     * Finds a GIM obligation (bond) by its ticket number.
     *
     * @param findBondNumberDto Payload containing the ticket number to look up.
     * @param _userId Identifier of the user performing the operation.
     * @param _idDevice Identifier of the device performing the operation.
     * @returns The matching GIM obligation (bond).
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
     * Verifies whether an incident has been registered in GIM.
     *
     * @param userId Identifier of the user performing the operation.
     * @param idDevice Identifier of the device performing the operation.
     * @param id Identifier of the incident to verify.
     * @returns The verification result for the incident in GIM.
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
     * Validates that the GIM cash register (till) is open.
     *
     * @param _user Authenticated user payload extracted from the JWT.
     * @param _userId Identifier of the user performing the operation.
     * @param _idDevice Identifier of the device performing the operation.
     * @param _id Identifier associated with the operation.
     * @returns The till open-state validation result from GIM.
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
     * Retrieves the vehicle type catalogue from GIM for use in SIMERT.
     *
     * @param _userId Identifier of the user performing the operation.
     * @param _idDevice Identifier of the device performing the operation.
     * @returns The vehicle type catalogue from GIM.
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
     * Emits a credit card payment title in GIM for a card purchase.
     *
     * @param userId Identifier of the user performing the operation.
     * @param idDevice Identifier of the device performing the operation.
     * @param emissionCreditCardDto Payload with the credit card emission data.
     * @returns The emitted credit card payment title from GIM.
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
     * Registers a deposit in GIM.
     *
     * @param userId Identifier of the user performing the operation.
     * @param idDevice Identifier of the device performing the operation.
     * @param registerDepositGimDto Payload with the deposit data to register.
     * @returns The result of registering the deposit in GIM.
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
     * Finds outstanding obligations (debts) for a client in GIM.
     *
     * @param userId Identifier of the user performing the operation.
     * @param idDevice Identifier of the device performing the operation.
     * @param getClientGimDto Payload identifying the client whose obligations are queried.
     * @returns The outstanding obligations for the client in GIM.
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
     * Lists the GIM credit titles already paid for a SIMERT concept within a
     * date range, used by the Recaudación report to reconcile SIMERT's own
     * collection against the municipality's.
     *
     * Served under the `api/simert/` prefix like every other route: the
     * deployment proxies only that prefix to this service, so mirroring GIM's
     * own `api/external/...` path made the resource unreachable behind nginx.
     *
     * @param _user Authenticated user payload extracted from the JWT.
     * @param paidObligationsDto Date range, SIMERT concept and 0-based pagination.
     * @param _userId Identifier of the user performing the operation.
     * @param _idDevice Identifier of the device performing the operation.
     * @returns The paid credit titles page for the requested filter.
     */
    @ApiOperation({
        summary:
            'List GIM paid credit titles (obligations) for a SIMERT concept in a date range',
    })
    @Auth()
    @Get('paid-obligations/:userId/:idDevice')
    findPaidObligations(
        @GetUser() _user: JwtPayload,
        @Query() paidObligationsDto: PaidObligationsDto,
        @Param('userId') _userId: string,
        @Param('idDevice') _idDevice: string,
    ) {
        return this.gimService.findPaidObligations(paidObligationsDto);
    }

    /**
     * Finds obligations by identity card and citation ticket number.
     *
     * @param userId Identifier of the user performing the operation.
     * @param idDevice Identifier of the device performing the operation.
     * @param getClientGimByCitationDto Payload with the citation ticket number and identity card.
     * @returns The obligations matching the citation ticket and identity card.
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
     * Finds obligations by vehicle license plate.
     *
     * @param userId Identifier of the user performing the operation.
     * @param idDevice Identifier of the device performing the operation.
     * @param getClientGimByLicensePlateDto Payload with the vehicle license plate.
     * @returns The obligations matching the given license plate.
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
     * Validates the SIMERT system status against GIM and synchronizes if needed.
     *
     * @param userId Identifier of the user performing the operation.
     * @param idDevice Identifier of the device performing the operation.
     * @param validateStatusGimDto Payload with the debt and incident data used for validation.
     * @returns The result of validating and synchronizing the system status with GIM.
     */
    @ApiOperation({
        summary:
            'Validate the SIMERT system status against GIM and sync if needed',
    })
    @Post('validate-status-with-gim/:userId/:idDevice')
    validateStatusWithGim(
        @Param('userId') userId: string,
        @Param('idDevice') idDevice: string,
        @Body() validateStatusGimDto: ValidateStatusGimDto,
    ) {
        const {
            debtDataObligations,
            incidentId,
            createGimDto,
            isTransacional,
        } = validateStatusGimDto;
        return this.gimService.validateStatusSistemWithGim(
            debtDataObligations,
            incidentId,
            createGimDto as CreateGimDto,
            isTransacional,
            this._actingUserId(userId),
        );
    }

    /**
     * Emits a traffic sanction in GIM.
     *
     * @param userId Identifier of the user performing the operation.
     * @param idDevice Identifier of the device performing the operation.
     * @param emissionSanctionDto Payload with the sanction data to emit.
     * @returns The result of emitting the sanction in GIM.
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
