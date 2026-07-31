import {
    Body,
    Controller,
    Get,
    Param,
    Patch,
    Post,
    Put,
    Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthWithKeycloak } from 'src/auth/decorators';
import { Auth } from 'src/auth/decorators/auth.decorator';
import { GetUser } from 'src/auth/decorators/get-user.decorator';
import { JwtPayload } from 'src/auth/interfaces/jwt-payload.interface';
import { ApiStandardResponse } from 'src/common/decorators/api-standard-response.decorator';
import { CreateKeycloakUserDto } from 'src/common/dto/create-keycloak-user.dto';
import { LoginKeycloakClientDto } from 'src/common/dto/login-keycloak-client.dto';
import { UpdateKeycloakUserDto } from 'src/common/dto/update-keycloak-user.dto';
import { ErrorCode } from 'src/common/glob/error';

import { ChangePasswordDto } from './dto/change-password.dto';
import { FindAccountsDto } from './dto/find-accounts.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { SetUserStatusDto } from './dto/set-user-status.dto';
import { KeycloakService } from './keycloak.service';
/**
 * REST controller exposing Keycloak identity and user-management operations
 * for both ServiceHub clients and municipal employees.
 *
 * Base route: `api/keycloak`. Delegates all business logic to {@link KeycloakService}.
 */
@ApiTags('Api - Keycloak')
@ApiBearerAuth('keycloak')
@Controller('api/keycloak')
export class KeycloakController {
    /**
     * Creates the controller and injects its delegated service.
     *
     * @param keycloakService Service handling all Keycloak identity and user-management logic.
     */
    constructor(private readonly keycloakService: KeycloakService) {}

    // POST api/keycloak/login-client
    /**
     * Authenticates a ServiceHub client against the GIM2_REALM_SERVICE_HUB realm.
     *
     * @param dto Client credentials used to log in.
     * @returns Promise resolving to the Keycloak token response.
     */
    @ApiOperation({
        summary:
            'Login a ServiceHub client (citizen) against Keycloak realm GIM2_REALM_SERVICE_HUB',
    })
    @ApiStandardResponse({
        description:
            'Keycloak token response (access_token, refresh_token, expires_in, refresh_expires_in)',
        errorCodes: [ErrorCode.NONE],
        data: {
            access_token: {
                type: 'string',
                example: 'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...',
            },
            refresh_token: {
                type: 'string',
                example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
            },
            expires_in: { type: 'number', example: 3600 },
            refresh_expires_in: { type: 'number', example: 1800 },
        },
    })
    @Post('login-client')
    loginClient(@Body() dto: LoginKeycloakClientDto) {
        return this.keycloakService.loginClient(dto);
    }

    // POST api/keycloak/login-client-municipality
    /**
     * Authenticates a municipal employee against the GIM2_REALM_MUNICIPIO_K realm.
     *
     * @param dto Municipal employee credentials used to log in.
     * @returns Promise resolving to the Keycloak token response for the municipal user.
     */
    @ApiOperation({
        summary:
            'Login a municipal employee against Keycloak realm GIM2_REALM_MUNICIPIO_K',
    })
    @ApiStandardResponse({
        description: 'Keycloak token response for a municipal user',
        errorCodes: [ErrorCode.NONE],
        data: {
            access_token: {
                type: 'string',
                example: 'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...',
            },
            refresh_token: {
                type: 'string',
                example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
            },
            expires_in: { type: 'number', example: 3600 },
            refresh_expires_in: { type: 'number', example: 1800 },
        },
    })
    @Post('login-client-municipality')
    loginClientMunicipality(@Body() dto: LoginKeycloakClientDto) {
        return this.keycloakService.loginClientMunicipality(dto);
    }

    // POST api/keycloak/create-user
    /**
     * Creates a ServiceHub user in Keycloak.
     *
     * @param dto User attributes for the new ServiceHub account.
     * @returns Promise resolving to the created user identifier and confirmation message.
     */
    @ApiOperation({ summary: 'Create a ServiceHub user in Keycloak' })
    @ApiStandardResponse({
        description:
            'User created in Keycloak (userId is the Location header UUID)',
        errorCodes: [ErrorCode.NONE, ErrorCode.NOT_FOUND],
        data: {
            message: { type: 'string', example: 'Usuario creado exitosamente' },
            userId: {
                type: 'string',
                example: 'b1b9e0f0-1234-4aaa-9999-abcdefabcdef',
            },
        },
    })
    @Post('create-user')
    createUser(@Body() dto: CreateKeycloakUserDto) {
        return this.keycloakService.createUser(dto);
    }

    // POST api/keycloak/create-user municipal
    /**
     * Creates a municipal employee user in Keycloak.
     *
     * @param dto User attributes for the new municipal employee account.
     * @returns Promise resolving to the created user identifier and confirmation message.
     */
    @ApiOperation({ summary: 'Create a municipal employee user in Keycloak' })
    @ApiStandardResponse({
        description: 'Municipal user created in Keycloak',
        errorCodes: [ErrorCode.NONE, ErrorCode.NOT_FOUND],
        data: {
            message: { type: 'string', example: 'Usuario creado exitosamente' },
            userId: {
                type: 'string',
                example: 'b1b9e0f0-1234-4aaa-9999-abcdefabcdef',
            },
        },
    })
    @Post('create-user-municipality')
    createUserMunicipality(@Body() dto: CreateKeycloakUserDto) {
        return this.keycloakService.createUserMunicipality(dto);
    }

    // PUT api/keycloak/update-user/:id
    /**
     * Updates a ServiceHub user in Keycloak.
     *
     * @param id Keycloak identifier of the user to update.
     * @param dto User attributes to update.
     * @returns Promise resolving to the update confirmation message.
     */
    @ApiOperation({ summary: 'Update a ServiceHub user in Keycloak' })
    @ApiStandardResponse({
        description: 'User updated in Keycloak',
        errorCodes: [ErrorCode.NONE, ErrorCode.NOT_FOUND],
        data: {
            message: {
                type: 'string',
                example: 'Usuario actualizado exitosamente',
            },
        },
    })
    @Put('update-user/:id')
    updateUser(@Param('id') id: string, @Body() dto: UpdateKeycloakUserDto) {
        return this.keycloakService.updateUser(id, dto);
    }

    // PUT api/keycloak/update-user-municipality/:id
    /**
     * Updates a municipal employee user in Keycloak.
     *
     * @param id Keycloak identifier of the municipal user to update.
     * @param dto User attributes to update.
     * @returns Promise resolving to the update confirmation message.
     */
    @ApiOperation({ summary: 'Update a municipal employee user in Keycloak' })
    @ApiStandardResponse({
        description: 'Municipal user updated in Keycloak',
        errorCodes: [ErrorCode.NONE, ErrorCode.NOT_FOUND],
        data: {
            message: {
                type: 'string',
                example: 'Usuario actualizado exitosamente',
            },
        },
    })
    @Put('update-user-municipality/:id')
    updateUserMunicipality(
        @Param('id') id: string,
        @Body() dto: UpdateKeycloakUserDto,
    ) {
        return this.keycloakService.updateUserMunicipality(id, dto);
    }

    // GET api/keycloak/find-by-username/:username
    /**
     * Finds a ServiceHub Keycloak user by exact username.
     *
     * @param username Exact username to search for.
     * @returns Promise resolving to the list of matching Keycloak users.
     */
    @ApiOperation({
        summary: 'Find a ServiceHub Keycloak user by exact username',
    })
    @ApiStandardResponse({
        description: 'List of matching Keycloak users (empty if not found)',
        errorCodes: [ErrorCode.NONE, ErrorCode.NOT_FOUND],
        data: {
            message: {
                type: 'string',
                example: 'Usuario encontrado exitosamente',
            },
            data: {
                isArray: true,
                type: 'object',
                example: [
                    {
                        id: 'uuid',
                        username: 'johndoe',
                        email: 'john@example.com',
                        enabled: true,
                    },
                ],
            },
        },
    })
    @Get('find-by-username/:username')
    findByUsername(@Param('username') username: string) {
        return this.keycloakService.findByUsername(username);
    }

    // GET api/keycloak/find-by-email?email=...
    /**
     * Finds a ServiceHub Keycloak user by exact email.
     *
     * @param email Exact email to search for.
     * @returns Promise resolving to the list of matching Keycloak users.
     */
    @ApiOperation({ summary: 'Find a ServiceHub Keycloak user by exact email' })
    @ApiStandardResponse({
        description: 'List of matching Keycloak users (empty if not found)',
        errorCodes: [ErrorCode.NONE, ErrorCode.NOT_FOUND],
        data: {
            message: {
                type: 'string',
                example: 'Usuario encontrado exitosamente',
            },
            data: {
                isArray: true,
                type: 'object',
                example: [
                    {
                        id: 'uuid',
                        username: 'johndoe',
                        email: 'john@example.com',
                        enabled: true,
                    },
                ],
            },
        },
    })
    @Get('find-by-email')
    findByEmail(@Query('email') email: string) {
        return this.keycloakService.findByEmail(email);
    }

    /**
     * Resolves several ServiceHub accounts in a single call.
     *
     * Serves the admin tables, which need to tell at a glance which of the rows
     * on screen drifted from the identity provider: one request per page
     * instead of one per row.
     *
     * @param dto Accounts to resolve, each carrying a caller-owned `ref`.
     * @returns Promise resolving to one entry per requested account.
     */
    @ApiOperation({
        summary:
            'Resolve several ServiceHub accounts in one call (by username, then email)',
    })
    @ApiStandardResponse({
        description:
            'One entry per requested account; `account` is null when not found',
        errorCodes: [ErrorCode.NONE],
        data: {
            message: { type: 'string', example: 'Consulta realizada' },
            data: {
                isArray: true,
                type: 'object',
                example: [
                    {
                        ref: '7',
                        matchedBy: 'usuario',
                        account: {
                            id: 'uuid',
                            username: 'johndoe',
                            enabled: true,
                        },
                    },
                ],
            },
        },
    })
    @AuthWithKeycloak()
    @Post('find-accounts')
    findAccounts(@Body() dto: FindAccountsDto) {
        return this.keycloakService.findAccounts(dto);
    }

    /**
     * Resolves several municipal accounts in a single call.
     *
     * @param dto Accounts to resolve, each carrying a caller-owned `ref`.
     * @returns Promise resolving to one entry per requested account.
     */
    @ApiOperation({
        summary:
            'Resolve several municipal accounts in one call (by username, then email)',
    })
    @ApiStandardResponse({
        description:
            'One entry per requested account; `account` is null when not found',
        errorCodes: [ErrorCode.NONE],
        data: {
            message: { type: 'string', example: 'Consulta realizada' },
            data: { isArray: true, type: 'object', example: [] },
        },
    })
    @AuthWithKeycloak()
    @Post('find-accounts-municipality')
    findAccountsMunicipality(@Body() dto: FindAccountsDto) {
        return this.keycloakService.findAccounts(dto, true);
    }

    /**
     * Resets a ServiceHub user password by email, generating a temporary password and emailing it.
     *
     * @param dto Reset request containing the target user's email.
     * @returns Promise resolving to the reset result, including the user identifier and email-sent flag.
     */
    @ApiOperation({
        summary:
            'Reset a ServiceHub user password by email (generates temp password and emails it)',
    })
    @ApiStandardResponse({
        description:
            'Temp password generated in Keycloak and dispatched to parking_auth mail service',
        errorCodes: [ErrorCode.NONE, ErrorCode.NOT_FOUND],
        data: {
            message: {
                type: 'string',
                example: 'Contraseña temporal generada y enviada al correo',
            },
            userId: {
                type: 'string',
                example: 'b1b9e0f0-1234-4aaa-9999-abcdefabcdef',
            },
            emailSent: { type: 'boolean', example: true },
        },
    })
    @Post('reset-password')
    setUserPassword(@Body() dto: ResetPasswordDto) {
        return this.keycloakService.setUserPassword(dto.email);
    }

    /**
     * Resets a municipal employee password by email, generating a temporary password and emailing it.
     *
     * @param dto Reset request containing the target employee's email.
     * @returns Promise resolving to the reset result, including the user identifier and email-sent flag.
     */
    @ApiOperation({ summary: 'Reset a municipal employee password by email' })
    @ApiStandardResponse({
        description:
            'Temp password generated in Keycloak and dispatched to parking_auth mail service',
        errorCodes: [ErrorCode.NONE, ErrorCode.NOT_FOUND],
        data: {
            message: {
                type: 'string',
                example: 'Contraseña temporal generada y enviada al correo',
            },
            userId: {
                type: 'string',
                example: 'b1b9e0f0-1234-4aaa-9999-abcdefabcdef',
            },
            emailSent: { type: 'boolean', example: true },
        },
    })
    @Post('reset-password-municipality')
    setUserPasswordMunicipality(@Body() dto: ResetPasswordDto) {
        return this.keycloakService.setUserPasswordMunicipality(dto.email);
    }

    /**
     * Changes the authenticated client's own password without sending an email.
     *
     * @param user Authenticated client extracted from the JWT.
     * @param dto Payload containing the email and the new password.
     * @returns Promise resolving to the password-update confirmation and user identifier.
     */
    @ApiOperation({
        summary:
            'Change own password (authenticated client). Email in body must match the JWT email.',
    })
    @ApiStandardResponse({
        description:
            'Password updated in Keycloak (no email sent — the user already knows it)',
        errorCodes: [ErrorCode.NONE, ErrorCode.NOT_FOUND],
        data: {
            message: {
                type: 'string',
                example: 'Contraseña actualizada exitosamente',
            },
            userId: {
                type: 'string',
                example: 'b1b9e0f0-1234-4aaa-9999-abcdefabcdef',
            },
        },
    })
    @Auth()
    @Post('change-password')
    changePassword(
        @GetUser() user: JwtPayload,
        @Body() dto: ChangePasswordDto,
    ) {
        return this.keycloakService.changePassword(dto.email, dto.newPassword);
    }

    /**
     * Changes the authenticated municipal employee's own password without sending an email.
     *
     * @param user Authenticated municipal employee extracted from the JWT.
     * @param dto Payload containing the email and the new password.
     * @returns Promise resolving to the password-update confirmation and user identifier.
     */
    @ApiOperation({
        summary:
            'Change own password (authenticated municipal employee). Email in body must match the JWT email.',
    })
    @ApiStandardResponse({
        description:
            'Password updated in Keycloak (no email sent — the user already knows it)',
        errorCodes: [ErrorCode.NONE, ErrorCode.NOT_FOUND],
        data: {
            message: {
                type: 'string',
                example: 'Contraseña actualizada exitosamente',
            },
            userId: {
                type: 'string',
                example: 'b1b9e0f0-1234-4aaa-9999-abcdefabcdef',
            },
        },
    })
    @Auth()
    @Post('change-password-municipality')
    changePasswordMunicipality(
        @GetUser() user: JwtPayload,
        @Body() dto: ChangePasswordDto,
    ) {
        return this.keycloakService.changePasswordMunicipality(
            dto.email,
            dto.newPassword,
        );
    }

    // GET api/keycloak/find-by-identification?identification=...
    /**
     * Finds a ServiceHub Keycloak user by exact identification.
     *
     * @param identification Exact identification number to search for.
     * @returns Promise resolving to the list of matching Keycloak users.
     */
    @ApiOperation({
        summary: 'Find a ServiceHub Keycloak user by exact identification',
    })
    @ApiStandardResponse({
        description: 'List of matching Keycloak users (empty if not found)',
        errorCodes: [ErrorCode.NONE, ErrorCode.NOT_FOUND],
        data: {
            message: {
                type: 'string',
                example: 'Usuario encontrado exitosamente',
            },
            data: {
                isArray: true,
                type: 'object',
                example: [
                    {
                        id: 'uuid',
                        username: 'johndoe',
                        email: 'john@example.com',
                        enabled: true,
                    },
                ],
            },
        },
    })
    @Get('find-by-identification')
    findByIdentification(@Query('identification') identification: string) {
        return this.keycloakService.findByIdentification(identification);
    }

    // GET api/keycloak/find-by-username/:username
    /**
     * Finds a municipal Keycloak user by exact username.
     *
     * @param username Exact username to search for.
     * @returns Promise resolving to the list of matching municipal Keycloak users.
     */
    @ApiOperation({
        summary: 'Find a municipal Keycloak user by exact username',
    })
    @ApiStandardResponse({
        description:
            'List of matching municipal Keycloak users (empty if not found)',
        errorCodes: [ErrorCode.NONE, ErrorCode.NOT_FOUND],
        data: {
            message: {
                type: 'string',
                example: 'Usuario encontrado exitosamente',
            },
            data: {
                isArray: true,
                type: 'object',
                example: [
                    {
                        id: 'uuid',
                        username: 'admin01',
                        email: 'admin@loja.gob.ec',
                        enabled: true,
                    },
                ],
            },
        },
    })
    @Get('find-by-username-municipality/:username')
    findByUsernameMunicipality(@Param('username') username: string) {
        return this.keycloakService.findByUsernameMunicipality(username);
    }

    // GET api/keycloak/find-by-email?email=...
    /**
     * Finds a municipal Keycloak user by exact email.
     *
     * @param email Exact email to search for.
     * @returns Promise resolving to the list of matching municipal Keycloak users.
     */
    @ApiOperation({ summary: 'Find a municipal Keycloak user by exact email' })
    @ApiStandardResponse({
        description:
            'List of matching municipal Keycloak users (empty if not found)',
        errorCodes: [ErrorCode.NONE, ErrorCode.NOT_FOUND],
        data: {
            message: {
                type: 'string',
                example: 'Usuario encontrado exitosamente',
            },
            data: {
                isArray: true,
                type: 'object',
                example: [
                    {
                        id: 'uuid',
                        username: 'admin01',
                        email: 'admin@loja.gob.ec',
                        enabled: true,
                    },
                ],
            },
        },
    })
    @Get('find-by-email-municipality')
    findByEmailMunicipality(@Query('email') email: string) {
        return this.keycloakService.findByEmailMunicipality(email);
    }

    // GET api/keycloak/find-by-identification?identification=...
    /**
     * Finds a municipal Keycloak user by exact identification.
     *
     * @param identification Exact identification number to search for.
     * @returns Promise resolving to the list of matching municipal Keycloak users.
     */
    @ApiOperation({
        summary: 'Find a municipal Keycloak user by exact identification',
    })
    @ApiStandardResponse({
        description:
            'List of matching municipal Keycloak users (empty if not found)',
        errorCodes: [ErrorCode.NONE, ErrorCode.NOT_FOUND],
        data: {
            message: {
                type: 'string',
                example: 'Usuario encontrado exitosamente',
            },
            data: {
                isArray: true,
                type: 'object',
                example: [
                    {
                        id: 'uuid',
                        username: 'admin01',
                        email: 'admin@loja.gob.ec',
                        enabled: true,
                    },
                ],
            },
        },
    })
    @Get('find-by-identification-municipality')
    findByIdentificationMunicipality(
        @Query('identification') identification: string,
    ) {
        return this.keycloakService.findByIdentificationMunicipality(
            identification,
        );
    }

    // PATCH api/keycloak/set-status
    /**
     * Enables or disables a ServiceHub user account in Keycloak.
     *
     * @param dto Payload containing the user identifier and the desired enabled state.
     * @returns Promise resolving to the status-update confirmation and the resulting enabled flag.
     */
    @ApiOperation({
        summary:
            'Enable or disable a ServiceHub user account in Keycloak (id travels in the body)',
    })
    @ApiStandardResponse({
        description:
            'Account status updated in Keycloak (enabled = true habilita, false deshabilita)',
        errorCodes: [ErrorCode.NONE, ErrorCode.NOT_FOUND],
        data: {
            message: {
                type: 'string',
                example: 'Cuenta deshabilitada exitosamente',
            },
            enabled: { type: 'boolean', example: false },
        },
    })
    @Patch('set-status')
    setUserStatus(@Body() dto: SetUserStatusDto) {
        return this.keycloakService.setUserStatus(dto.id, dto.enabled);
    }

    // PATCH api/keycloak/set-status-municipality
    /**
     * Enables or disables a municipal employee account in Keycloak.
     *
     * @param dto Payload containing the user identifier and the desired enabled state.
     * @returns Promise resolving to the status-update confirmation and the resulting enabled flag.
     */
    @ApiOperation({
        summary:
            'Enable or disable a municipal employee account in Keycloak (id travels in the body)',
    })
    @ApiStandardResponse({
        description:
            'Account status updated in Keycloak (enabled = true habilita, false deshabilita)',
        errorCodes: [ErrorCode.NONE, ErrorCode.NOT_FOUND],
        data: {
            message: {
                type: 'string',
                example: 'Cuenta deshabilitada exitosamente',
            },
            enabled: { type: 'boolean', example: false },
        },
    })
    @Patch('set-status-municipality')
    setUserStatusMunicipality(@Body() dto: SetUserStatusDto) {
        return this.keycloakService.setUserStatusMunicipality(
            dto.id,
            dto.enabled,
        );
    }
}
