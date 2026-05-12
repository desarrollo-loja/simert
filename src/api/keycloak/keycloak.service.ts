import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { CommonGimService } from 'src/common/common.gim.service';
import { CreateKeycloakUserDto } from 'src/common/dto/create-keycloak-user.dto';
import { LoginKeycloakClientDto } from 'src/common/dto/login-keycloak-client.dto';
import { UpdateKeycloakUserDto } from 'src/common/dto/update-keycloak-user.dto';
import { ErrorCode } from 'src/common/glob/error';

// Margen de seguridad: renovar el token 30 segundos antes de que expire
const TOKEN_REFRESH_MARGIN_MS = 30_000;

@Injectable()
export class KeycloakService {
  private readonly logger = new Logger(KeycloakService.name);
  private readonly gimBaseUrlLogin: string;
  private readonly gimBaseUrlLoginMunicipality: string;
  private readonly gim2RealmServiceHub: string;
  private readonly gim2RealmMunicipality: string;

  // Caché del token de ServiceHub
  private serviceHubToken: string | null = null;
  private serviceHubTokenExpiresAt = 0; // timestamp en ms

  constructor(
    private readonly commonGimService: CommonGimService,
    private readonly configService: ConfigService,
  ) {
    this.gimBaseUrlLogin = this.configService.get<string>('GIM_BASE_URL_LOGIN'); // Default or Env
    this.gim2RealmServiceHub = this.configService.get<string>('GIM2_REALM_SERVICE_HUB'); // Default or Env
    this.gimBaseUrlLoginMunicipality = this.configService.get<string>('GIM_BASE_URL_LOGIN'); // Default or Env
    this.gim2RealmMunicipality = this.configService.get<string>('GIM2_REALM_MUNICIPIO_K'); // Default or Env
  }

  // ─── Token con caché inteligente ─────────────────────────────────────────────

  private async getToken(): Promise<string> {
    const now = Date.now();

    if (this.serviceHubToken && now < this.serviceHubTokenExpiresAt - TOKEN_REFRESH_MARGIN_MS) {
      return this.serviceHubToken;
    }

    this.logger.log('Renovando token de Keycloak ServiceHub...');
    const result = await this.commonGimService.loginGimServiceHub();

    if (result.errorCode !== ErrorCode.NONE || !result.data) {
      return null;
    }

    this.serviceHubToken = result.data.access_token;
    // expires_in viene en segundos
    this.serviceHubTokenExpiresAt = now + result.data.expires_in * 1000;
    this.logger.log(`Token renovado. Expira en ${result.data.expires_in}s`);

    return this.serviceHubToken;
  }

  // Siempre obtiene un token nuevo para empleados municipales (realm municipio K, client_credentials)
  private async getTokenMunicipalityK(): Promise<string> {
    this.logger.log('Obteniendo token de Keycloak MunicipalityK...');
    const result = await this.commonGimService.loginGimMunicipalityK();

    if (result.errorCode !== ErrorCode.NONE || !result.data) {
      return null;
    }

    return result.data.access_token;
  }

  private authHeaders(token: string) {
    return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
  }

  private usersUrl(id?: string): string {
    const base = `${this.gimBaseUrlLogin}/admin/realms/${this.gim2RealmServiceHub}/users`;
    return id ? `${base}/${id}` : base;
  }

  private usersUrlMunicipality(id?: string): string {
    const base = `${this.gimBaseUrlLogin}/admin/realms/${this.gim2RealmMunicipality}/users`;
    return id ? `${base}/${id}` : base;
  }

  private throwKeycloakError(context: string, error: any): never {
    const status: number = error?.response?.status ?? HttpStatus.INTERNAL_SERVER_ERROR;
    const isConnectionError = ['ECONNABORTED', 'ETIMEDOUT', 'ECONNREFUSED', 'ENOTFOUND'].includes(error?.code);

    this.logger.error(`Error ${context} | status: ${status} | code: ${error?.code} | msg: ${error?.message}`);

    if (isConnectionError) {
      console.log('1111111');
      throw new HttpException(
        'No hay comunicación con el sistema municipal, por favor comuníquese con el administrador',
        HttpStatus.GATEWAY_TIMEOUT,
      );
    }

    if (status === 401) {
      console.log('2222222');
      if (error?.response?.data?.error === 'invalid_grant') {
        throw new HttpException(
          'Credenciales incorrectas, por favor verifique su usuario y contraseña',
          HttpStatus.UNAUTHORIZED,
        );
      }
      throw new HttpException(
        'Usuario no autorizado en el sistema municipal, por favor comuníquese con el administrador',
        HttpStatus.UNAUTHORIZED,
      );
    }

    if (status === 500) {
      console.log('3333333');
      throw new HttpException(
        'Error con el sistema municipal, por favor comuníquese con el administrador',
        HttpStatus.BAD_GATEWAY,
      );
    }

    if (status === 409) {
      console.log('4444444');
      throw new HttpException(
        'El usuario ya existe en el sistema municipal, por favor comuníquese con el administrador',
        HttpStatus.CONFLICT,
      );
    }

    const rawMessage: string =
      error?.response?.data?.message ??
      error?.response?.data?.error ??
      error?.message ??
      'Error inesperado en Keycloak';

    if (rawMessage.includes('Account disabled')) {
      console.log('5555555');
      throw new HttpException(
        'Su cuenta está deshabilitada en el sistema municipal. Por favor comuníquese con el administrador',
        HttpStatus.FORBIDDEN,
      );
    }

    console.log('5555555');
    throw new HttpException(
      'Error al verificar el usuario en el municipio. Por favor comuníquese con el administrador.',
      status,
    );
  }

  // ─── Endpoints ───────────────────────────────────────────────────────────────

  async createUser(dto: CreateKeycloakUserDto) {
    const token = await this.getToken();
    if (!token)
      return { errorCode: ErrorCode.NOT_FOUND, message: 'No se pudo obtener el token de Keycloak ServiceHub' };

    try {
      const response = await axios.post(this.usersUrl(), dto, {
        headers: this.authHeaders(token),
      });
      // Keycloak devuelve 201 sin body; el ID viene en Location header
      const location = response.headers['location'] as string | undefined;
      const userId = location ? location.split('/').pop() : null;

      if (!userId)
        return { errorCode: ErrorCode.NOT_FOUND, message: 'No se pudo obtener el ID del usuario del sistema municipal, por favor comuníquese con el administrador', userId };
      return { errorCode: ErrorCode.NONE, message: 'Usuario creado exitosamente', userId };

    } catch (error: any) {
      return this.throwKeycloakError('createUser', error);
    }
  }

  async createUserMunicipality(dto: CreateKeycloakUserDto) {
    const token = await this.getTokenMunicipalityK();
    if (!token)
      return { errorCode: ErrorCode.NOT_FOUND, message: 'No se pudo obtener el token de Keycloak Municipal' };

    try {
      const response = await axios.post(this.usersUrlMunicipality(), dto, {
        headers: this.authHeaders(token),
      });
      // Keycloak devuelve 201 sin body; el ID viene en Location header
      const location = response.headers['location'] as string | undefined;
      const userId = location ? location.split('/').pop() : null;

      if (!userId)
        return { errorCode: ErrorCode.NOT_FOUND, message: 'No se pudo obtener el ID del usuario del sistema municipal, por favor comuníquese con el administrador', userId };
      return { errorCode: ErrorCode.NONE, message: 'Usuario creado exitosamente', userId };

    } catch (error: any) {
      return this.throwKeycloakError('createUserMunicipality', error);
    }
  }

  async updateUser(id: string, dto: UpdateKeycloakUserDto) {
    const token = await this.getToken();
    if (!token)
      return { errorCode: ErrorCode.NOT_FOUND, message: 'No se pudo obtener el token de Keycloak Municipal' };

    try {
      await axios.put(this.usersUrl(id), dto, {
        headers: this.authHeaders(token),
      });
      return { errorCode: ErrorCode.NONE, message: 'Usuario actualizado exitosamente' };
    } catch (error: any) {
      return this.throwKeycloakError('updateUser', error);
    }
  }

  async updateUserMunicipality(id: string, dto: UpdateKeycloakUserDto) {
    const token = await this.getTokenMunicipalityK();
    if (!token)
      return { errorCode: ErrorCode.NOT_FOUND, message: 'No se pudo obtener el token de Keycloak Municipal' };

    try {
      await axios.put(this.usersUrlMunicipality(id), dto, {
        headers: this.authHeaders(token),
      });
      return { errorCode: ErrorCode.NONE, message: 'Usuario actualizado exitosamente' };
    } catch (error: any) {
      return this.throwKeycloakError('updateUserMunicipality', error);
    }
  }

  async findByUsername(username: string) {
    const token = await this.getToken();
    if (!token)
      return { errorCode: ErrorCode.NOT_FOUND, message: 'No se pudo obtener el token de Keycloak ServiceHub' };

    try {
      const { data } = await axios.get(this.usersUrl(), {
        headers: this.authHeaders(token),
        params: { username, exact: true },
      });

      if (data && data.length > 0)
        return { errorCode: ErrorCode.NONE, message: 'Usuario encontrado exitosamente', data };
      return { errorCode: ErrorCode.NOT_FOUND, message: 'Usuario no encontrado', data };

    } catch (error: any) {
      return this.throwKeycloakError('findByUsername', error);
    }
  }

  async findByUsernameMunicipality(username: string) {
    const token = await this.getTokenMunicipalityK();
    if (!token)
      return { errorCode: ErrorCode.NOT_FOUND, message: 'No se pudo obtener el token de Keycloak ServiceHub' };

    try {
      const { data } = await axios.get(this.usersUrlMunicipality(), {
        headers: this.authHeaders(token),
        params: { username, exact: true },
      });

      if (data && data.length > 0)
        return { errorCode: ErrorCode.NONE, message: 'Usuario encontrado exitosamente', data };
      return { errorCode: ErrorCode.NOT_FOUND, message: 'Usuario no encontrado', data };

    } catch (error: any) {
      return this.throwKeycloakError('findByUsername', error);
    }
  }

  async loginClient(dto: LoginKeycloakClientDto) {
    try {

      console.log('Ingreso a la verificación del usuario normal')

      const params = new URLSearchParams({
        grant_type: 'password',
        client_id: this.configService.get<string>('GIM_CLIENT_ID_SERVICE_HUB'),
        client_secret: this.configService.get<string>('GIM_CLIENT_SECRET_SERVICE_HUB'),
        username: dto.username,
        password: dto.password,
      });

      const url = `${this.gimBaseUrlLogin}/realms/${this.gim2RealmServiceHub}/protocol/openid-connect/token`;
      const { data } = await axios.post(url, params.toString(), {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      });

      return {
        errorCode: ErrorCode.NONE,
        access_token: data.access_token,
        refresh_token: data.refresh_token,
        expires_in: data.expires_in,
        refresh_expires_in: data.refresh_expires_in,
      };
    } catch (error: any) {
      console.log(error)
      this.logger.warn('Error al iniciar sesión en Keycloak');
      return this.throwKeycloakError('loginClient', error);
    }
  }

  async loginClientMunicipality(dto: LoginKeycloakClientDto) {
    try {

      console.log('Ingreso a la verificación del usuario del municipio')

      const params = new URLSearchParams({
        grant_type: 'password',
        client_id: this.configService.get<string>('GIM_CLIENT_ID_K'),
        client_secret: this.configService.get<string>('GIM_CLIENT_SECRET_K'),
        username: dto.username,
        password: dto.password,
      });

      const url = `${this.gimBaseUrlLoginMunicipality}/realms/${this.gim2RealmMunicipality}/protocol/openid-connect/token`;
      const { data } = await axios.post(url, params.toString(), {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      });

      return {
        errorCode: ErrorCode.NONE,
        access_token: data.access_token,
        refresh_token: data.refresh_token,
        expires_in: data.expires_in,
        refresh_expires_in: data.refresh_expires_in,
      };
    } catch (error: any) {
      this.logger.warn('Error al iniciar sesión en Keycloak empleados municipales');
      return this.throwKeycloakError('loginClient', error);
    }
  }

  async findByEmail(email: string) {
    const token = await this.getToken();
    if (!token)
      return { errorCode: ErrorCode.NOT_FOUND, message: 'No se pudo obtener el token de Keycloak ServiceHub' };

    try {
      const { data } = await axios.get(this.usersUrl(), {
        headers: this.authHeaders(token),
        params: { email, exact: true },
      });

      if (data && data.length > 0)
        return { errorCode: ErrorCode.NONE, message: 'Usuario encontrado exitosamente', data };
      return { errorCode: ErrorCode.NOT_FOUND, message: 'Usuario no encontrado', data };

    } catch (error: any) {
      return this.throwKeycloakError('findByEmail', error);
    }
  }

  async findByEmailEnviarEmail(email: string) {
    const token = await this.getToken();
    if (!token)
      return { errorCode: ErrorCode.NOT_FOUND, message: 'No se pudo obtener el token de Keycloak ServiceHub' };

    try {
      const { data } = await axios.get(this.usersUrl(), {
        headers: this.authHeaders(token),
        params: { email, exact: true },
      });

      if (data && data.length > 0)
        // const idEmail = "a5d11e4d-6f1a-4f77-8646-9ce134246115";
        await this.executeActionsEmail("a5d11e4d-6f1a-4f77-8646-9ce134246115");
      // return { errorCode: ErrorCode.NOT_FOUND, message: 'Usuario no encontrado', data };

    } catch (error: any) {
      return this.throwKeycloakError('findByEmailEnviarEmail', error);
    }
  }

  async findByIdentification(identification: string) {
    const token = await this.getToken();
    if (!token)
      return { errorCode: ErrorCode.NOT_FOUND, message: 'No se pudo obtener el token de Keycloak ServiceHub' };

    try {
      const { data } = await axios.get(this.usersUrl(), {
        headers: this.authHeaders(token),
        params: { q: `identification:${identification}` },
      });

      if (data && data.length > 0)
        return { errorCode: ErrorCode.NONE, message: 'Usuario encontrado exitosamente', data };
      return { errorCode: ErrorCode.NOT_FOUND, message: 'Usuario no encontrado', data };

    } catch (error: any) {
      return this.throwKeycloakError('findByIdentification', error);
    }
  }

  async findByIdentificationMunicipality(identification: string) {
    const token = await this.getTokenMunicipalityK();
    if (!token)
      return { errorCode: ErrorCode.NOT_FOUND, message: 'No se pudo obtener el token de Keycloak Municipal' };

    try {
      const { data } = await axios.get(this.usersUrlMunicipality(), {
        headers: this.authHeaders(token),
        params: { q: `identification:${identification}` },
      });

      if (data && data.length > 0)
        return { errorCode: ErrorCode.NONE, message: 'Usuario encontrado exitosamente', data };
      return { errorCode: ErrorCode.NOT_FOUND, message: 'Usuario no encontrado', data };

    } catch (error: any) {
      return this.throwKeycloakError('findByIdentificationMunicipality', error);
    }
  }

  async executeActionsEmail(userId: string): Promise<{ errorCode: ErrorCode; message?: string }> {
    const token = await this.getToken();
    if (!token)
      return { errorCode: ErrorCode.NOT_FOUND, message: 'No se pudo obtener el token de Keycloak ServiceHub' };

    try {
      const { data } = await axios.put(`${this.usersUrl(userId)}/execute-actions-email`, ['UPDATE_PASSWORD'], {
        headers: this.authHeaders(token),
      });
      console.log(data);
      return { errorCode: ErrorCode.NONE, message: 'Correo de verificación enviado exitosamente' };
    } catch (error: any) {
      return this.throwKeycloakError('executeActionsEmail', error);
    }
  }

  async executeActionsEmailMunicipality(userId: string): Promise<{ errorCode: ErrorCode; message?: string }> {
    const token = await this.getTokenMunicipalityK();
    if (!token)
      return { errorCode: ErrorCode.NOT_FOUND, message: 'No se pudo obtener el token de Keycloak Municipal' };

    try {
      await axios.put(`${this.usersUrlMunicipality(userId)}/execute-actions-email`, ['VERIFY_EMAIL'], {
        headers: this.authHeaders(token),
      });
      return { errorCode: ErrorCode.NONE, message: 'Correo de verificación enviado exitosamente' };
    } catch (error: any) {
      return this.throwKeycloakError('executeActionsEmailMunicipality', error);
    }
  }

  async findByEmailMunicipality(email: string) {
    const token = await this.getTokenMunicipalityK();
    if (!token)
      return { errorCode: ErrorCode.NOT_FOUND, message: 'No se pudo obtener el token de Keycloak Municipal' };

    try {
      const { data } = await axios.get(this.usersUrlMunicipality(), {
        headers: this.authHeaders(token),
        params: { email, exact: true },
      });

      if (data && data.length > 0)
        return { errorCode: ErrorCode.NONE, message: 'Usuario encontrado exitosamente', data };
      return { errorCode: ErrorCode.NOT_FOUND, message: 'Usuario no encontrado', data };

    } catch (error: any) {
      return this.throwKeycloakError('findByEmail', error);
    }
  }
}
