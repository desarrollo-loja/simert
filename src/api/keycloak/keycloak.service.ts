import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { CommonGimService } from 'src/common/common.gim.service';
import { CreateKeycloakUserDto } from 'src/common/dto/create-keycloak-user.dto';
import { LoginKeycloakClientDto } from 'src/common/dto/login-keycloak-client.dto';
import { UpdateKeycloakUserDto } from 'src/common/dto/update-keycloak-user.dto';
import { ErrorCode } from 'src/common/glob/error';
import { LoggerService } from 'src/common/logger.service.ts';

import { FindAccountRefDto, FindAccountsDto } from './dto/find-accounts.dto';

// Safety margin: refresh the token 30 seconds before it expires
const TOKEN_REFRESH_MARGIN_MS = 30_000;

// How many account lookups run at once in the batch resolver. Bounded so
// verifying a table page never turns into a burst against Keycloak.
const BATCH_LOOKUP_CONCURRENCY = 6;

/**
 * Realm an admin token belongs to: the ServiceHub realm used for client
 * accounts, or the Municipio K realm used for municipal employees.
 */
type TokenScope = 'serviceHub' | 'municipality';

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

    // In-flight re-login per realm, shared by every request that got a 401 at
    // the same time so the burst produces one login instead of one per request.
    private tokenRefresh: Record<TokenScope, Promise<string | null> | null> = {
        serviceHub: null,
        municipality: null,
    };

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
            // CommonGimService lives in the shared library and has no audit
            // logger of its own, so the login failure is recorded here — the
            // first point that can see it and reach LoggerService. Without this
            // the caller only reports "no token", losing the actual cause.
            this._logKeycloakFailure({
                method: 'getToken',
                endpoint: `${process.env.GIM_BASE_URL_LOGIN}/realms/${this.gim2RealmServiceHub}/protocol/openid-connect/token`,
                httpStatus: result.httpStatus,
                errorCode: result.errorCode ?? ErrorCode.UNAUTHORIZED,
                message:
                    result.message ??
                    'No se pudo obtener el token de Keycloak ServiceHub',
            });
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
            this._logKeycloakFailure({
                method: 'getTokenMunicipalityK',
                endpoint: `${process.env.GIM_BASE_URL_LOGIN}/realms/${this.gim2RealmMunicipality}/protocol/openid-connect/token`,
                httpStatus: result.httpStatus,
                errorCode: result.errorCode ?? ErrorCode.UNAUTHORIZED,
                message:
                    result.message ??
                    'No se pudo obtener el token de Keycloak Municipal',
            });
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

    // ─── 401 recovery ───────────────────────────────────────────────────────────

    /**
     * Tells whether an outbound error is Keycloak rejecting the Bearer token,
     * which in practice means the admin token expired between the moment it was
     * read and the moment the request reached the realm.
     *
     * @param error Error raised by axios.
     * @returns `true` when Keycloak answered 401.
     */
    private _isUnauthorized(error: any): boolean {
        return error?.response?.status === 401;
    }

    /**
     * Forces a new admin token for the given realm, bypassing the ServiceHub
     * cache (whose expiry estimate is what just proved wrong). Concurrent
     * callers share the same in-flight login per realm, so a burst of
     * expired-token requests triggers one login instead of one per request.
     *
     * @param scope Realm whose token must be reissued.
     * @returns The freshly issued token, or `null` when the login failed.
     */
    private async _forceToken(scope: TokenScope): Promise<string | null> {
        if (!this.tokenRefresh[scope]) {
            this.tokenRefresh[scope] = (async () => {
                if (scope === 'serviceHub') {
                    // Drop the cache first or `getToken` would hand back the
                    // very token Keycloak just rejected.
                    this.serviceHubToken = null;
                    this.serviceHubTokenExpiresAt = 0;
                    return this.getToken();
                }
                return this.getTokenMunicipalityK();
            })()
                .catch(() => null)
                .finally(() => {
                    this.tokenRefresh[scope] = null;
                });
        }

        return this.tokenRefresh[scope];
    }

    /**
     * Runs an authenticated Keycloak call and, when the realm answers 401
     * because the token expired, reissues it and replays the very same request
     * once with the new token.
     *
     * The retry is skipped when the login could not issue a *different* token:
     * that means the credentials — not the expiry — are the problem, and
     * replaying would only produce a second 401.
     *
     * @typeParam T Result type of the wrapped call.
     * @param scope Realm the request authenticates against.
     * @param token Token used by the first attempt.
     * @param context Operation name, used in the retry log line.
     * @param run Performs the request with the token it receives; invoked at most twice.
     * @returns The result of the call, from the first attempt or the replay.
     */
    private async _retryOn401<T>(
        scope: TokenScope,
        token: string,
        context: string,
        run: (token: string) => Promise<T>,
    ): Promise<T> {
        try {
            return await run(token);
        } catch (error: any) {
            if (!this._isUnauthorized(error)) throw error;

            const freshToken = await this._forceToken(scope);
            if (!freshToken || freshToken === token) throw error;

            this.logger.warn(
                `Token Keycloak ${scope} caducado (401) en ${context}: token renovado, reintentando la petición`,
            );

            return run(freshToken);
        }
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
     * records the failure in the `logskeycloak` collection.
     *
     * Mapping is delegated to {@link _mapKeycloakError} (behavior unchanged).
     * Every failure is audited, 401s included: a rejected credential is still a
     * Keycloak outcome worth having on record, and telling apart "the password
     * was wrong" from "the realm rejected our client" is only possible if both
     * are stored. The audit write is fire-and-forget and never alters the
     * returned envelope.
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

        this._logKeycloakFailure({
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

        return result;
    }

    /**
     * Writes a Keycloak failure to the `logskeycloak` collection. Single entry
     * point for every audit write in this service; fire-and-forget, so it never
     * alters the caller flow.
     *
     * @param fields Failure details recorded in the audit document.
     * @param fields.resource Failing resource; defaults to `KEYCLOAK`.
     * @param fields.method Operation that failed.
     * @param fields.endpoint Keycloak endpoint URL invoked.
     * @param fields.httpStatus HTTP status returned, when there is one.
     * @param fields.errorCode Mapped application error code.
     * @param fields.message Human-readable failure reason.
     * @param fields.response Raw response body received.
     * @param fields.exception Exception summary, for thrown errors.
     */
    private _logKeycloakFailure(fields: {
        resource?: string;
        method: string;
        endpoint?: string;
        httpStatus?: number;
        errorCode?: ErrorCode;
        message?: string;
        response?: any;
        exception?: string;
    }): void {
        this.loggerService.saveLogsKeycloakLogger({
            resource: 'KEYCLOAK',
            service: 'KeycloakService',
            ...fields,
        });
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
            const response = await this._retryOn401(
                'serviceHub',
                token,
                'createUser',
                (tk) =>
                    axios.post(this.usersUrl(), dto, {
                        headers: this.authHeaders(tk),
                    }),
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
            const response = await this._retryOn401(
                'municipality',
                token,
                'createUserMunicipality',
                (tk) =>
                    axios.post(this.usersUrlMunicipality(), dto, {
                        headers: this.authHeaders(tk),
                    }),
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
            await this._retryOn401('serviceHub', token, 'updateUser', (tk) =>
                axios.put(this.usersUrl(id), dto, {
                    headers: this.authHeaders(tk),
                }),
            );
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
            await this._retryOn401(
                'municipality',
                token,
                'updateUserMunicipality',
                (tk) =>
                    axios.put(this.usersUrlMunicipality(id), dto, {
                        headers: this.authHeaders(tk),
                    }),
            );
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
            await this._retryOn401('serviceHub', token, 'setUserStatus', (tk) =>
                axios.put(
                    this.usersUrl(id),
                    { enabled },
                    {
                        headers: this.authHeaders(tk),
                    },
                ),
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
            await this._retryOn401(
                'municipality',
                token,
                'setUserStatusMunicipality',
                (tk) =>
                    axios.put(
                        this.usersUrlMunicipality(id),
                        { enabled },
                        {
                            headers: this.authHeaders(tk),
                        },
                    ),
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
            const { data } = await this._retryOn401(
                'serviceHub',
                token,
                'findByUsername',
                (tk) =>
                    axios.get(this.usersUrl(), {
                        headers: this.authHeaders(tk),
                        params: { username, exact: true },
                    }),
            );

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
            const { data } = await this._retryOn401(
                'municipality',
                token,
                'findByUsername',
                (tk) =>
                    axios.get(this.usersUrlMunicipality(), {
                        headers: this.authHeaders(tk),
                        params: { username, exact: true },
                    }),
            );

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
            const { data } = await this._retryOn401(
                'serviceHub',
                token,
                'findByEmail',
                (tk) =>
                    axios.get(this.usersUrl(), {
                        headers: this.authHeaders(tk),
                        params: { email, exact: true },
                    }),
            );

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
            const { data } = await this._retryOn401(
                'serviceHub',
                token,
                'setUserPassword',
                (tk) =>
                    axios.get(this.usersUrl(), {
                        headers: this.authHeaders(tk),
                        params: { email, exact: true },
                    }),
            );

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

            await this._retryOn401(
                'serviceHub',
                token,
                'setUserPassword',
                (tk) =>
                    axios.put(
                        `${this.usersUrl(userId)}/reset-password`,
                        {
                            type: 'password',
                            value: newPassword,
                            temporary: false,
                        },
                        { headers: this.authHeaders(tk) },
                    ),
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
            const { data } = await this._retryOn401(
                'municipality',
                token,
                'setUserPasswordMunicipality',
                (tk) =>
                    axios.get(this.usersUrlMunicipality(), {
                        headers: this.authHeaders(tk),
                        params: { email, exact: true },
                    }),
            );

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
            await this._retryOn401(
                'municipality',
                token,
                'setUserPasswordMunicipality',
                (tk) =>
                    axios.put(
                        `${this.usersUrlMunicipality(userId)}/reset-password`,
                        {
                            type: 'password',
                            value: newPassword,
                            temporary: false,
                        },
                        { headers: this.authHeaders(tk) },
                    ),
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
            const { data } = await this._retryOn401(
                'serviceHub',
                token,
                'changePassword',
                (tk) =>
                    axios.get(this.usersUrl(), {
                        headers: this.authHeaders(tk),
                        params: { email, exact: true },
                    }),
            );

            if (!data || data.length === 0)
                return {
                    errorCode: ErrorCode.NOT_FOUND,
                    message: 'Usuario no encontrado',
                };

            const userId = data[0].id;

            console.log('url', `${this.usersUrl(userId)}/reset-password`);

            await this._retryOn401(
                'serviceHub',
                token,
                'changePassword',
                (tk) =>
                    axios.put(
                        `${this.usersUrl(userId)}/reset-password`,
                        {
                            type: 'password',
                            value: newPassword,
                            temporary: false,
                        },
                        { headers: this.authHeaders(tk) },
                    ),
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
            const { data } = await this._retryOn401(
                'municipality',
                token,
                'changePasswordMunicipality',
                (tk) =>
                    axios.get(this.usersUrlMunicipality(), {
                        headers: this.authHeaders(tk),
                        params: { email, exact: true },
                    }),
            );

            if (!data || data.length === 0)
                return {
                    errorCode: ErrorCode.NOT_FOUND,
                    message: 'Usuario no encontrado',
                };

            const userId = data[0].id;

            await this._retryOn401(
                'municipality',
                token,
                'changePasswordMunicipality',
                (tk) =>
                    axios.put(
                        `${this.usersUrlMunicipality(userId)}/reset-password`,
                        {
                            type: 'password',
                            value: newPassword,
                            temporary: false,
                        },
                        { headers: this.authHeaders(tk) },
                    ),
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
        const endpoint = `${this.dominioAuth}api/auth/auth/mail/send-password`;

        if (!this.dominioAuth) {
            this.logger.warn(
                'DOMINIO_AUTH not configured, password recovery email cannot be dispatched',
            );
            this._logKeycloakFailure({
                resource: 'AUTH_MAIL',
                method: '_sendPasswordEmail',
                endpoint,
                errorCode: ErrorCode.SYSTEM_INACTIVE,
                message:
                    'DOMINIO_AUTH no configurado, no se pudo enviar el correo de recuperación',
            });
            return false;
        }

        this.logger.log(
            `POST ${endpoint} | body: ${JSON.stringify({ fullName, email, phone })}`,
        );

        try {
            const response = await axios.post(
                endpoint,
                { fullName, email, password, phone },
                {
                    headers: { 'Content-Type': 'application/json' },
                    validateStatus: () => true,
                },
            );
            this.logger.log(
                `send-password response | status: ${response.status} | body: ${JSON.stringify(response.data)}`,
            );

            const sent =
                response.status >= 200 &&
                response.status < 300 &&
                Boolean(response.data?.ok);

            // `validateStatus` accepts every status, so a rejected send never
            // throws; audit it here or it would leave no trace at all.
            if (!sent) {
                this._logKeycloakFailure({
                    resource: 'AUTH_MAIL',
                    method: '_sendPasswordEmail',
                    endpoint,
                    httpStatus: response.status,
                    errorCode: ErrorCode.RESPONSE,
                    message:
                        response.data?.message ??
                        'No se pudo enviar el correo de recuperación de contraseña',
                    response: response.data,
                });
            }

            return sent;
        } catch (error: any) {
            this.logger.error(
                `Error sending email to ${email} | code: ${error?.code} | status: ${error?.response?.status} | data: ${JSON.stringify(error?.response?.data)} | msg: ${error?.message}`,
            );
            this._logKeycloakFailure({
                resource: 'AUTH_MAIL',
                method: '_sendPasswordEmail',
                endpoint,
                httpStatus: error?.response?.status,
                errorCode: ErrorCode.RESPONSE,
                message:
                    error?.message ??
                    'No se pudo enviar el correo de recuperación de contraseña',
                response: error?.response?.data,
                exception: error?.name
                    ? `${error.name}: ${error.message}`
                    : String(error),
            });
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
            const { data } = await this._retryOn401(
                'serviceHub',
                token,
                'findByIdentification',
                (tk) =>
                    axios.get(this.usersUrl(), {
                        headers: this.authHeaders(tk),
                        params: { q: `identification:${identification}` },
                    }),
            );

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
            const { data } = await this._retryOn401(
                'municipality',
                token,
                'findByIdentificationMunicipality',
                (tk) =>
                    axios.get(this.usersUrlMunicipality(), {
                        headers: this.authHeaders(tk),
                        params: { q: `identification:${identification}` },
                    }),
            );

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
            await this._retryOn401(
                'serviceHub',
                token,
                'executeActionsEmail',
                (tk) =>
                    axios.put(
                        `${this.usersUrl(userId)}/execute-actions-email`,
                        ['UPDATE_PASSWORD'],
                        {
                            headers: this.authHeaders(tk),
                        },
                    ),
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
            await this._retryOn401(
                'municipality',
                token,
                'executeActionsEmailMunicipality',
                (tk) =>
                    axios.put(
                        `${this.usersUrlMunicipality(userId)}/execute-actions-email`,
                        ['VERIFY_EMAIL'],
                        {
                            headers: this.authHeaders(tk),
                        },
                    ),
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
            const { data } = await this._retryOn401(
                'municipality',
                token,
                'findByEmail',
                (tk) =>
                    axios.get(this.usersUrlMunicipality(), {
                        headers: this.authHeaders(tk),
                        params: { email, exact: true },
                    }),
            );

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
     * Runs one exact-match user query against a realm with an already-obtained
     * token.
     *
     * Deliberately does not go through the `findBy*` methods: each of those
     * resolves its own token and audits its own failure, which for a batch of
     * 20 rows would mean 20 token requests and, during an outage, 20 identical
     * entries in `logskeycloak` for a single incident.
     *
     * The batch token is read once, so a long batch can outlive it; the lookup
     * therefore goes through {@link _retryOn401} like every other call. Rows
     * still holding the stale token each pay one 401 before retrying, but the
     * re-login itself happens only once for the whole batch.
     *
     * @param scope Realm the batch token belongs to.
     * @param url Realm users URL to query.
     * @param token Bearer token already obtained for that realm.
     * @param params Exact-match query (`{ username }` or `{ email }`).
     * @returns The first matching account, or `null`.
     */
    private async _queryAccount(
        scope: TokenScope,
        url: string,
        token: string,
        params: Record<string, string>,
    ): Promise<any | null> {
        const { data } = await this._retryOn401(
            scope,
            token,
            'findAccounts',
            (tk) =>
                axios.get(url, {
                    headers: this.authHeaders(tk),
                    params: { ...params, exact: true },
                }),
        );
        return Array.isArray(data) && data.length > 0 ? data[0] : null;
    }

    /**
     * Resolves one account, trying the username first and the email second.
     *
     * The order matters for the caller: both lookups are exact, so resolving by
     * email alone would make an email comparison meaningless — the account
     * found that way always carries the email it was searched with. Starting
     * from the username lets a changed email surface as a real difference.
     *
     * @param user Reference holding the correlation id and the search keys.
     * @param scope Realm the batch token belongs to.
     * @param url Realm users URL to query.
     * @param token Bearer token already obtained for that realm.
     * @returns The correlation id, the matched account and which key found it.
     */
    private async _resolveAccount(
        user: FindAccountRefDto,
        scope: TokenScope,
        url: string,
        token: string,
    ): Promise<{ ref: string; account: any | null; matchedBy: string | null }> {
        const username = (user.username ?? '').trim();
        const email = (user.email ?? '').trim();

        if (username) {
            const account = await this._queryAccount(scope, url, token, {
                username,
            });
            if (account)
                return { ref: user.ref, account, matchedBy: 'usuario' };
        }

        if (email) {
            const account = await this._queryAccount(scope, url, token, {
                email,
            });
            if (account) return { ref: user.ref, account, matchedBy: 'correo' };
        }

        return { ref: user.ref, account: null, matchedBy: null };
    }

    /**
     * Resolves a page's worth of accounts in one call.
     *
     * Exists so an admin table can show, at a glance, which of its rows drifted
     * from the identity provider: the browser makes a single request instead of
     * one per row. The realm token is obtained once for the whole batch, and
     * lookups run with bounded concurrency
     * ({@link BATCH_LOOKUP_CONCURRENCY}). A single failing account resolves to
     * `null` rather than sinking the batch — a partial answer is far more
     * useful here than an error.
     *
     * @param dto Accounts to resolve, each with its correlation id.
     * @param isMunicipality Whether to search the Municipality realm.
     * @returns Envelope whose `data` holds one entry per requested account.
     */
    async findAccounts(dto: FindAccountsDto, isMunicipality = false) {
        const users = dto?.users ?? [];

        // One token per batch. Resolving it inside each lookup would re-request
        // it per row for the Municipality realm (that one is never cached), and
        // on failure would audit the same outage once per row.
        const token = isMunicipality
            ? await this.getTokenMunicipalityK()
            : await this.getToken();
        if (!token)
            return {
                errorCode: ErrorCode.NOT_FOUND,
                message: isMunicipality
                    ? 'No se pudo obtener el token de Keycloak Municipal'
                    : 'No se pudo obtener el token de Keycloak ServiceHub',
                data: [],
            };

        const scope: TokenScope = isMunicipality
            ? 'municipality'
            : 'serviceHub';
        const url = isMunicipality
            ? this.usersUrlMunicipality()
            : this.usersUrl();
        const results: Array<{
            ref: string;
            account: any | null;
            matchedBy: string | null;
        }> = [];

        for (let i = 0; i < users.length; i += BATCH_LOOKUP_CONCURRENCY) {
            const slice = users.slice(i, i + BATCH_LOOKUP_CONCURRENCY);
            const resolved = await Promise.all(
                slice.map(async (user) => {
                    try {
                        return await this._resolveAccount(
                            user,
                            scope,
                            url,
                            token,
                        );
                    } catch (error) {
                        // Logged to the application log, not audited: this is a
                        // read-only check, and one entry per unresolved row
                        // would bury the real integration failures.
                        this.logger.error(
                            `findAccounts: no se pudo resolver ${user.ref}: ${error}`,
                        );
                        return {
                            ref: user.ref,
                            account: null,
                            matchedBy: null,
                        };
                    }
                }),
            );
            results.push(...resolved);
        }

        return {
            errorCode: ErrorCode.NONE,
            message: 'Consulta realizada',
            data: results,
        };
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
