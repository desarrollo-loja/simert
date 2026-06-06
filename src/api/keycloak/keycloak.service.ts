import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { CommonGimService } from 'src/common/common.gim.service';
import { CreateKeycloakUserDto } from 'src/common/dto/create-keycloak-user.dto';
import { LoginKeycloakClientDto } from 'src/common/dto/login-keycloak-client.dto';
import { UpdateKeycloakUserDto } from 'src/common/dto/update-keycloak-user.dto';
import { ErrorCode } from 'src/common/glob/error';

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
   *
   * @param commonGimService
   * @param configService
   */
  constructor(
    private readonly commonGimService: CommonGimService,
    private readonly configService: ConfigService,
  ) {
    this.gimBaseUrlLogin = this.configService.get<string>('GIM_BASE_URL_LOGIN'); // Default or Env
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
   *
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
   *
   */
  private async getTokenMunicipalityK(): Promise<string> {
    const result = await this.commonGimService.loginGimMunicipalityK();

    if (result.errorCode !== ErrorCode.NONE || !result.data) {
      return null;
    }

    return result.data.access_token;
  }

  /**
   *
   * @param token
   */
  private authHeaders(token: string) {
    return {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    };
  }

  /**
   *
   * @param id
   */
  private usersUrl(id?: string): string {
    const base = `${this.gimBaseUrlLogin}/admin/realms/${this.gim2RealmServiceHub}/users`;
    return id ? `${base}/${id}` : base;
  }

  /**
   *
   * @param id
   */
  private usersUrlMunicipality(id?: string): string {
    const base = `${this.gimBaseUrlLogin}/admin/realms/${this.gim2RealmMunicipality}/users`;
    return id ? `${base}/${id}` : base;
  }

  /**
   * Builds a normalized error envelope for a failed Keycloak / GIM request.
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
  private _buildKeycloakError(
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
   *
   * @param dto
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
   *
   * @param dto
   */
  async createUserMunicipality(dto: CreateKeycloakUserDto) {
    const token = await this.getTokenMunicipalityK();
    if (!token)
      return {
        errorCode: ErrorCode.NOT_FOUND,
        message: 'No se pudo obtener el token de Keycloak Municipal',
      };

    try {
      const response = await axios.post(this.usersUrlMunicipality(), dto, {
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
      return this._buildKeycloakError('createUserMunicipality', error);
    }
  }

  /**
   *
   * @param id
   * @param dto
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
   *
   * @param id
   * @param dto
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
   * Habilita o deshabilita una cuenta de ciudadano (realm ServiceHub).
   * Envía solo el campo `enabled`; Keycloak hace un merge parcial, así que
   * el resto de datos del usuario (nombre, email, atributos) no se tocan.
   * @param id
   * @param enabled
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
   * Habilita o deshabilita una cuenta de empleado municipal (realm Municipio K).
   * @param id
   * @param enabled
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
   *
   * @param username
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
   *
   * @param username
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
      this.logger.warn(warnMessage);
      return this._buildKeycloakError('loginClient', error);
    }
  }

  /**
   *
   * @param dto
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
   *
   * @param dto
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
   *
   * @param email
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
   *
   * @param email
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
   *
   * @param email
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
      return this._buildKeycloakError('setUserPasswordMunicipality', error);
    }
  }

  /**
   *
   * @param email
   * @param newPassword
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
   *
   * @param email
   * @param newPassword
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
      return this._buildKeycloakError('changePasswordMunicipality', error);
    }
  }

  /**
   *
   * @param fullName
   * @param email
   * @param password
   * @param phone
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
   *
   * @param identification
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
   *
   * @param identification
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
   *
   * @param userId
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
   *
   * @param userId
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
      return this._buildKeycloakError('executeActionsEmailMunicipality', error);
    }
  }

  /**
   *
   * @param email
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
   *
   */
  private _generateCode() {
    let code = '';
    for (let i = 0; i < 6; i++) {
      code += Math.floor(Math.random() * 10);
    }
    return code;
  }
}
