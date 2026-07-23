import {
    Body,
    Controller,
    Delete,
    Get,
    Param,
    ParseIntPipe,
    ParseUUIDPipe,
    Patch,
    Post,
    Query,
    UseInterceptors,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthWithKeycloak, GetUser } from 'src/auth/decorators';
import { JwtPayload } from 'src/auth/interfaces';
import { GetTransactionDto } from 'src/common/dto/get-transaction.dto';
import { PaginationDto } from 'src/common/dto/pagination.dto';
import { SystemStatusInterceptor } from 'src/common/interceptors/system-status.interceptor';

import { CheckboxService } from './checkbox.service';
import { CreateCheckboxDto } from './dto/create-checkbox.dto';
/**
 * REST controller for the user balance (checkbox) transactions in the client app.
 *
 * Base route: `client/checkbox`. Delegates all business logic to {@link CheckboxService}.
 */
@ApiTags('Client - Checkbox')
@ApiBearerAuth('keycloak')
@Controller('client/checkbox')
export class CheckboxController {
    /**
     * Creates the controller and injects its dependencies.
     *
     * @param checkboxService Service that handles checkbox transaction business logic.
     */
    constructor(private readonly checkboxService: CheckboxService) {}

    /**
     * Lists checkbox balance transactions for a user, applying date and pagination filters.
     *
     * @param user Authenticated user extracted from the Keycloak token.
     * @param userId Identifier of the user whose transactions are requested.
     * @param idDevice UUID of the device issuing the request.
     * @param getTransactionDto Date range filters for the transactions.
     * @param paginationDto Pagination parameters (limit and offset).
     * @returns Promise resolving to the paginated list of checkbox transactions.
     */
    @ApiOperation({
        summary:
            'List checkbox transactions for the authenticated user with date filters',
    })
    @AuthWithKeycloak()
    @Post('get-transactions/:userId/:idDevice/:version')
    getTransactions(
        @GetUser() user: JwtPayload,
        @Param('userId', ParseIntPipe) userId: number,
        @Param('idDevice', ParseUUIDPipe) idDevice: string,
        @Body() getTransactionDto: GetTransactionDto,
        @Query() paginationDto: PaginationDto,
    ) {
        return this.checkboxService.getTransactions(
            userId,
            getTransactionDto,
            paginationDto,
        );
    }

    /**
     * Retrieves a single checkbox transaction by its identifier for the given user.
     *
     * @param user Authenticated user extracted from the Keycloak token.
     * @param userId Identifier of the user that owns the transaction.
     * @param idDevice UUID of the device issuing the request.
     * @param id Identifier of the checkbox transaction to retrieve.
     * @returns Promise resolving to the requested checkbox transaction.
     */
    @ApiOperation({ summary: 'Get a single checkbox transaction by its id' })
    @AuthWithKeycloak()
    @Get('get-transactions-by-id/:userId/:idDevice/:id/:version')
    getTransactionsById(
        @GetUser() user: JwtPayload,
        @Param('userId', ParseIntPipe) userId: number,
        @Param('idDevice', ParseUUIDPipe) idDevice: string,
        @Param('id', ParseIntPipe) id: number,
    ) {
        return this.checkboxService.getTransactionsById(userId, id);
    }

    /**
     * Initiates the purchase of checkboxes, starting the associated payment flow.
     *
     * @param user Authenticated user extracted from the Keycloak token.
     * @param userId Identifier of the user performing the purchase.
     * @param idDevice UUID of the device issuing the request.
     * @param version Client application version supplied in the route.
     * @param createCheckboxDto Payload describing the checkbox purchase to perform.
     * @returns Promise resolving to the result of the checkbox purchase flow.
     */
    @ApiOperation({ summary: 'Purchase checkboxes (initiates a payment flow)' })
    @AuthWithKeycloak()
    @UseInterceptors(SystemStatusInterceptor)
    @Post('buy-checkboxs/:userId/:idDevice/:version')
    parking(
        @GetUser() user: JwtPayload,
        @Param('userId', ParseIntPipe) userId: number,
        @Param('idDevice', ParseUUIDPipe) idDevice: string,
        @Param('version', ParseIntPipe) version: number,
        @Body() createCheckboxDto: CreateCheckboxDto,
    ) {
        return this.checkboxService.buyCheckboxs(idDevice, createCheckboxDto);
    }

    /**
     * Returns the user's registered cards together with the current checkbox balance.
     *
     * @param user Authenticated user extracted from the Keycloak token.
     * @param userId Identifier of the user whose cards and balance are requested.
     * @param _idDevice UUID of the device issuing the request (unused).
     * @param _version Client application version supplied in the route (unused).
     * @returns Promise resolving to the user's cards and current checkbox balance.
     */
    @ApiOperation({
        summary: 'Get card info and current checkbox balance for the user',
    })
    @AuthWithKeycloak()
    @Get('get-cards-checkboxes/:userId/:idDevice/:version')
    getCardsAndCheckboxes(
        @GetUser() user: JwtPayload,
        @Param('userId', ParseIntPipe) userId: number,
        @Param('idDevice', ParseUUIDPipe) _idDevice: string,
        @Param('version', ParseIntPipe) _version: number,
    ) {
        return this.checkboxService.getCardsAndCheckboxes(userId);
    }

    /**
     * Webhook invoked by the payment provider when a checkbox payment succeeds.
     *
     * @param userId Identifier of the user that performed the payment.
     * @param typePaymentResponsibility Code identifying who is responsible for the payment.
     * @param typePaymentMethod Code identifying the payment method used.
     * @param checkboxId Identifier of the checkbox purchase being confirmed.
     * @param idDevice UUID of the device that originated the purchase.
     * @param register Payment registration reference returned by the provider.
     * @returns Promise resolving to the result of processing the successful payment.
     */
    @ApiOperation({
        summary:
            'Webhook: checkbox payment success callback from payment provider',
    })
    @Patch(
        'on-response-pay/:idDevice/:userId/:checkboxId/:typePaymentMethod/:register/:typePaymentResponsibility/',
    )
    onResponse(
        @Param('userId', ParseIntPipe) userId: number,
        @Param('typePaymentResponsibility', ParseIntPipe)
        typePaymentResponsibility: number,
        @Param('typePaymentMethod', ParseIntPipe) typePaymentMethod: number,
        @Param('checkboxId', ParseIntPipe) checkboxId: number,
        @Param('idDevice', ParseUUIDPipe) idDevice: string,
        @Param('register') register: string,
    ) {
        return this.checkboxService.onResponsePay(
            idDevice,
            userId,
            checkboxId,
            typePaymentMethod,
            register,
            typePaymentResponsibility,
        );
    }

    /**
     * Webhook invoked by the payment provider when a checkbox payment fails or is cancelled.
     *
     * @param userId Identifier of the user that attempted the payment.
     * @param typePaymentResponsibility Code identifying who is responsible for the payment.
     * @param typePaymentMethod Code identifying the payment method used.
     * @param checkboxId Identifier of the checkbox purchase being cancelled.
     * @param idDevice UUID of the device that originated the purchase.
     * @param register Payment registration reference returned by the provider.
     * @param _concept Payment concept supplied by the provider (unused).
     * @returns Promise resolving to the result of processing the failed payment.
     */
    @ApiOperation({
        summary:
            'Webhook: checkbox payment error/cancellation callback from payment provider',
    })
    @Delete(
        'on-response-pay/:idDevice/:userId/:checkboxId/:typePaymentMethod/:register/:typePaymentResponsibility/',
    )
    onResponsePayError(
        @Param('userId', ParseIntPipe) userId: number,
        @Param('typePaymentResponsibility', ParseIntPipe)
        typePaymentResponsibility: number,
        @Param('typePaymentMethod', ParseIntPipe) typePaymentMethod: number,
        @Param('checkboxId', ParseIntPipe) checkboxId: number,
        @Param('idDevice', ParseUUIDPipe) idDevice: string,
        @Param('register') register: string,
        @Param('regiconceptster') _concept: string,
    ) {
        return this.checkboxService.onResponsePayError(
            idDevice,
            userId,
            checkboxId,
            typePaymentMethod,
            register,
            typePaymentResponsibility,
        );
    }
}
