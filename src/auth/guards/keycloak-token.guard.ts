import {
    CanActivate,
    ExecutionContext,
    Injectable,
    Logger,
    UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import axios from 'axios';
import { IdTypeUser } from 'src/common/glob/id/id_type_user';
import { TypeRol } from 'src/common/glob/type/type_rol';

const MUNICIPALITY_ROLES = [
    TypeRol.ADMIN,
    TypeRol.CONTROLLER,
    TypeRol.SUPERVISOR,
];

/**
 * Guard that validates the Keycloak access token attached to the request and
 * transparently refreshes it when it is expired or close to expiring. It routes
 * the introspection/refresh calls to the proper realm (Service Hub or
 * Municipality K) depending on the authenticated user type.
 */
@Injectable()
export class KeycloakTokenGuard implements CanActivate {
    private readonly logger = new Logger(KeycloakTokenGuard.name);

    /**
     * Creates the guard instance.
     * @param jwtService Service used to sign refreshed JWTs returned to the client.
     */
    constructor(private readonly jwtService: JwtService) {}

    /**
     * Builds the OpenID Connect base URL for the Service Hub realm.
     * @returns The Service Hub OpenID Connect endpoint base URL.
     */
    private get baseUrl(): string {
        return `${process.env.GIM_BASE_URL_LOGIN}/realms/${process.env.GIM2_REALM_SERVICE_HUB}/protocol/openid-connect`;
    }

    /**
     * Builds the OpenID Connect base URL for the Municipality K realm.
     * @returns The Municipality K OpenID Connect endpoint base URL.
     */
    private get baseUrlMunicipality(): string {
        return `${process.env.GIM_BASE_URL_LOGIN}/realms/${process.env.GIM2_REALM_MUNICIPIO_K}/protocol/openid-connect`;
    }

    /**
     * Provides the OAuth client credentials for the Service Hub realm.
     * @returns The client id and client secret for the Service Hub client.
     */
    private get clientParams() {
        return {
            client_id: process.env.GIM_CLIENT_ID_SERVICE_HUB,
            client_secret: process.env.GIM_CLIENT_SECRET_SERVICE_HUB,
        };
    }

    /**
     * Provides the OAuth client credentials for the Municipality K realm.
     * @returns The client id and client secret for the Municipality K client.
     */
    private get clientParamsMunicipality() {
        return {
            client_id: process.env.GIM_CLIENT_ID_K,
            client_secret: process.env.GIM_CLIENT_SECRET_K,
        };
    }

    private readonly REFRESH_THRESHOLD_SECONDS = 1 * 60; // 1 minute

    /**
     * Determines whether the given roles correspond to a municipal employee.
     * @param roles Roles assigned to the authenticated user.
     * @returns True if any role belongs to the municipality role set, otherwise false.
     */
    private isMunicipalEmployee(roles: TypeRol[]): boolean {
        return (
            roles?.some((role) => MUNICIPALITY_ROLES.includes(role)) ?? false
        );
    }

    /**
     * Determines whether the user type corresponds to a municipality user.
     * @param idTypeUser User type identifier to evaluate.
     * @returns True if the user type is municipality, otherwise false.
     */
    private isMunicipal(idTypeUser: IdTypeUser): boolean {
        return idTypeUser === IdTypeUser.MUNICIPALITY;
    }

    /**
     * Validates the Keycloak token on the incoming request, refreshing it when
     * it is inactive or about to expire.
     * @param context Execution context providing access to the HTTP request and response.
     * @returns Promise resolving to true when access is granted.
     * @throws UnauthorizedException When the token is missing or the session cannot be refreshed.
     */
    async canActivate(context: ExecutionContext): Promise<boolean> {
        const req = context.switchToHttp().getRequest();
        const res = context.switchToHttp().getResponse();
        const user = req.user;

        if (!user?.kcToken) {
            throw new UnauthorizedException('Keycloak token not found');
        }

        const isMunicipality = this.isMunicipal(user.idTypeUser);
        const kcBaseUrl = isMunicipality
            ? this.baseUrlMunicipality
            : this.baseUrl;
        const kcClientParams = isMunicipality
            ? this.clientParamsMunicipality
            : this.clientParams;

        const introspection = await this.introspect(
            user.kcToken,
            kcBaseUrl,
            kcClientParams,
        );

        if (!introspection.active) {
            if (!user.kcRefreshToken) {
                throw new UnauthorizedException('Keycloak session expired');
            }
            return this.doRefresh(user, res, kcBaseUrl, kcClientParams);
        }

        const secondsLeft = introspection.exp - Math.floor(Date.now() / 1000);
        if (secondsLeft <= this.REFRESH_THRESHOLD_SECONDS) {
            return this.doRefresh(user, res, kcBaseUrl, kcClientParams);
        }

        return true;
    }

    /**
     * Refreshes the Keycloak session and emits a freshly signed JWT through the
     * response `x-token` header.
     * @param user Authenticated user payload carrying the current Keycloak refresh token.
     * @param res HTTP response used to return the newly signed JWT.
     * @param kcBaseUrl Realm-specific OpenID Connect base URL.
     * @param kcClientParams OAuth client credentials for the target realm.
     * @returns Promise resolving to true once the session is refreshed.
     * @throws UnauthorizedException When the refresh token is missing or the refresh fails.
     */
    private async doRefresh(
        user: any,
        res: any,
        kcBaseUrl: string,
        kcClientParams: Record<string, string>,
    ): Promise<boolean> {
        if (!user.kcRefreshToken) {
            throw new UnauthorizedException('Keycloak session expired');
        }

        const refreshed = await this.refresh(
            user.kcRefreshToken,
            kcBaseUrl,
            kcClientParams,
        );
        if (!refreshed) {
            throw new UnauthorizedException('Keycloak session expired');
        }

        const { iat: _iat, exp: _exp, ...payload } = user;
        const newJwt = this.jwtService.sign({
            ...payload,
            kcToken: refreshed.access_token,
            kcRefreshToken: refreshed.refresh_token,
        });

        res.setHeader('x-token', newJwt);
        return true;
    }

    /**
     * Introspects a Keycloak access token to check whether it is still active.
     * @param token Keycloak access token to introspect.
     * @param kcBaseUrl Realm-specific OpenID Connect base URL.
     * @param kcClientParams OAuth client credentials for the target realm.
     * @returns Promise resolving to the token active state and optional expiration time.
     */
    private async introspect(
        token: string,
        kcBaseUrl: string,
        kcClientParams: Record<string, string>,
    ): Promise<{ active: boolean; exp?: number }> {
        try {
            const params = new URLSearchParams({ token, ...kcClientParams });
            const { data } = await axios.post(
                `${kcBaseUrl}/token/introspect`,
                params.toString(),
                {
                    headers: {
                        'Content-Type': 'application/x-www-form-urlencoded',
                    },
                },
            );
            return { active: data?.active === true, exp: data?.exp };
        } catch (error) {
            this.logger.error(`Keycloak introspect error: ${error?.message}`);
            return { active: false };
        }
    }

    /**
     * Exchanges a Keycloak refresh token for a new pair of access and refresh tokens.
     * @param refreshToken Keycloak refresh token to exchange.
     * @param kcBaseUrl Realm-specific OpenID Connect base URL.
     * @param kcClientParams OAuth client credentials for the target realm.
     * @returns Promise resolving to the new token pair, or null when the refresh fails.
     */
    private async refresh(
        refreshToken: string,
        kcBaseUrl: string,
        kcClientParams: Record<string, string>,
    ): Promise<{ access_token: string; refresh_token: string } | null> {
        try {
            const params = new URLSearchParams({
                grant_type: 'refresh_token',
                refresh_token: refreshToken,
                ...kcClientParams,
            });
            const { data } = await axios.post(
                `${kcBaseUrl}/token`,
                params.toString(),
                {
                    headers: {
                        'Content-Type': 'application/x-www-form-urlencoded',
                    },
                },
            );
            return data;
        } catch (error) {
            const status = error?.response?.status;
            const detail = JSON.stringify(
                error?.response?.data ?? error?.message,
            );
            this.logger.error(`Keycloak refresh error [${status}]: ${detail}`);
            return null;
        }
    }
}
