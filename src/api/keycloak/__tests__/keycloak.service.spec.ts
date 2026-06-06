import { ErrorCode } from 'src/common/glob/error';

jest.mock('axios', () => ({
  __esModule: true,
  default: {
    post: jest.fn(),
    get: jest.fn(),
    put: jest.fn(),
  },
}));
import axios from 'axios';

import { KeycloakService } from '../keycloak.service';

const buildConfigMock = (overrides: Record<string, string | undefined> = {}) => {
  const defaults: Record<string, string | undefined> = {
    GIM_BASE_URL_LOGIN: 'http://kc.test',
    GIM2_REALM_SERVICE_HUB: 'service-hub',
    GIM2_REALM_MUNICIPIO_K: 'municipio',
    DOMINIO_AUTH: 'http://auth.test/',
    GIM_CLIENT_ID_SERVICE_HUB: 'cid-sh',
    GIM_CLIENT_SECRET_SERVICE_HUB: 'csec-sh',
    GIM_CLIENT_ID_K: 'cid-k',
    GIM_CLIENT_SECRET_K: 'csec-k',
    ...overrides,
  };
  return { get: jest.fn((key: string) => defaults[key]) } as any;
};

const buildCommonGimMock = (overrides: any = {}) => ({
  loginGimServiceHub: jest.fn(async () => ({
    errorCode: ErrorCode.NONE,
    data: { access_token: 'sh-token', expires_in: 60 },
  })),
  loginGimMunicipalityK: jest.fn(async () => ({
    errorCode: ErrorCode.NONE,
    data: { access_token: 'mun-token', expires_in: 60 },
  })),
  ...overrides,
});

describe('KeycloakService', () => {
  let service: KeycloakService;
  let commonGim: ReturnType<typeof buildCommonGimMock>;

  const resetAxios = () => {
    (axios.post as jest.Mock).mockReset();
    (axios.get as jest.Mock).mockReset();
    (axios.put as jest.Mock).mockReset();
  };

  beforeEach(() => {
    resetAxios();
    commonGim = buildCommonGimMock();
    service = new KeycloakService(commonGim as any, buildConfigMock());
    (service as any).logger = { error: jest.fn(), warn: jest.fn(), log: jest.fn() };
  });

  // ─── getToken caching ─────────────────────────────────────────────────────
  describe('getToken (ServiceHub) caching', () => {
    it('caches the access token across calls and only logs in once', async () => {
      (axios.get as jest.Mock).mockResolvedValue({ data: [] });

      await service.findByUsername('a');
      await service.findByUsername('b');

      expect(commonGim.loginGimServiceHub).toHaveBeenCalledTimes(1);
    });

    it('refreshes the token after expiry margin elapses', async () => {
      commonGim.loginGimServiceHub
        .mockResolvedValueOnce({
          errorCode: ErrorCode.NONE,
          data: { access_token: 't1', expires_in: 1 }, // expires quickly
        })
        .mockResolvedValueOnce({
          errorCode: ErrorCode.NONE,
          data: { access_token: 't2', expires_in: 60 },
        });
      (axios.get as jest.Mock).mockResolvedValue({ data: [] });

      const realNow = Date.now;
      let now = 1_000_000;
      jest.spyOn(Date, 'now').mockImplementation(() => now);

      await service.findByUsername('a');
      now += 60_000; // jump well past 1s + 30s margin
      await service.findByUsername('b');

      expect(commonGim.loginGimServiceHub).toHaveBeenCalledTimes(2);
      Date.now = realNow;
    });

    it('returns NOT_FOUND when ServiceHub login fails', async () => {
      commonGim.loginGimServiceHub.mockResolvedValueOnce({ errorCode: ErrorCode.NOT_FOUND, data: null });
      const result = await service.findByUsername('a');
      expect(result.errorCode).toBe(ErrorCode.NOT_FOUND);
    });

    it('returns NOT_FOUND when ServiceHub login returns NONE without data', async () => {
      commonGim.loginGimServiceHub.mockResolvedValueOnce({ errorCode: ErrorCode.NONE, data: null });
      const result = await service.findByUsername('a');
      expect(result.errorCode).toBe(ErrorCode.NOT_FOUND);
    });
  });

  describe('getTokenMunicipalityK (always fresh)', () => {
    it('never caches and calls loginGimMunicipalityK on every request', async () => {
      (axios.get as jest.Mock).mockResolvedValue({ data: [] });
      await service.findByUsernameMunicipality('a');
      await service.findByUsernameMunicipality('b');
      expect(commonGim.loginGimMunicipalityK).toHaveBeenCalledTimes(2);
    });

    it('returns NOT_FOUND when municipality login fails', async () => {
      commonGim.loginGimMunicipalityK.mockResolvedValueOnce({ errorCode: ErrorCode.NOT_FOUND, data: null });
      const result = await service.findByUsernameMunicipality('a');
      expect(result.errorCode).toBe(ErrorCode.NOT_FOUND);
    });
  });

  // ─── createUser ───────────────────────────────────────────────────────────
  describe('createUser', () => {
    it('returns NOT_FOUND when token cannot be obtained', async () => {
      commonGim.loginGimServiceHub.mockResolvedValueOnce({ errorCode: ErrorCode.NOT_FOUND, data: null });
      const result = await service.createUser({} as any);
      expect(result.errorCode).toBe(ErrorCode.NOT_FOUND);
    });

    it('extracts userId from the Location header', async () => {
      (axios.post as jest.Mock).mockResolvedValueOnce({
        headers: { location: 'http://kc/admin/realms/sh/users/uuid-1' },
      });
      const result = await service.createUser({} as any);
      expect(result.errorCode).toBe(ErrorCode.NONE);
      expect((result as any).userId).toBe('uuid-1');
    });

    it('returns NOT_FOUND when Location header is missing', async () => {
      (axios.post as jest.Mock).mockResolvedValueOnce({ headers: {} });
      const result = await service.createUser({} as any);
      expect(result.errorCode).toBe(ErrorCode.NOT_FOUND);
    });

    it('throws an HttpException via throwKeycloakError when axios fails', async () => {
      // Production no longer throws: failures are returned as an { errorCode } envelope.
      // A 409 conflict maps to ErrorCode.RESPONSE.
      (axios.post as jest.Mock).mockRejectedValueOnce({ response: { status: 409 } });
      const result = await service.createUser({} as any);
      expect(result.errorCode).toBe(ErrorCode.RESPONSE);
    });
  });

  describe('createUserMunicipality', () => {
    it('returns NOT_FOUND when municipality token is unavailable', async () => {
      commonGim.loginGimMunicipalityK.mockResolvedValueOnce({ errorCode: ErrorCode.NOT_FOUND, data: null });
      const result = await service.createUserMunicipality({} as any);
      expect(result.errorCode).toBe(ErrorCode.NOT_FOUND);
    });

    it('extracts userId from the Location header', async () => {
      (axios.post as jest.Mock).mockResolvedValueOnce({
        headers: { location: 'http://kc/admin/realms/m/users/uuid-9' },
      });
      const result = await service.createUserMunicipality({} as any);
      expect((result as any).userId).toBe('uuid-9');
    });

    it('returns NOT_FOUND when Location header is missing', async () => {
      (axios.post as jest.Mock).mockResolvedValueOnce({ headers: {} });
      const result = await service.createUserMunicipality({} as any);
      expect(result.errorCode).toBe(ErrorCode.NOT_FOUND);
    });

    it('routes errors through throwKeycloakError', async () => {
      // Failures are returned, not thrown; a 500 maps to ErrorCode.RESPONSE.
      (axios.post as jest.Mock).mockRejectedValueOnce({ response: { status: 500 } });
      const result = await service.createUserMunicipality({} as any);
      expect(result.errorCode).toBe(ErrorCode.RESPONSE);
    });
  });

  // ─── updateUser ───────────────────────────────────────────────────────────
  describe('updateUser', () => {
    it('returns NOT_FOUND when token is unavailable', async () => {
      commonGim.loginGimServiceHub.mockResolvedValueOnce({ errorCode: ErrorCode.NOT_FOUND, data: null });
      const result = await service.updateUser('id', {} as any);
      expect(result.errorCode).toBe(ErrorCode.NOT_FOUND);
    });

    it('returns NONE on success', async () => {
      (axios.put as jest.Mock).mockResolvedValueOnce({});
      const result = await service.updateUser('id', {} as any);
      expect(result.errorCode).toBe(ErrorCode.NONE);
    });

    it('routes errors through throwKeycloakError', async () => {
      // Failures are returned, not thrown; a 401 maps to ErrorCode.UNAUTHORIZED.
      (axios.put as jest.Mock).mockRejectedValueOnce({ response: { status: 401 } });
      const result = await service.updateUser('id', {} as any);
      expect(result.errorCode).toBe(ErrorCode.UNAUTHORIZED);
    });
  });

  describe('updateUserMunicipality', () => {
    it('returns NOT_FOUND when municipality token unavailable', async () => {
      commonGim.loginGimMunicipalityK.mockResolvedValueOnce({ errorCode: ErrorCode.NOT_FOUND, data: null });
      const result = await service.updateUserMunicipality('id', {} as any);
      expect(result.errorCode).toBe(ErrorCode.NOT_FOUND);
    });

    it('returns NONE on success', async () => {
      (axios.put as jest.Mock).mockResolvedValueOnce({});
      const result = await service.updateUserMunicipality('id', {} as any);
      expect(result.errorCode).toBe(ErrorCode.NONE);
    });

    it('routes errors through throwKeycloakError', async () => {
      // A plain error (no response, no connection code) defaults to status 500 -> ErrorCode.RESPONSE.
      (axios.put as jest.Mock).mockRejectedValueOnce(new Error('net'));
      const result = await service.updateUserMunicipality('id', {} as any);
      expect(result.errorCode).toBe(ErrorCode.RESPONSE);
    });
  });

  // ─── setUserStatus ────────────────────────────────────────────────────────
  describe('setUserStatus', () => {
    it('returns NOT_FOUND when token is unavailable', async () => {
      commonGim.loginGimServiceHub.mockResolvedValueOnce({ errorCode: ErrorCode.NOT_FOUND, data: null });
      const result = await service.setUserStatus('id', false);
      expect(result.errorCode).toBe(ErrorCode.NOT_FOUND);
    });

    it('disables the account and returns NONE with the deshabilitada message', async () => {
      (axios.put as jest.Mock).mockResolvedValueOnce({});
      const result = await service.setUserStatus('id', false);
      expect(result.errorCode).toBe(ErrorCode.NONE);
      expect((result as any).enabled).toBe(false);
      expect(result.message).toBe('Cuenta deshabilitada exitosamente');
    });

    it('enables the account and returns NONE with the habilitada message', async () => {
      (axios.put as jest.Mock).mockResolvedValueOnce({});
      const result = await service.setUserStatus('id', true);
      expect(result.errorCode).toBe(ErrorCode.NONE);
      expect((result as any).enabled).toBe(true);
      expect(result.message).toBe('Cuenta habilitada exitosamente');
    });

    it('sends only the enabled flag to the ServiceHub realm URL', async () => {
      (axios.put as jest.Mock).mockResolvedValueOnce({});
      await service.setUserStatus('uid-1', false);
      expect(axios.put).toHaveBeenCalledWith(
        'http://kc.test/admin/realms/service-hub/users/uid-1',
        { enabled: false },
        expect.objectContaining({ headers: expect.any(Object) }),
      );
    });

    it('routes errors through throwKeycloakError', async () => {
      // Failures are returned, not thrown; a 500 maps to ErrorCode.RESPONSE.
      (axios.put as jest.Mock).mockRejectedValueOnce({ response: { status: 500 } });
      const result = await service.setUserStatus('id', false);
      expect(result.errorCode).toBe(ErrorCode.RESPONSE);
    });
  });

  describe('setUserStatusMunicipality', () => {
    it('returns NOT_FOUND when municipality token is unavailable', async () => {
      commonGim.loginGimMunicipalityK.mockResolvedValueOnce({ errorCode: ErrorCode.NOT_FOUND, data: null });
      const result = await service.setUserStatusMunicipality('id', false);
      expect(result.errorCode).toBe(ErrorCode.NOT_FOUND);
    });

    it('disables the account and returns NONE with the deshabilitada message', async () => {
      (axios.put as jest.Mock).mockResolvedValueOnce({});
      const result = await service.setUserStatusMunicipality('id', false);
      expect(result.errorCode).toBe(ErrorCode.NONE);
      expect((result as any).enabled).toBe(false);
      expect(result.message).toBe('Cuenta deshabilitada exitosamente');
    });

    it('enables the account and returns NONE with the habilitada message', async () => {
      (axios.put as jest.Mock).mockResolvedValueOnce({});
      const result = await service.setUserStatusMunicipality('id', true);
      expect(result.errorCode).toBe(ErrorCode.NONE);
      expect((result as any).enabled).toBe(true);
      expect(result.message).toBe('Cuenta habilitada exitosamente');
    });

    it('sends only the enabled flag to the Municipality realm URL', async () => {
      (axios.put as jest.Mock).mockResolvedValueOnce({});
      await service.setUserStatusMunicipality('uid-9', true);
      expect(axios.put).toHaveBeenCalledWith(
        'http://kc.test/admin/realms/municipio/users/uid-9',
        { enabled: true },
        expect.objectContaining({ headers: expect.any(Object) }),
      );
    });

    it('routes errors through throwKeycloakError', async () => {
      // A plain error defaults to status 500 -> ErrorCode.RESPONSE.
      (axios.put as jest.Mock).mockRejectedValueOnce(new Error('net'));
      const result = await service.setUserStatusMunicipality('id', false);
      expect(result.errorCode).toBe(ErrorCode.RESPONSE);
    });
  });

  // ─── findByUsername ───────────────────────────────────────────────────────
  describe('findByUsername / Municipality', () => {
    it('returns NOT_FOUND when token missing (servicehub)', async () => {
      commonGim.loginGimServiceHub.mockResolvedValueOnce({ errorCode: ErrorCode.NOT_FOUND, data: null });
      expect((await service.findByUsername('u')).errorCode).toBe(ErrorCode.NOT_FOUND);
    });

    it('returns NONE with data when results exist', async () => {
      (axios.get as jest.Mock).mockResolvedValueOnce({ data: [{ id: '1' }] });
      const result = await service.findByUsername('u');
      expect(result.errorCode).toBe(ErrorCode.NONE);
      expect(result.data).toEqual([{ id: '1' }]);
    });

    it('returns NOT_FOUND when results are empty', async () => {
      (axios.get as jest.Mock).mockResolvedValueOnce({ data: [] });
      const result = await service.findByUsername('u');
      expect(result.errorCode).toBe(ErrorCode.NOT_FOUND);
    });

    it('returns NOT_FOUND when data is null', async () => {
      (axios.get as jest.Mock).mockResolvedValueOnce({ data: null });
      const result = await service.findByUsername('u');
      expect(result.errorCode).toBe(ErrorCode.NOT_FOUND);
    });

    it('routes errors through throwKeycloakError', async () => {
      // Failures are returned, not thrown; a 401 invalid_grant maps to ErrorCode.UNAUTHORIZED.
      (axios.get as jest.Mock).mockRejectedValueOnce({ response: { status: 401, data: { error: 'invalid_grant' } } });
      const result = await service.findByUsername('u');
      expect(result.errorCode).toBe(ErrorCode.UNAUTHORIZED);
    });

    it('Municipality: NOT_FOUND when token missing', async () => {
      commonGim.loginGimMunicipalityK.mockResolvedValueOnce({ errorCode: ErrorCode.NOT_FOUND, data: null });
      expect((await service.findByUsernameMunicipality('u')).errorCode).toBe(ErrorCode.NOT_FOUND);
    });

    it('Municipality: NONE with data when results exist', async () => {
      (axios.get as jest.Mock).mockResolvedValueOnce({ data: [{ id: 'm1' }] });
      expect((await service.findByUsernameMunicipality('u')).errorCode).toBe(ErrorCode.NONE);
    });

    it('Municipality: NOT_FOUND when data empty', async () => {
      (axios.get as jest.Mock).mockResolvedValueOnce({ data: [] });
      expect((await service.findByUsernameMunicipality('u')).errorCode).toBe(ErrorCode.NOT_FOUND);
    });

    it('Municipality: routes errors through throwKeycloakError', async () => {
      // A plain error defaults to status 500 -> ErrorCode.RESPONSE.
      (axios.get as jest.Mock).mockRejectedValueOnce(new Error('net'));
      const result = await service.findByUsernameMunicipality('u');
      expect(result.errorCode).toBe(ErrorCode.RESPONSE);
    });
  });

  // ─── loginClient ──────────────────────────────────────────────────────────
  describe('loginClient', () => {
    it('returns token payload on success', async () => {
      (axios.post as jest.Mock).mockResolvedValueOnce({
        data: { access_token: 'a', refresh_token: 'r', expires_in: 1, refresh_expires_in: 2 },
      });

      const result = await service.loginClient({ username: 'u', password: 'p' } as any);

      expect(result).toEqual({
        errorCode: ErrorCode.NONE,
        access_token: 'a',
        refresh_token: 'r',
        expires_in: 1,
        refresh_expires_in: 2,
      });
    });

    it('throws on invalid_grant', async () => {
      // Failures are returned, not thrown; a 401 invalid_grant maps to ErrorCode.UNAUTHORIZED.
      (axios.post as jest.Mock).mockRejectedValueOnce({
        response: { status: 401, data: { error: 'invalid_grant' } },
      });
      const result = await service.loginClient({ username: 'u', password: 'p' } as any);
      expect(result.errorCode).toBe(ErrorCode.UNAUTHORIZED);
    });
  });

  describe('loginClientMunicipality', () => {
    it('returns token payload on success', async () => {
      (axios.post as jest.Mock).mockResolvedValueOnce({
        data: { access_token: 'a', refresh_token: 'r', expires_in: 1, refresh_expires_in: 2 },
      });
      const result = await service.loginClientMunicipality({ username: 'u', password: 'p' } as any);
      expect(result.errorCode).toBe(ErrorCode.NONE);
    });

    it('throws on connection error', async () => {
      // Connection errors are returned, not thrown; ECONNREFUSED maps to ErrorCode.RESPONSE.
      (axios.post as jest.Mock).mockRejectedValueOnce({ code: 'ECONNREFUSED' });
      const result = await service.loginClientMunicipality({ username: 'u', password: 'p' } as any);
      expect(result.errorCode).toBe(ErrorCode.RESPONSE);
    });
  });

  // ─── findByEmail ──────────────────────────────────────────────────────────
  describe('findByEmail / Municipality', () => {
    it('returns NOT_FOUND when token missing', async () => {
      commonGim.loginGimServiceHub.mockResolvedValueOnce({ errorCode: ErrorCode.NOT_FOUND, data: null });
      expect((await service.findByEmail('a@b')).errorCode).toBe(ErrorCode.NOT_FOUND);
    });

    it('returns NONE with data when results exist', async () => {
      (axios.get as jest.Mock).mockResolvedValueOnce({ data: [{ id: 'x' }] });
      const result = await service.findByEmail('a@b');
      expect(result.errorCode).toBe(ErrorCode.NONE);
    });

    it('returns NOT_FOUND when data is empty', async () => {
      (axios.get as jest.Mock).mockResolvedValueOnce({ data: [] });
      expect((await service.findByEmail('a@b')).errorCode).toBe(ErrorCode.NOT_FOUND);
    });

    it('routes errors through throwKeycloakError', async () => {
      // A plain error defaults to status 500 -> ErrorCode.RESPONSE.
      (axios.get as jest.Mock).mockRejectedValueOnce(new Error('e'));
      const result = await service.findByEmail('a@b');
      expect(result.errorCode).toBe(ErrorCode.RESPONSE);
    });

    it('Municipality: NOT_FOUND when token missing', async () => {
      commonGim.loginGimMunicipalityK.mockResolvedValueOnce({ errorCode: ErrorCode.NOT_FOUND, data: null });
      expect((await service.findByEmailMunicipality('a@b')).errorCode).toBe(ErrorCode.NOT_FOUND);
    });

    it('Municipality: NONE when results exist', async () => {
      (axios.get as jest.Mock).mockResolvedValueOnce({ data: [{ id: 'x' }] });
      expect((await service.findByEmailMunicipality('a@b')).errorCode).toBe(ErrorCode.NONE);
    });

    it('Municipality: NOT_FOUND when empty', async () => {
      (axios.get as jest.Mock).mockResolvedValueOnce({ data: [] });
      expect((await service.findByEmailMunicipality('a@b')).errorCode).toBe(ErrorCode.NOT_FOUND);
    });

    it('Municipality: routes errors through throwKeycloakError', async () => {
      // A plain error defaults to status 500 -> ErrorCode.RESPONSE.
      (axios.get as jest.Mock).mockRejectedValueOnce(new Error('e'));
      const result = await service.findByEmailMunicipality('a@b');
      expect(result.errorCode).toBe(ErrorCode.RESPONSE);
    });
  });

  // ─── setUserPassword ──────────────────────────────────────────────────────
  describe('setUserPassword', () => {
    it('returns NOT_FOUND when email is empty', async () => {
      const result = await service.setUserPassword('   ');
      expect(result.errorCode).toBe(ErrorCode.NOT_FOUND);
    });

    it('returns NOT_FOUND when email is undefined', async () => {
      const result = await service.setUserPassword(undefined as any);
      expect(result.errorCode).toBe(ErrorCode.NOT_FOUND);
    });

    it('returns NOT_FOUND when token is unavailable', async () => {
      commonGim.loginGimServiceHub.mockResolvedValueOnce({ errorCode: ErrorCode.NOT_FOUND, data: null });
      const result = await service.setUserPassword('a@b.c');
      expect(result.errorCode).toBe(ErrorCode.NOT_FOUND);
    });

    it('returns NOT_FOUND when user not found', async () => {
      (axios.get as jest.Mock).mockResolvedValueOnce({ data: [] });
      const result = await service.setUserPassword('a@b.c');
      expect(result.errorCode).toBe(ErrorCode.NOT_FOUND);
    });

    it('returns NOT_FOUND when data is null', async () => {
      (axios.get as jest.Mock).mockResolvedValueOnce({ data: null });
      const result = await service.setUserPassword('a@b.c');
      expect(result.errorCode).toBe(ErrorCode.NOT_FOUND);
    });

    it('returns NONE when email sent successfully', async () => {
      (axios.get as jest.Mock).mockResolvedValueOnce({
        data: [{ id: 'u', firstName: 'F', lastName: 'L', username: 'fl' }],
      });
      (axios.put as jest.Mock).mockResolvedValueOnce({});
      (axios.post as jest.Mock).mockResolvedValueOnce({ status: 200, data: { ok: true } });

      const result = await service.setUserPassword('a@b.c');
      expect(result.errorCode).toBe(ErrorCode.NONE);
      expect((result as any).emailSent).toBe(true);
    });

    it('returns RESPONSE when email dispatch fails', async () => {
      (axios.get as jest.Mock).mockResolvedValueOnce({ data: [{ id: 'u' }] });
      (axios.put as jest.Mock).mockResolvedValueOnce({});
      (axios.post as jest.Mock).mockResolvedValueOnce({ status: 200, data: { ok: false } });

      const result = await service.setUserPassword('a@b.c');
      expect(result.errorCode).toBe(ErrorCode.RESPONSE);
      expect((result as any).emailSent).toBe(false);
    });

    it('returns RESPONSE when DOMINIO_AUTH is missing', async () => {
      service = new KeycloakService(commonGim as any, buildConfigMock({ DOMINIO_AUTH: undefined }));
      (service as any).logger = { error: jest.fn(), warn: jest.fn(), log: jest.fn() };
      (axios.get as jest.Mock).mockResolvedValueOnce({ data: [{ id: 'u' }] });
      (axios.put as jest.Mock).mockResolvedValueOnce({});

      const result = await service.setUserPassword('a@b.c');
      expect(result.errorCode).toBe(ErrorCode.RESPONSE);
    });

    it('returns RESPONSE when send-password throws', async () => {
      (axios.get as jest.Mock).mockResolvedValueOnce({ data: [{ id: 'u' }] });
      (axios.put as jest.Mock).mockResolvedValueOnce({});
      (axios.post as jest.Mock).mockRejectedValueOnce({ response: { status: 500, data: {} }, message: 'oops' });
      const result = await service.setUserPassword('a@b.c');
      expect(result.errorCode).toBe(ErrorCode.RESPONSE);
    });

    it('routes errors through throwKeycloakError when axios get fails', async () => {
      // Failures are returned, not thrown; a 500 maps to ErrorCode.RESPONSE.
      (axios.get as jest.Mock).mockRejectedValueOnce({ response: { status: 500 } });
      const result = await service.setUserPassword('a@b.c');
      expect(result.errorCode).toBe(ErrorCode.RESPONSE);
    });
  });

  // ─── setUserPasswordMunicipality ─────────────────────────────────────────
  describe('setUserPasswordMunicipality', () => {
    it('returns NOT_FOUND when email is empty', async () => {
      const result = await service.setUserPasswordMunicipality('');
      expect(result.errorCode).toBe(ErrorCode.NOT_FOUND);
    });

    it('returns NOT_FOUND when municipality token is unavailable', async () => {
      commonGim.loginGimMunicipalityK.mockResolvedValueOnce({ errorCode: ErrorCode.NOT_FOUND, data: null });
      const result = await service.setUserPasswordMunicipality('a@b.c');
      expect(result.errorCode).toBe(ErrorCode.NOT_FOUND);
    });

    it('returns NOT_FOUND when user not found', async () => {
      (axios.get as jest.Mock).mockResolvedValueOnce({ data: [] });
      const result = await service.setUserPasswordMunicipality('a@b.c');
      expect(result.errorCode).toBe(ErrorCode.NOT_FOUND);
    });

    it('returns NOT_FOUND when data is null', async () => {
      (axios.get as jest.Mock).mockResolvedValueOnce({ data: null });
      const result = await service.setUserPasswordMunicipality('a@b.c');
      expect(result.errorCode).toBe(ErrorCode.NOT_FOUND);
    });

    it('returns NONE when email sent successfully', async () => {
      (axios.get as jest.Mock).mockResolvedValueOnce({
        data: [{ id: 'u', firstName: 'F', lastName: 'L' }],
      });
      (axios.put as jest.Mock).mockResolvedValueOnce({});
      (axios.post as jest.Mock).mockResolvedValueOnce({ status: 200, data: { ok: true } });

      const result = await service.setUserPasswordMunicipality('a@b.c');
      expect(result.errorCode).toBe(ErrorCode.NONE);
    });

    it('falls back to username/email when firstName and lastName are missing', async () => {
      (axios.get as jest.Mock).mockResolvedValueOnce({
        data: [{ id: 'u', username: 'usr' }],
      });
      (axios.put as jest.Mock).mockResolvedValueOnce({});
      (axios.post as jest.Mock).mockResolvedValueOnce({ status: 200, data: { ok: true } });

      const result = await service.setUserPasswordMunicipality('a@b.c');
      expect(result.errorCode).toBe(ErrorCode.NONE);
    });

    it('returns RESPONSE when email dispatch fails', async () => {
      (axios.get as jest.Mock).mockResolvedValueOnce({ data: [{ id: 'u' }] });
      (axios.put as jest.Mock).mockResolvedValueOnce({});
      (axios.post as jest.Mock).mockResolvedValueOnce({ status: 500, data: { ok: false } });

      const result = await service.setUserPasswordMunicipality('a@b.c');
      expect(result.errorCode).toBe(ErrorCode.RESPONSE);
    });

    it('routes errors through throwKeycloakError', async () => {
      // Failures are returned, not thrown; a 500 maps to ErrorCode.RESPONSE.
      (axios.get as jest.Mock).mockRejectedValueOnce({ response: { status: 500 } });
      const result = await service.setUserPasswordMunicipality('a@b.c');
      expect(result.errorCode).toBe(ErrorCode.RESPONSE);
    });
  });

  // ─── changePassword ───────────────────────────────────────────────────────
  describe('changePassword', () => {
    it('returns NOT_FOUND when inputs are empty', async () => {
      expect((await service.changePassword('', '')).errorCode).toBe(ErrorCode.NOT_FOUND);
      expect((await service.changePassword(undefined as any, 'pw')).errorCode).toBe(ErrorCode.NOT_FOUND);
      expect((await service.changePassword('a@b.c', '')).errorCode).toBe(ErrorCode.NOT_FOUND);
    });

    it('returns NOT_FOUND when token cannot be obtained', async () => {
      commonGim.loginGimServiceHub.mockResolvedValueOnce({ errorCode: ErrorCode.NOT_FOUND, data: null });
      expect((await service.changePassword('a@b.c', 'pw')).errorCode).toBe(ErrorCode.NOT_FOUND);
    });

    it('returns NOT_FOUND when user not found', async () => {
      (axios.get as jest.Mock).mockResolvedValueOnce({ data: [] });
      expect((await service.changePassword('a@b.c', 'pw')).errorCode).toBe(ErrorCode.NOT_FOUND);
    });

    it('returns NOT_FOUND when data is null', async () => {
      (axios.get as jest.Mock).mockResolvedValueOnce({ data: null });
      expect((await service.changePassword('a@b.c', 'pw')).errorCode).toBe(ErrorCode.NOT_FOUND);
    });

    it('returns NONE on success and propagates userId', async () => {
      (axios.get as jest.Mock).mockResolvedValueOnce({ data: [{ id: 'uid' }] });
      (axios.put as jest.Mock).mockResolvedValueOnce({});

      const result = await service.changePassword('a@b.c', 'pw');
      expect(result.errorCode).toBe(ErrorCode.NONE);
      expect((result as any).userId).toBe('uid');
    });

    it('routes errors through throwKeycloakError', async () => {
      // Failures are returned, not thrown; a 500 maps to ErrorCode.RESPONSE.
      (axios.get as jest.Mock).mockRejectedValueOnce({ response: { status: 500 } });
      const result = await service.changePassword('a@b.c', 'pw');
      expect(result.errorCode).toBe(ErrorCode.RESPONSE);
    });
  });

  // ─── changePasswordMunicipality ──────────────────────────────────────────
  describe('changePasswordMunicipality', () => {
    it('returns NOT_FOUND when inputs are empty', async () => {
      expect((await service.changePasswordMunicipality('', '')).errorCode).toBe(ErrorCode.NOT_FOUND);
      expect((await service.changePasswordMunicipality(undefined as any, 'pw')).errorCode).toBe(ErrorCode.NOT_FOUND);
      expect((await service.changePasswordMunicipality('a@b.c', '')).errorCode).toBe(ErrorCode.NOT_FOUND);
    });

    it('returns NOT_FOUND when municipality token cannot be obtained', async () => {
      commonGim.loginGimMunicipalityK.mockResolvedValueOnce({ errorCode: ErrorCode.NOT_FOUND, data: null });
      expect((await service.changePasswordMunicipality('a@b.c', 'pw')).errorCode).toBe(ErrorCode.NOT_FOUND);
    });

    it('returns NOT_FOUND when user not found', async () => {
      (axios.get as jest.Mock).mockResolvedValueOnce({ data: [] });
      expect((await service.changePasswordMunicipality('a@b.c', 'pw')).errorCode).toBe(ErrorCode.NOT_FOUND);
    });

    it('returns NOT_FOUND when data is null', async () => {
      (axios.get as jest.Mock).mockResolvedValueOnce({ data: null });
      expect((await service.changePasswordMunicipality('a@b.c', 'pw')).errorCode).toBe(ErrorCode.NOT_FOUND);
    });

    it('returns NONE on success and propagates userId', async () => {
      (axios.get as jest.Mock).mockResolvedValueOnce({ data: [{ id: 'uid-m' }] });
      (axios.put as jest.Mock).mockResolvedValueOnce({});

      const result = await service.changePasswordMunicipality('a@b.c', 'pw');
      expect(result.errorCode).toBe(ErrorCode.NONE);
      expect((result as any).userId).toBe('uid-m');
    });

    it('routes errors through throwKeycloakError', async () => {
      // Failures are returned, not thrown; a 500 maps to ErrorCode.RESPONSE.
      (axios.get as jest.Mock).mockRejectedValueOnce({ response: { status: 500 } });
      const result = await service.changePasswordMunicipality('a@b.c', 'pw');
      expect(result.errorCode).toBe(ErrorCode.RESPONSE);
    });
  });

  // ─── findByIdentification ─────────────────────────────────────────────────
  describe('findByIdentification / Municipality', () => {
    it('returns NOT_FOUND when token unavailable', async () => {
      commonGim.loginGimServiceHub.mockResolvedValueOnce({ errorCode: ErrorCode.NOT_FOUND, data: null });
      expect((await service.findByIdentification('1')).errorCode).toBe(ErrorCode.NOT_FOUND);
    });

    it('returns NONE when results found', async () => {
      (axios.get as jest.Mock).mockResolvedValueOnce({ data: [{ id: 'x' }] });
      expect((await service.findByIdentification('1')).errorCode).toBe(ErrorCode.NONE);
    });

    it('returns NOT_FOUND when empty', async () => {
      (axios.get as jest.Mock).mockResolvedValueOnce({ data: [] });
      expect((await service.findByIdentification('1')).errorCode).toBe(ErrorCode.NOT_FOUND);
    });

    it('routes errors through throwKeycloakError', async () => {
      // A plain error defaults to status 500 -> ErrorCode.RESPONSE.
      (axios.get as jest.Mock).mockRejectedValueOnce(new Error('e'));
      const result = await service.findByIdentification('1');
      expect(result.errorCode).toBe(ErrorCode.RESPONSE);
    });

    it('Municipality: NOT_FOUND when token unavailable', async () => {
      commonGim.loginGimMunicipalityK.mockResolvedValueOnce({ errorCode: ErrorCode.NOT_FOUND, data: null });
      expect((await service.findByIdentificationMunicipality('1')).errorCode).toBe(ErrorCode.NOT_FOUND);
    });

    it('Municipality: NONE when results found', async () => {
      (axios.get as jest.Mock).mockResolvedValueOnce({ data: [{ id: 'x' }] });
      expect((await service.findByIdentificationMunicipality('1')).errorCode).toBe(ErrorCode.NONE);
    });

    it('Municipality: NOT_FOUND when empty', async () => {
      (axios.get as jest.Mock).mockResolvedValueOnce({ data: [] });
      expect((await service.findByIdentificationMunicipality('1')).errorCode).toBe(ErrorCode.NOT_FOUND);
    });

    it('Municipality: routes errors through throwKeycloakError', async () => {
      // A plain error defaults to status 500 -> ErrorCode.RESPONSE.
      (axios.get as jest.Mock).mockRejectedValueOnce(new Error('e'));
      const result = await service.findByIdentificationMunicipality('1');
      expect(result.errorCode).toBe(ErrorCode.RESPONSE);
    });
  });

  // ─── executeActionsEmail ─────────────────────────────────────────────────
  describe('executeActionsEmail / Municipality', () => {
    it('returns NOT_FOUND when service-hub token unavailable', async () => {
      commonGim.loginGimServiceHub.mockResolvedValueOnce({ errorCode: ErrorCode.NOT_FOUND, data: null });
      const result = await service.executeActionsEmail('u');
      expect(result?.errorCode).toBe(ErrorCode.NOT_FOUND);
    });

    it('returns undefined on success', async () => {
      (axios.put as jest.Mock).mockResolvedValueOnce({});
      const result = await service.executeActionsEmail('u');
      expect(result).toBeUndefined();
    });

    it('routes errors through throwKeycloakError', async () => {
      // Failures are returned, not thrown; a 500 maps to ErrorCode.RESPONSE.
      (axios.put as jest.Mock).mockRejectedValueOnce({ response: { status: 500 } });
      const result = await service.executeActionsEmail('u');
      expect(result?.errorCode).toBe(ErrorCode.RESPONSE);
    });

    it('Municipality: returns NOT_FOUND when token unavailable', async () => {
      commonGim.loginGimMunicipalityK.mockResolvedValueOnce({ errorCode: ErrorCode.NOT_FOUND, data: null });
      const result = await service.executeActionsEmailMunicipality('u');
      expect(result.errorCode).toBe(ErrorCode.NOT_FOUND);
    });

    it('Municipality: returns NONE on success', async () => {
      (axios.put as jest.Mock).mockResolvedValueOnce({});
      const result = await service.executeActionsEmailMunicipality('u');
      expect(result.errorCode).toBe(ErrorCode.NONE);
    });

    it('Municipality: routes errors through throwKeycloakError', async () => {
      // Connection errors are returned, not thrown; ETIMEDOUT maps to ErrorCode.RESPONSE.
      (axios.put as jest.Mock).mockRejectedValueOnce({ code: 'ETIMEDOUT' });
      const result = await service.executeActionsEmailMunicipality('u');
      expect(result.errorCode).toBe(ErrorCode.RESPONSE);
    });
  });

  // ─── throwKeycloakError branches ─────────────────────────────────────────
  // Production no longer throws an HttpException. `_buildKeycloakError` *returns*
  // a normalized `{ errorCode, message }` envelope so the HTTP status stays 2xx
  // and the client reads the outcome from `errorCode`. These tests therefore
  // assert the returned `errorCode` instead of a thrown status.
  describe('throwKeycloakError branches', () => {
    const fire = (err: any): { errorCode: ErrorCode; message: string } =>
      (service as any)._buildKeycloakError('ctx', err);

    it('maps connection errors to GATEWAY_TIMEOUT (ECONNABORTED)', () => {
      expect(fire({ code: 'ECONNABORTED' }).errorCode).toBe(ErrorCode.RESPONSE);
    });

    it('maps connection errors to GATEWAY_TIMEOUT (ETIMEDOUT)', () => {
      expect(fire({ code: 'ETIMEDOUT' }).errorCode).toBe(ErrorCode.RESPONSE);
    });

    it('maps connection errors to GATEWAY_TIMEOUT (ENOTFOUND)', () => {
      expect(fire({ code: 'ENOTFOUND' }).errorCode).toBe(ErrorCode.RESPONSE);
    });

    it('maps 401 invalid_grant to UNAUTHORIZED with credentials message', () => {
      const result = fire({ response: { status: 401, data: { error: 'invalid_grant' } } });
      expect(result.errorCode).toBe(ErrorCode.UNAUTHORIZED);
      expect(result.message).toMatch(/credenciales incorrectas/i);
    });

    it('maps generic 401 to UNAUTHORIZED', () => {
      expect(fire({ response: { status: 401, data: {} } }).errorCode).toBe(ErrorCode.UNAUTHORIZED);
    });

    it('maps 500 to BAD_GATEWAY', () => {
      expect(fire({ response: { status: 500 } }).errorCode).toBe(ErrorCode.RESPONSE);
    });

    it('maps 409 to CONFLICT', () => {
      expect(fire({ response: { status: 409 } }).errorCode).toBe(ErrorCode.RESPONSE);
    });

    it('maps "Account disabled" message to FORBIDDEN', () => {
      const result = fire({ response: { status: 400, data: { message: 'Account disabled' } } });
      expect(result.errorCode).toBe(ErrorCode.UNAUTHORIZED);
      expect(result.message).toMatch(/deshabilitada/i);
    });

    it('falls back to response.data.error when message missing', () => {
      // Unhandled status (400) with only an `error` field falls through to the
      // generic RESPONSE envelope.
      expect(fire({ response: { status: 400, data: { error: 'something' } } }).errorCode).toBe(ErrorCode.RESPONSE);
    });

    it('falls back to error.message when no response data (becomes BAD_GATEWAY via 500 path)', () => {
      // No response => default status 500 => mapped to ErrorCode.RESPONSE.
      expect(fire({ message: 'plain message' }).errorCode).toBe(ErrorCode.RESPONSE);
    });

    it('with response.status=400 and unknown error, throws with original status', () => {
      // Unhandled status (400) with an empty body falls through to the generic
      // RESPONSE envelope.
      expect(fire({ response: { status: 400, data: {} }, message: 'oops' }).errorCode).toBe(ErrorCode.RESPONSE);
    });
  });

  // ─── _generateCode ───────────────────────────────────────────────────────
  describe('_generateCode', () => {
    it('produces a 6-digit numeric code', () => {
      const code = (service as any)._generateCode();
      expect(code).toMatch(/^\d{6}$/);
    });
  });
});
