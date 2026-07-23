import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { CommonGimService } from 'src/common/common.gim.service';
import { CreateKeycloakUserDto } from 'src/common/dto/create-keycloak-user.dto';
import { LoginKeycloakClientDto } from 'src/common/dto/login-keycloak-client.dto';
import { UpdateKeycloakUserDto } from 'src/common/dto/update-keycloak-user.dto';
import { ErrorCode } from 'src/common/glob/error';
import { LoggerService } from 'src/common/logger.service.ts';

// Safety margin: refresh the token 30 seconds before it expires
const TOKEN_REFRESH_MARGIN_MS = 30_000;

/**
 * Service that wraps all Keycloak / GIM identity-provider operations:
 * obtaining and caching the ServiceHub access token, creating/updating/
 * deleting Keycloak users, and client-credentials login for municipality
 * realm users. Token cache is refreshed {@link TOKEN_REFRESH_MARGIN_MS}
 * before expiry.
 */
@Injectable()
export class KeycloakService {
    private readonly logger = new Logger(KeycloakService.name);
    private readonly gimBaseUrlLogin: string;
    private readonly gimBaseUrlLoginMunicipality: string;
    private readonly gim2RealmServiceHub: string;
    private readonly gim2RealmMunicipality: string;
    private readonly dominioAuth: string;

    // ServiceHub token cache
    private serviceHubToken: string | null = null;
    private serviceHubTokenExpiresAt = 0; // timestamp in ms

    /**
     * Initializes the service and resolves GIM/Keycloak configuration (realm
     * URLs, realm names and the auth domain) from environment variables.
     *
     * @param commonGimService Shared GIM service used to obtain access tokens.
     * @param configService Configuration provider for environment variables.
     * @param loggerService Audit logger used to record Keycloak integration failures.
     */
    constructor(
        private readonly commonGimService: CommonGimService,
        private readonly configService: ConfigService,
        private readonly loggerService: LoggerService,
    ) {
        this.gimBaseUrlLogin =
            this.configService.get<string>('GIM_BASE_URL_LOGIN'); // Default or Env
        this.gim2RealmServiceHub = this.configService.get<string>(
            'GIM2_REALM_SERVICE_HUB',
        ); // Default or Env
        this.gimBaseUrlLoginMunicipality =
            this.configService.get<string>('GIM_BASE_URL_LOGIN'); // Default or Env
        this.gim2RealmMunicipality = this.configService.get<string>(
            'GIM2_REALM_MUNICIPIO_K',
        ); // Default or Env
        this.dominioAuth = this.configService.get<string>('DOMINIO_AUTH');
    }

    // ─── Smart-cached token ─────────────────────────────────────────────────────

    /**
     * Returns a valid ServiceHub access token, using the in-memory cache when it
     * is still valid and refreshing it from GIM otherwise.
     *
     * @returns Promise resolving to the access token, or `null` if it could not be obtained.
     */
    private async getToken(): Promise<string> {
        const now = Date.now();

        if (
            this.serviceHubToken &&
            now < this.serviceHubTokenExpiresAt - TOKEN_REFRESH_MARGIN_MS
        ) {
            return this.serviceHubToken;
        }

        const result = await this.commonGimService.loginGimServiceHub();

        if (result.errorCode !== ErrorCode.NONE || !result.data) {
            return null;
        }

        this.serviceHubToken = result.data.access_token;
        // expires_in is in seconds
        this.serviceHubTokenExpiresAt = now + result.data.expires_in * 1000;

        return this.serviceHubToken;
    }

    // Always fetches a fresh token for municipal employees (realm Municipio K, client_credentials)
    /**
     * Fetches a fresh access token for municipal employees (realm Municipio K,
     * `client_credentials` grant); this token is never cached.
     *
     * @returns Promise resolving to the access token, or `null` if it could not be obtained.
     */
    private async getTokenMunicipalityK(): Promise<string> {
        const result = await this.commonGimService.loginGimMunicipalityK();

        if (result.errorCode !== ErrorCode.NONE || !result.data) {
            return null;
        }

        return result.data.access_token;
    }

    /**
     * Builds the standard JSON request headers including the bearer token.
     *
     * @param token Access token to place in the `Authorization` header.
     * @returns Header object with `Authorization` and `Content-Type`.
     */
    private authHeaders(token: string) {
        return {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
        };
    }

    /**
     * Builds the ServiceHub realm users admin URL, optionally targeting a user.
     *
     * @param id Optional Keycloak user id appended to the URL.
     * @returns The users collection URL, or the specific user URL when `id` is provided.
     */
    private usersUrl(id?: string): string {
        const base = `${this.gimBaseUrlLogin}/admin/realms/${this.gim2RealmServiceHub}/users`;
        return id ? `${base}/${id}` : base;
    }

    /**
     * Builds the Municipality realm users admin URL, optionally targeting a user.
     *
     * @param id Optional Keycloak user id appended to the URL.
     * @returns The users collection URL, or the specific user URL when `id` is provided.
     */
    private usersUrlMunicipality(id?: string): string {
        const base = `${this.gimBaseUrlLogin}/admin/realms/${this.gim2RealmMunicipality}/users`;
        return id ? `${base}/${id}` : base;
    }

    /**
     * Returns the mapped error envelope for a failed Keycloak / GIM request and
     * records real integration failures in the `logskeycloak` collection.
     *
     * Mapping is delegated to {@link _mapKeycloakError} (behavior unchanged). An
     * audit entry is written for every failure except an expected 401 (bad
     * credentials / unauthorized), which is a client-side error. The audit write
     * is fire-and-forget and never alters the returned envelope.
     *
     * @param context Name of the calling operation, used for logging and audit.
     * @param error Error raised by axios: a connection error (`error.code`) or an
     *        HTTP response error (`error.response.status`).
     * @returns An `{ errorCode, message }` envelope describing the failure.
     */
    private _buildKeycloakError(
        context: string,
        error: any,
    ): { errorCode: ErrorCode; message: string } {
        const result = this._mapKeycloakError(context, error);

        // Skip expected 401s (bad credentials / unauthorized); record only real
        // integration failures (connection errors, 5xx, 409, unexpected).
        if (error?.response?.status !== 401) {
            this.loggerService.saveLogsKeycloakLogger({
                resource: 'KEYCLOAK',
                service: 'KeycloakService',
                method: context,
                endpoint: error?.config?.url,
                httpStatus: error?.response?.status,
                errorCode: result.errorCode,
                message: result.message,
                response: error?.response?.data,
                exception: error?.name
                    ? `${error.name}: ${error.message}`
                    : String(error),
            });
        }

        return result;
    }

    /**
     * Maps a failed Keycloak / GIM request into a normalized error envelope.
     *
     * This used to throw an {@link HttpException}, which surfaced on the client as
     * an HTTP error (e.g. the red `401 (Unauthorized)` logged in the browser
     * console). To stay consistent with the rest of the service — where every
     * method resolves with an `{ errorCode, message }` envelope — failures are now
     * **returned** instead of thrown, so the HTTP status stays 2xx and the client
     * reads the outcome from `errorCode` without it being treated as a hard error.
     *
     * The client-facing Spanish messages are kept verbatim (they are contracts).
     *
     * @param context Name of the calling operation, used only for server-side logging.
     * @param error Error raised by axios: a connection error (`error.code`) or an
     *        HTTP response error (`error.response.status`).
     * @returns An `{ errorCode, message }` envelope describing the failure.
     */
    private _mapKeycloakError(
        context: string,
        error: any,
    ): { errorCode: ErrorCode; message: string } {
        const status: number =
            error?.response?.status ?? HttpStatus.INTERNAL_SERVER_ERROR;
        const isConnectionError = [
            'ECONNABORTED',
            'ETIMEDOUT',
            'ECONNREFUSED',
            'ENOTFOUND',
        ].includes(error?.code);
        const logMessage = `Error ${context} | status: ${status} | code: ${error?.code} | msg: ${error?.message}`;

        // A 401 is an expected client-side failure (bad credentials / unauthorized),
        // so it is logged as a warning; everything else points to an infra/server issue.
        if (status === 401) this.logger.warn(logMessage);
        else this.logger.error(logMessage);

        if (isConnectionError) {
            return {
                errorCode: ErrorCode.RESPONSE,
                message:
                    'No hay comunicación con el sistema municipal, por favor comuníquese con el administrador',
            };
        }

        if (status === 401) {
            if (error?.response?.data?.error === 'invalid_grant') {
                return {
                    errorCode: ErrorCode.UNAUTHORIZED,
                    message:
                        'Credenciales incorrectas, por favor verifique su usuario y contraseña',
                };
            }
            return {
                errorCode: ErrorCode.UNAUTHORIZED,
                message:
                    'Usuario no autorizado en el sistema municipal, por favor comuníquese con el administrador',
            };
        }

        if (status === 500) {
            return {
                errorCode: ErrorCode.RESPONSE,
                message:
                    'Error con el sistema municipal, por favor comuníquese con el administrador',
            };
        }

        if (status === 409) {
            return {
                errorCode: ErrorCode.RESPONSE,
                message:
                    'El usuario ya existe en el sistema municipal, por favor comuníquese con el administrador',
            };
        }

        const rawMessage: string =
            error?.response?.data?.message ??
            error?.response?.data?.error ??
            error?.message ??
            'Error inesperado en Keycloak';

        if (rawMessage.includes('Account disabled')) {
            return {
                errorCode: ErrorCode.UNAUTHORIZED,
                message:
                    'Su cuenta está deshabilitada en el sistema municipal. Por favor comuníquese con el administrador',
            };
        }

        return {
            errorCode: ErrorCode.RESPONSE,
            message:
                'Error al verificar el usuario en el municipio. Por favor comuníquese con el administrador.',
        };
    }

    // ─── Endpoints ───────────────────────────────────────────────────────────────

    /**
     * Creates a user in the ServiceHub realm and extracts the new id from the
     * Keycloak `Location` response header.
     *
     * @param dto User payload to create in Keycloak.
     * @returns Result envelope with `errorCode`, `message` and the created `userId`.
     */
    async createUser(dto: CreateKeycloakUserDto) {
        const token = await this.getToken();
        if (!token)
            return {
                errorCode: ErrorCode.NOT_FOUND,
                message: 'No se pudo obtener el token de Keycloak ServiceHub',
            };

        try {
            const response = await axios.post(this.usersUrl(), dto, {
                headers: this.authHeaders(token),
            });
            // Keycloak returns 201 with no body; the ID comes back in the Location header
            const location = response.headers['location'] as string | undefined;
            const userId = location ? location.split('/').pop() : null;

            if (!userId)
                return {
                    errorCode: ErrorCode.NOT_FOUND,
                    message:
                        'No se pudo obtener el ID del usuario del sistema municipal, por favor comuníquese con el administrador',
                    userId,
                };
            return {
                errorCode: ErrorCode.NONE,
                message: 'Usuario creado exitosamente',
                userId,
            };
        } catch (error: any) {
            return this._buildKeycloakError('createUser', error);
        }
    }

    /**
     * Creates a user in the Municipality realm and extracts the new id from the
     * Keycloak `Location` response header.
     *
     * @param dto User payload to create in Keycloak.
     * @returns Result envelope with `errorCode`, `message` and the created `userId`.
     */
    async createUserMunicipality(dto: CreateKeycloakUserDto) {
        const token = await this.getTokenMunicipalityK();
        if (!token)
            return {
                errorCode: ErrorCode.NOT_FOUND,
                message: 'No se pudo obtener el token de Keycloak Municipal',
            };

        try {
            const response = await axios.post(
                this.usersUrlMunicipality(),
                dto,
                {
                    headers: this.authHeaders(token),
                },
            );
            // Keycloak returns 201 with no body; the ID comes back in the Location header
            const location = response.headers['location'] as string | undefined;
            const userId = location ? location.split('/').pop() : null;

            if (!userId)
                return {
                    errorCode: ErrorCode.NOT_FOUND,
                    message:
                        'No se pudo obtener el ID del usuario del sistema municipal, por favor comuníquese con el administrador',
                    userId,
                };
            return {
                errorCode: ErrorCode.NONE,
                message: 'Usuario creado exitosamente',
                userId,
            };
        } catch (error: any) {
            return this._buildKeycloakError('createUserMunicipality', error);
        }
    }

    /**
     * Updates an existing user in the ServiceHub realm.
     *
     * @param id Keycloak user id to update.
     * @param dto Partial user payload to apply.
     * @returns Result envelope with `errorCode` and `message`.
     */
    async updateUser(id: string, dto: UpdateKeycloakUserDto) {
        const token = await this.getToken();
        if (!token)
            return {
                errorCode: ErrorCode.NOT_FOUND,
                message: 'No se pudo obtener el token de Keycloak Municipal',
            };

        try {
            await axios.put(this.usersUrl(id), dto, {
                headers: this.authHeaders(token),
            });
            return {
                errorCode: ErrorCode.NONE,
                message: 'Usuario actualizado exitosamente',
            };
        } catch (error: any) {
            return this._buildKeycloakError('updateUser', error);
        }
    }

    /**
     * Updates an existing user in the Municipality realm.
     *
     * @param id Keycloak user id to update.
     * @param dto Partial user payload to apply.
     * @returns Result envelope with `errorCode` and `message`.
     */
    async updateUserMunicipality(id: string, dto: UpdateKeycloakUserDto) {
        const token = await this.getTokenMunicipalityK();
        if (!token)
            return {
                errorCode: ErrorCode.NOT_FOUND,
                message: 'No se pudo obtener el token de Keycloak Municipal',
            };

        try {
            await axios.put(this.usersUrlMunicipality(id), dto, {
                headers: this.authHeaders(token),
            });
            return {
                errorCode: ErrorCode.NONE,
                message: 'Usuario actualizado exitosamente',
            };
        } catch (error: any) {
            return this._buildKeycloakError('updateUserMunicipality', error);
        }
    }

    /**
     * Enables or disables a citizen account (ServiceHub realm).
     * Only the `enabled` field is sent; Keycloak performs a partial merge, so the
     * rest of the user data (name, email, attributes) is left untouched.
     *
     * @param id Keycloak user id to enable or disable.
     * @param enabled `true` to enable the account, `false` to disable it.
     * @returns Result envelope with `errorCode`, `message` and the new `enabled` state.
     */
    async setUserStatus(id: string, enabled: boolean) {
        const token = await this.getToken();
        if (!token)
            return {
                errorCode: ErrorCode.NOT_FOUND,
                message: 'No se pudo obtener el token de Keycloak ServiceHub',
            };

        try {
            await axios.put(
                this.usersUrl(id),
                { enabled },
                {
                    headers: this.authHeaders(token),
                },
            );
            return {
                errorCode: ErrorCode.NONE,
                message: enabled
                    ? 'Cuenta habilitada exitosamente'
                    : 'Cuenta deshabilitada exitosamente',
                enabled,
            };
        } catch (error: any) {
            return this._buildKeycloakError('setUserStatus', error);
        }
    }

    /**
     * Enables or disables a municipal employee account (Municipio K realm).
     *
     * @param id Keycloak user id to enable or disable.
     * @param enabled `true` to enable the account, `false` to disable it.
     * @returns Result envelope with `errorCode`, `message` and the new `enabled` state.
     */
    async setUserStatusMunicipality(id: string, enabled: boolean) {
        const token = await this.getTokenMunicipalityK();
        if (!token)
            return {
                errorCode: ErrorCode.NOT_FOUND,
                message: 'No se pudo obtener el token de Keycloak Municipal',
            };

        try {
            await axios.put(
                this.usersUrlMunicipality(id),
                { enabled },
                {
                    headers: this.authHeaders(token),
                },
            );
            return {
                errorCode: ErrorCode.NONE,
                message: enabled
                    ? 'Cuenta habilitada exitosamente'
                    : 'Cuenta deshabilitada exitosamente',
                enabled,
            };
        } catch (error: any) {
            return this._buildKeycloakError('setUserStatusMunicipality', error);
        }
    }

    /**
     * Looks up a user by exact username in the ServiceHub realm.
     *
     * @param username Username to search for (exact match).
     * @returns Result envelope with `errorCode`, `message` and the matching `data`.
     */
    async findByUsername(username: string) {
        const token = await this.getToken();
        if (!token)
            return {
                errorCode: ErrorCode.NOT_FOUND,
                message: 'No se pudo obtener el token de Keycloak ServiceHub',
            };

        try {
            const { data } = await axios.get(this.usersUrl(), {
                headers: this.authHeaders(token),
                params: { username, exact: true },
            });

            if (data && data.length > 0)
                return {
                    errorCode: ErrorCode.NONE,
                    message: 'Usuario encontrado exitosamente',
                    data,
                };
            return {
                errorCode: ErrorCode.NOT_FOUND,
                message: 'Usuario no encontrado',
                data,
            };
        } catch (error: any) {
            return this._buildKeycloakError('findByUsername', error);
        }
    }

    /**
     * Looks up a user by exact username in the Municipality realm.
     *
     * @param username Username to search for (exact match).
     * @returns Result envelope with `errorCode`, `message` and the matching `data`.
     */
    async findByUsernameMunicipality(username: string) {
        const token = await this.getTokenMunicipalityK();
        if (!token)
            return {
                errorCode: ErrorCode.NOT_FOUND,
                message: 'No se pudo obtener el token de Keycloak ServiceHub',
            };

        try {
            const { data } = await axios.get(this.usersUrlMunicipality(), {
                headers: this.authHeaders(token),
                params: { username, exact: true },
            });

            if (data && data.length > 0)
                return {
                    errorCode: ErrorCode.NONE,
                    message: 'Usuario encontrado exitosamente',
                    data,
                };
            return {
                errorCode: ErrorCode.NOT_FOUND,
                message: 'Usuario no encontrado',
                data,
            };
        } catch (error: any) {
            return this._buildKeycloakError('findByUsername', error);
        }
    }

    /**
     * Performs a Keycloak password-grant login against the given token endpoint
     * and returns the token envelope. Shared by the ServiceHub and Municipality
     * login flows, which differ only in client credentials, realm URL and the
     * warning message logged on failure.
     *
     * @param clientId Keycloak client id for the target realm.
     * @param clientSecret Keycloak client secret for the target realm.
     * @param tokenUrl Fully built `openid-connect/token` endpoint.
     * @param dto Username/password supplied by the caller.
     * @param warnMessage Message logged when the login fails.
     * @returns Token envelope on success; otherwise `throwKeycloakError` rethrows.
     */
    private async _passwordGrantLogin(
        clientId: string,
        clientSecret: string,
        tokenUrl: string,
        dto: LoginKeycloakClientDto,
        warnMessage: string,
    ) {
        try {
            const params = new URLSearchParams({
                grant_type: 'password',
                client_id: clientId,
                client_secret: clientSecret,
                username: dto.username,
                password: dto.password,
            });

            const { data } = await axios.post(tokenUrl, params.toString(), {
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                },
            });

            return {
                errorCode: ErrorCode.NONE,
                access_token: data.access_token,
                refresh_token: data.refresh_token,
                expires_in: data.expires_in,
                refresh_expires_in: data.refresh_expires_in,
            };
        } catch (error: any) {
            this.logger.warn(warnMessage);
            return this._buildKeycloakError('loginClient', error);
        }
    }

    /**
     * Authenticates a ServiceHub realm client via the password grant.
     *
     * @param dto Username/password credentials supplied by the client.
     * @returns Token envelope on success, or an error envelope on failure.
     */
    async loginClient(dto: LoginKeycloakClientDto) {
        const tokenUrl = `${this.gimBaseUrlLogin}/realms/${this.gim2RealmServiceHub}/protocol/openid-connect/token`;
        return this._passwordGrantLogin(
            this.configService.get<string>('GIM_CLIENT_ID_SERVICE_HUB'),
            this.configService.get<string>('GIM_CLIENT_SECRET_SERVICE_HUB'),
            tokenUrl,
            dto,
            'Error logging into Keycloak',
        );
    }

    /**
     * Authenticates a Municipality realm client via the password grant.
     *
     * @param dto Username/password credentials supplied by the client.
     * @returns Token envelope on success, or an error envelope on failure.
     */
    async loginClientMunicipality(dto: LoginKeycloakClientDto) {
        const tokenUrl = `${this.gimBaseUrlLoginMunicipality}/realms/${this.gim2RealmMunicipality}/protocol/openid-connect/token`;
        return this._passwordGrantLogin(
            this.configService.get<string>('GIM_CLIENT_ID_K'),
            this.configService.get<string>('GIM_CLIENT_SECRET_K'),
            tokenUrl,
            dto,
            'Error logging into Keycloak (municipal employees)',
        );
    }

    /**
     * Looks up a user by exact email in the ServiceHub realm.
     *
     * @param email Email address to search for (exact match).
     * @returns Result envelope with `errorCode`, `message` and the matching `data`.
     */
    async findByEmail(email: string) {
        const token = await this.getToken();
        if (!token)
            return {
                errorCode: ErrorCode.NOT_FOUND,
                message: 'No se pudo obtener el token de Keycloak ServiceHub',
            };

        try {
            const { data } = await axios.get(this.usersUrl(), {
                headers: this.authHeaders(token),
                params: { email, exact: true },
            });

            if (data && data.length > 0)
                return {
                    errorCode: ErrorCode.NONE,
                    message: 'Usuario encontrado exitosamente',
                    data,
                };
            return {
                errorCode: ErrorCode.NOT_FOUND,
                message: 'Usuario no encontrado',
                data,
            };
        } catch (error: any) {
            return this._buildKeycloakError('findByEmail', error);
        }
    }

    /**
     * Generates a temporary password for the ServiceHub user matching the given
     * email, resets it in Keycloak and emails the new credentials.
     *
     * @param email Email address of the user whose password is reset.
     * @returns Result envelope with `errorCode`, `message`, the `userId` and whether the email was sent.
     */
    async setUserPassword(email: string) {
        email = email?.trim();
        if (!email)
            return {
                errorCode: ErrorCode.NOT_FOUND,
                message: 'El parámetro email es requerido',
            };

        const token = await this.getToken();
        if (!token)
            return {
                errorCode: ErrorCode.NOT_FOUND,
                message: 'No se pudo obtener el token de Keycloak ServiceHub',
            };

        try {
            const { data } = await axios.get(this.usersUrl(), {
                headers: this.authHeaders(token),
                params: { email, exact: true },
            });

            if (!data || data.length === 0)
                return {
                    errorCode: ErrorCode.NOT_FOUND,
                    message: 'Usuario no encontrado',
                    data,
                };

            const user = data[0];
            const userId = user.id;
            const fullName =
                `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim() ||
                user.username ||
                email;
            const newPassword = this._generateCode();

            await axios.put(
                `${this.usersUrl(userId)}/reset-password`,
                { type: 'password', value: newPassword, temporary: false },
                { headers: this.authHeaders(token) },
            );

            const emailSent = await this._sendPasswordEmail(
                fullName,
                email,
                newPassword,
            );
            return {
                errorCode: emailSent ? ErrorCode.NONE : ErrorCode.RESPONSE,
                message: emailSent
                    ? 'Contraseña temporal generada y enviada al correo'
                    : 'Contraseña temporal generada pero no se pudo enviar el correo',
                userId,
                emailSent,
            };
        } catch (error: any) {
            return this._buildKeycloakError('setUserPassword', error);
        }
    }

    /**
     * Generates a temporary password for the Municipality user matching the given
     * email, resets it in Keycloak and emails the new credentials.
     *
     * @param email Email address of the user whose password is reset.
     * @returns Result envelope with `errorCode`, `message`, the `userId` and whether the email was sent.
     */
    async setUserPasswordMunicipality(email: string) {
        email = email?.trim();
        if (!email)
            return {
                errorCode: ErrorCode.NOT_FOUND,
                message: 'El parámetro email es requerido',
            };

        const token = await this.getTokenMunicipalityK();
        if (!token)
            return {
                errorCode: ErrorCode.NOT_FOUND,
                message: 'No se pudo obtener el token de Keycloak Municipal',
            };

        try {
            const { data } = await axios.get(this.usersUrlMunicipality(), {
                headers: this.authHeaders(token),
                params: { email, exact: true },
            });

            if (!data || data.length === 0)
                return {
                    errorCode: ErrorCode.NOT_FOUND,
                    message: 'Usuario no encontrado',
                    data,
                };

            const user = data[0];
            const userId = user.id;
            const fullName =
                `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim() ||
                user.username ||
                email;
            const newPassword = this._generateCode();
            await axios.put(
                `${this.usersUrlMunicipality(userId)}/reset-password`,
                { type: 'password', value: newPassword, temporary: false },
                { headers: this.authHeaders(token) },
            );

            const emailSent = await this._sendPasswordEmail(
                fullName,
                email,
                newPassword,
            );

            return {
                errorCode: emailSent ? ErrorCode.NONE : ErrorCode.RESPONSE,
                message: emailSent
                    ? 'Contraseña temporal generada y enviada al correo'
                    : 'Contraseña temporal generada pero no se pudo enviar el correo',
                userId,
                emailSent,
            };
        } catch (error: any) {
            return this._buildKeycloakError(
                'setUserPasswordMunicipality',
                error,
            );
        }
    }

    /**
     * Sets a new (permanent) password for the ServiceHub user matching the given
     * email.
     *
     * @param email Email address of the user whose password is changed.
     * @param newPassword New password value to set in Keycloak.
     * @returns Result envelope with `errorCode`, `message` and the affected `userId`.
     */
    async changePassword(email: string, newPassword: string) {
        email = email?.trim();
        if (!email || !newPassword)
            return {
                errorCode: ErrorCode.NOT_FOUND,
                message: 'email y newPassword son requeridos',
            };

        const token = await this.getToken();
        if (!token)
            return {
                errorCode: ErrorCode.NOT_FOUND,
                message: 'No se pudo obtener el token de Keycloak ServiceHub',
            };

        try {
            const { data } = await axios.get(this.usersUrl(), {
                headers: this.authHeaders(token),
                params: { email, exact: true },
            });

            if (!data || data.length === 0)
                return {
                    errorCode: ErrorCode.NOT_FOUND,
                    message: 'Usuario no encontrado',
                };

            const userId = data[0].id;

            console.log('url', `${this.usersUrl(userId)}/reset-password`);

            await axios.put(
                `${this.usersUrl(userId)}/reset-password`,
                { type: 'password', value: newPassword, temporary: false },
                { headers: this.authHeaders(token) },
            );

            return {
                errorCode: ErrorCode.NONE,
                message: 'Contraseña actualizada exitosamente',
                userId,
            };
        } catch (error: any) {
            return this._buildKeycloakError('changePassword', error);
        }
    }

    /**
     * Sets a new (permanent) password for the Municipality user matching the given
     * email.
     *
     * @param email Email address of the user whose password is changed.
     * @param newPassword New password value to set in Keycloak.
     * @returns Result envelope with `errorCode`, `message` and the affected `userId`.
     */
    async changePasswordMunicipality(email: string, newPassword: string) {
        email = email?.trim();
        if (!email || !newPassword)
            return {
                errorCode: ErrorCode.NOT_FOUND,
                message: 'email y newPassword son requeridos',
            };

        const token = await this.getTokenMunicipalityK();
        if (!token)
            return {
                errorCode: ErrorCode.NOT_FOUND,
                message: 'No se pudo obtener el token de Keycloak Municipal',
            };

        try {
            const { data } = await axios.get(this.usersUrlMunicipality(), {
                headers: this.authHeaders(token),
                params: { email, exact: true },
            });

            if (!data || data.length === 0)
                return {
                    errorCode: ErrorCode.NOT_FOUND,
                    message: 'Usuario no encontrado',
                };

            const userId = data[0].id;

            await axios.put(
                `${this.usersUrlMunicipality(userId)}/reset-password`,
                { type: 'password', value: newPassword, temporary: false },
                { headers: this.authHeaders(token) },
            );

            return {
                errorCode: ErrorCode.NONE,
                message: 'Contraseña actualizada exitosamente',
                userId,
            };
        } catch (error: any) {
            return this._buildKeycloakError(
                'changePasswordMunicipality',
                error,
            );
        }
    }

    /**
     * Sends the password-recovery email through the configured auth domain.
     *
     * @param fullName Recipient full name shown in the email.
     * @param email Recipient email address.
     * @param password Temporary password to include in the email.
     * @param phone Optional recipient phone number.
     * @returns Promise resolving to `true` when the email was sent successfully, `false` otherwise.
     */
    private async _sendPasswordEmail(
        fullName: string,
        email: string,
        password: string,
        phone?: string,
    ): Promise<boolean> {
        if (!this.dominioAuth) {
            this.logger.warn(
                'DOMINIO_AUTH not configured, password recovery email cannot be dispatched',
            );
            return false;
        }

        const url = `${this.dominioAuth}api/auth/auth/mail/send-password`;
        this.logger.log(
            `POST ${url} | body: ${JSON.stringify({ fullName, email, phone })}`,
        );

        try {
            const response = await axios.post(
                url,
                { fullName, email, password, phone },
                {
                    headers: { 'Content-Type': 'application/json' },
                    validateStatus: () => true,
                },
            );
            this.logger.log(
                `send-password response | status: ${response.status} | body: ${JSON.stringify(response.data)}`,
            );
            return (
                response.status >= 200 &&
                response.status < 300 &&
                Boolean(response.data?.ok)
            );
        } catch (error: any) {
            this.logger.error(
                `Error sending email to ${email} | code: ${error?.code} | status: ${error?.response?.status} | data: ${JSON.stringify(error?.response?.data)} | msg: ${error?.message}`,
            );
            return false;
        }
    }

    /**
     * Looks up a user by the `identification` attribute in the ServiceHub realm.
     *
     * @param identification Identification attribute value to search for.
     * @returns Result envelope with `errorCode`, `message` and the matching `data`.
     */
    async findByIdentification(identification: string) {
        const token = await this.getToken();
        if (!token)
            return {
                errorCode: ErrorCode.NOT_FOUND,
                message: 'No se pudo obtener el token de Keycloak ServiceHub',
            };

        try {
            const { data } = await axios.get(this.usersUrl(), {
                headers: this.authHeaders(token),
                params: { q: `identification:${identification}` },
            });

            if (data && data.length > 0)
                return {
                    errorCode: ErrorCode.NONE,
                    message: 'Usuario encontrado exitosamente',
                    data,
                };
            return {
                errorCode: ErrorCode.NOT_FOUND,
                message: 'Usuario no encontrado',
                data,
            };
        } catch (error: any) {
            return this._buildKeycloakError('findByIdentification', error);
        }
    }

    /**
     * Looks up a user by the `identification` attribute in the Municipality realm.
     *
     * @param identification Identification attribute value to search for.
     * @returns Result envelope with `errorCode`, `message` and the matching `data`.
     */
    async findByIdentificationMunicipality(identification: string) {
        const token = await this.getTokenMunicipalityK();
        if (!token)
            return {
                errorCode: ErrorCode.NOT_FOUND,
                message: 'No se pudo obtener el token de Keycloak Municipal',
            };

        try {
            const { data } = await axios.get(this.usersUrlMunicipality(), {
                headers: this.authHeaders(token),
                params: { q: `identification:${identification}` },
            });

            if (data && data.length > 0)
                return {
                    errorCode: ErrorCode.NONE,
                    message: 'Usuario encontrado exitosamente',
                    data,
                };
            return {
                errorCode: ErrorCode.NOT_FOUND,
                message: 'Usuario no encontrado',
                data,
            };
        } catch (error: any) {
            return this._buildKeycloakError(
                'findByIdentificationMunicipality',
                error,
            );
        }
    }

    /**
     * Triggers the Keycloak `execute-actions-email` flow (UPDATE_PASSWORD) for a
     * ServiceHub user.
     *
     * @param userId Keycloak user id that receives the action email.
     * @returns An error envelope on failure; otherwise resolves with no value.
     */
    async executeActionsEmail(userId: string) {
        const token = await this.getToken();
        if (!token)
            return {
                errorCode: ErrorCode.NOT_FOUND,
                message: 'No se pudo obtener el token de Keycloak ServiceHub',
            };

        try {
            await axios.put(
                `${this.usersUrl(userId)}/execute-actions-email`,
                ['UPDATE_PASSWORD'],
                {
                    headers: this.authHeaders(token),
                },
            );
        } catch (error: any) {
            return this._buildKeycloakError('executeActionsEmail', error);
        }
    }

    /**
     * Triggers the Keycloak `execute-actions-email` flow (VERIFY_EMAIL) for a
     * Municipality user.
     *
     * @param userId Keycloak user id that receives the action email.
     * @returns Result envelope with `errorCode` and an optional `message`.
     */
    async executeActionsEmailMunicipality(
        userId: string,
    ): Promise<{ errorCode: ErrorCode; message?: string }> {
        const token = await this.getTokenMunicipalityK();
        if (!token)
            return {
                errorCode: ErrorCode.NOT_FOUND,
                message: 'No se pudo obtener el token de Keycloak Municipal',
            };

        try {
            await axios.put(
                `${this.usersUrlMunicipality(userId)}/execute-actions-email`,
                ['VERIFY_EMAIL'],
                {
                    headers: this.authHeaders(token),
                },
            );
            return {
                errorCode: ErrorCode.NONE,
                message: 'Correo de verificación enviado exitosamente',
            };
        } catch (error: any) {
            return this._buildKeycloakError(
                'executeActionsEmailMunicipality',
                error,
            );
        }
    }

    /**
     * Looks up a user by exact email in the Municipality realm.
     *
     * @param email Email address to search for (exact match).
     * @returns Result envelope with `errorCode`, `message` and the matching `data`.
     */
    async findByEmailMunicipality(email: string) {
        const token = await this.getTokenMunicipalityK();
        if (!token)
            return {
                errorCode: ErrorCode.NOT_FOUND,
                message: 'No se pudo obtener el token de Keycloak Municipal',
            };

        try {
            const { data } = await axios.get(this.usersUrlMunicipality(), {
                headers: this.authHeaders(token),
                params: { email, exact: true },
            });

            if (data && data.length > 0)
                return {
                    errorCode: ErrorCode.NONE,
                    message: 'Usuario encontrado exitosamente',
                    data,
                };
            return {
                errorCode: ErrorCode.NOT_FOUND,
                message: 'Usuario no encontrado',
                data,
            };
        } catch (error: any) {
            return this._buildKeycloakError('findByEmail', error);
        }
    }

    /**
     * Generates a random 6-digit numeric code used as a temporary password.
     *
     * @returns A 6-character string of random digits.
     */
    private _generateCode() {
        let code = '';
        for (let i = 0; i < 6; i++) {
            code += Math.floor(Math.random() * 10);
        }
        return code;
    }
}
