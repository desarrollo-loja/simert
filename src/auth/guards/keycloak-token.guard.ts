import { CanActivate, ExecutionContext, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import axios from 'axios';
import { IdTypeUser } from 'src/common/glob/id/id_type_user';
import { TypeRol } from 'src/common/glob/type/type_rol';

const MUNICIPALITY_ROLES = [TypeRol.ADMIN, TypeRol.CONTROLLER, TypeRol.SUPERVISOR];

@Injectable()
export class KeycloakTokenGuard implements CanActivate {
    private readonly logger = new Logger(KeycloakTokenGuard.name);

    constructor(private readonly jwtService: JwtService) {}

    private get baseUrl(): string {
        return `${process.env.GIM_BASE_URL_LOGIN}/realms/${process.env.GIM2_REALM_SERVICE_HUB}/protocol/openid-connect`;
    }

    private get baseUrlMunicipality(): string {
        return `${process.env.GIM_BASE_URL_LOGIN}/realms/${process.env.GIM2_REALM_MUNICIPIO_K}/protocol/openid-connect`;
    }

    private get clientParams() {
        return {
            client_id: process.env.GIM_CLIENT_ID_SERVICE_HUB,
            client_secret: process.env.GIM_CLIENT_SECRET_SERVICE_HUB,
        };
    }

    private get clientParamsMunicipality() {
        return {
            client_id: process.env.GIM_CLIENT_ID_K,
            client_secret: process.env.GIM_CLIENT_SECRET_K,
        };
    }

    private readonly REFRESH_THRESHOLD_SECONDS = 1 * 60; // 1 minutos

    private isMunicipalEmployee(roles: TypeRol[]): boolean {
        return roles?.some(role => MUNICIPALITY_ROLES.includes(role)) ?? false;
    }

    private isMunicipal(idTypeUser: IdTypeUser): boolean {
        return idTypeUser === IdTypeUser.MUNICIPALITY;
    }

    async canActivate(context: ExecutionContext): Promise<boolean> {
        const req = context.switchToHttp().getRequest();
        const res = context.switchToHttp().getResponse();
        const user = req.user;

        if (!user?.kcToken) {
            throw new UnauthorizedException('Keycloak token not found');
        }

        // const isMunicipality = this.isMunicipalEmployee(user.roles);
        const isMunicipality = this.isMunicipal(user.idTypeUser);
        const kcBaseUrl = isMunicipality ? this.baseUrlMunicipality : this.baseUrl;
        const kcClientParams = isMunicipality ? this.clientParamsMunicipality : this.clientParams;

        const introspection = await this.introspect(user.kcToken, kcBaseUrl, kcClientParams);

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

    private async doRefresh(user: any, res: any, kcBaseUrl: string, kcClientParams: Record<string, string>): Promise<boolean> {
        if (!user.kcRefreshToken) {
            throw new UnauthorizedException('Keycloak session expired');
        }

        const refreshed = await this.refresh(user.kcRefreshToken, kcBaseUrl, kcClientParams);
        if (!refreshed) {
            throw new UnauthorizedException('Keycloak session expired');
        }

        const { iat, exp, ...payload } = user;
        const newJwt = this.jwtService.sign({
            ...payload,
            kcToken: refreshed.access_token,
            kcRefreshToken: refreshed.refresh_token,
        });

        res.setHeader('x-token', newJwt);
        return true;
    }

    private async introspect(token: string, kcBaseUrl: string, kcClientParams: Record<string, string>): Promise<{ active: boolean; exp?: number }> {
        try {
            const params = new URLSearchParams({ token, ...kcClientParams });
            const { data } = await axios.post(
                `${kcBaseUrl}/token/introspect`,
                params.toString(),
                { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } },
            );
            return { active: data?.active === true, exp: data?.exp };
        } catch (error) {
            this.logger.error(`Keycloak introspect error: ${error?.message}`);
            return { active: false };
        }
    }

    private async refresh(refreshToken: string, kcBaseUrl: string, kcClientParams: Record<string, string>): Promise<{ access_token: string; refresh_token: string } | null> {
        try {
            const params = new URLSearchParams({
                grant_type: 'refresh_token',
                refresh_token: refreshToken,
                ...kcClientParams,
            });
            const { data } = await axios.post(
                `${kcBaseUrl}/token`,
                params.toString(),
                { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } },
            );
            return data;
        } catch (error) {
            const status = error?.response?.status;
            const detail = JSON.stringify(error?.response?.data ?? error?.message);
            this.logger.error(`Keycloak refresh error [${status}]: ${detail}`);
            return null;
        }
    }
}
