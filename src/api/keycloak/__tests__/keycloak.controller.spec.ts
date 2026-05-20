import { CreateKeycloakUserDto } from 'src/common/dto/create-keycloak-user.dto';
import { LoginKeycloakClientDto } from 'src/common/dto/login-keycloak-client.dto';
import { UpdateKeycloakUserDto } from 'src/common/dto/update-keycloak-user.dto';

import { ChangePasswordDto } from '../dto/change-password.dto';
import { ResetPasswordDto } from '../dto/reset-password.dto';
import { SetUserStatusDto } from '../dto/set-user-status.dto';
import { KeycloakController } from '../keycloak.controller';
import { KeycloakService } from '../keycloak.service';

// Direct instantiation avoids pulling the Nest DI graph (guards/JwtService).
const buildServiceMock = () => ({
  loginClient: jest.fn(),
  loginClientMunicipality: jest.fn(),
  createUser: jest.fn(),
  createUserMunicipality: jest.fn(),
  updateUser: jest.fn(),
  updateUserMunicipality: jest.fn(),
  findByUsername: jest.fn(),
  findByUsernameMunicipality: jest.fn(),
  findByEmail: jest.fn(),
  findByEmailMunicipality: jest.fn(),
  setUserPassword: jest.fn(),
  setUserPasswordMunicipality: jest.fn(),
  changePassword: jest.fn(),
  changePasswordMunicipality: jest.fn(),
  findByIdentification: jest.fn(),
  findByIdentificationMunicipality: jest.fn(),
  setUserStatus: jest.fn(),
  setUserStatusMunicipality: jest.fn(),
});

describe('KeycloakController', () => {
  let controller: KeycloakController;
  let service: ReturnType<typeof buildServiceMock>;
  const fakeResult = { ok: true } as any;

  beforeEach(() => {
    service = buildServiceMock();
    controller = new KeycloakController(service as unknown as KeycloakService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('loginClient', () => {
    it('delegates to service.loginClient', async () => {
      service.loginClient.mockResolvedValue(fakeResult);
      const dto = { username: 'u', password: 'p' } as LoginKeycloakClientDto;
      const result = await controller.loginClient(dto);
      expect(service.loginClient).toHaveBeenCalledWith(dto);
      expect(result).toBe(fakeResult);
    });
  });

  describe('loginClientMunicipality', () => {
    it('delegates to service.loginClientMunicipality', async () => {
      service.loginClientMunicipality.mockResolvedValue(fakeResult);
      const dto = { username: 'u', password: 'p' } as LoginKeycloakClientDto;
      const result = await controller.loginClientMunicipality(dto);
      expect(service.loginClientMunicipality).toHaveBeenCalledWith(dto);
      expect(result).toBe(fakeResult);
    });
  });

  describe('createUser', () => {
    it('delegates to service.createUser', async () => {
      service.createUser.mockResolvedValue(fakeResult);
      const dto = {} as CreateKeycloakUserDto;
      const result = await controller.createUser(dto);
      expect(service.createUser).toHaveBeenCalledWith(dto);
      expect(result).toBe(fakeResult);
    });
  });

  describe('createUserMunicipality', () => {
    it('delegates to service.createUserMunicipality', async () => {
      service.createUserMunicipality.mockResolvedValue(fakeResult);
      const dto = {} as CreateKeycloakUserDto;
      const result = await controller.createUserMunicipality(dto);
      expect(service.createUserMunicipality).toHaveBeenCalledWith(dto);
      expect(result).toBe(fakeResult);
    });
  });

  describe('updateUser', () => {
    it('delegates to service.updateUser with id and dto', async () => {
      service.updateUser.mockResolvedValue(fakeResult);
      const dto = {} as UpdateKeycloakUserDto;
      const result = await controller.updateUser('abc', dto);
      expect(service.updateUser).toHaveBeenCalledWith('abc', dto);
      expect(result).toBe(fakeResult);
    });
  });

  describe('updateUserMunicipality', () => {
    it('delegates to service.updateUserMunicipality with id and dto', async () => {
      service.updateUserMunicipality.mockResolvedValue(fakeResult);
      const dto = {} as UpdateKeycloakUserDto;
      const result = await controller.updateUserMunicipality('abc', dto);
      expect(service.updateUserMunicipality).toHaveBeenCalledWith('abc', dto);
      expect(result).toBe(fakeResult);
    });
  });

  describe('findByUsername', () => {
    it('delegates to service.findByUsername', async () => {
      service.findByUsername.mockResolvedValue(fakeResult);
      const result = await controller.findByUsername('john');
      expect(service.findByUsername).toHaveBeenCalledWith('john');
      expect(result).toBe(fakeResult);
    });
  });

  describe('findByUsernameMunicipality', () => {
    it('delegates to service.findByUsernameMunicipality', async () => {
      service.findByUsernameMunicipality.mockResolvedValue(fakeResult);
      const result = await controller.findByUsernameMunicipality('jane');
      expect(service.findByUsernameMunicipality).toHaveBeenCalledWith('jane');
      expect(result).toBe(fakeResult);
    });
  });

  describe('findByEmail', () => {
    it('delegates to service.findByEmail', async () => {
      service.findByEmail.mockResolvedValue(fakeResult);
      const result = await controller.findByEmail('a@b.c');
      expect(service.findByEmail).toHaveBeenCalledWith('a@b.c');
      expect(result).toBe(fakeResult);
    });
  });

  describe('findByEmailMunicipality', () => {
    it('delegates to service.findByEmailMunicipality', async () => {
      service.findByEmailMunicipality.mockResolvedValue(fakeResult);
      const result = await controller.findByEmailMunicipality('a@b.c');
      expect(service.findByEmailMunicipality).toHaveBeenCalledWith('a@b.c');
      expect(result).toBe(fakeResult);
    });
  });

  describe('setUserPassword', () => {
    it('delegates to service.setUserPassword using dto.email', async () => {
      service.setUserPassword.mockResolvedValue(fakeResult);
      const dto = { email: 'a@b.c' } as ResetPasswordDto;
      const result = await controller.setUserPassword(dto);
      expect(service.setUserPassword).toHaveBeenCalledWith('a@b.c');
      expect(result).toBe(fakeResult);
    });
  });

  describe('setUserPasswordMunicipality', () => {
    it('delegates to service.setUserPasswordMunicipality using dto.email', async () => {
      service.setUserPasswordMunicipality.mockResolvedValue(fakeResult);
      const dto = { email: 'a@b.c' } as ResetPasswordDto;
      const result = await controller.setUserPasswordMunicipality(dto);
      expect(service.setUserPasswordMunicipality).toHaveBeenCalledWith('a@b.c');
      expect(result).toBe(fakeResult);
    });
  });

  describe('changePassword', () => {
    it('delegates to service.changePassword with dto.email and dto.newPassword', async () => {
      service.changePassword.mockResolvedValue(fakeResult);
      const user = { email: 'me@x.com' } as any;
      const dto = { email: 'me@x.com', newPassword: 'pw' } as ChangePasswordDto;
      const result = await controller.changePassword(user, dto);
      expect(service.changePassword).toHaveBeenCalledWith('me@x.com', 'pw');
      expect(result).toBe(fakeResult);
    });
  });

  describe('changePasswordMunicipality', () => {
    it('delegates to service.changePasswordMunicipality with dto.email and dto.newPassword', async () => {
      service.changePasswordMunicipality.mockResolvedValue(fakeResult);
      const user = { email: 'me@x.com' } as any;
      const dto = { email: 'me@x.com', newPassword: 'pw' } as ChangePasswordDto;
      const result = await controller.changePasswordMunicipality(user, dto);
      expect(service.changePasswordMunicipality).toHaveBeenCalledWith('me@x.com', 'pw');
      expect(result).toBe(fakeResult);
    });
  });

  describe('findByIdentification', () => {
    it('delegates to service.findByIdentification', async () => {
      service.findByIdentification.mockResolvedValue(fakeResult);
      const result = await controller.findByIdentification('1104187768');
      expect(service.findByIdentification).toHaveBeenCalledWith('1104187768');
      expect(result).toBe(fakeResult);
    });
  });

  describe('findByIdentificationMunicipality', () => {
    it('delegates to service.findByIdentificationMunicipality', async () => {
      service.findByIdentificationMunicipality.mockResolvedValue(fakeResult);
      const result = await controller.findByIdentificationMunicipality('1104187768');
      expect(service.findByIdentificationMunicipality).toHaveBeenCalledWith('1104187768');
      expect(result).toBe(fakeResult);
    });
  });

  describe('setUserStatus', () => {
    it('delegates to service.setUserStatus with dto.id and dto.enabled (disable)', async () => {
      service.setUserStatus.mockResolvedValue(fakeResult);
      const dto = { id: 'abc', enabled: false } as SetUserStatusDto;
      const result = await controller.setUserStatus(dto);
      expect(service.setUserStatus).toHaveBeenCalledWith('abc', false);
      expect(result).toBe(fakeResult);
    });

    it('delegates to service.setUserStatus with dto.id and dto.enabled (enable)', async () => {
      service.setUserStatus.mockResolvedValue(fakeResult);
      const dto = { id: 'abc', enabled: true } as SetUserStatusDto;
      const result = await controller.setUserStatus(dto);
      expect(service.setUserStatus).toHaveBeenCalledWith('abc', true);
      expect(result).toBe(fakeResult);
    });
  });

  describe('setUserStatusMunicipality', () => {
    it('delegates to service.setUserStatusMunicipality with dto.id and dto.enabled (disable)', async () => {
      service.setUserStatusMunicipality.mockResolvedValue(fakeResult);
      const dto = { id: 'abc', enabled: false } as SetUserStatusDto;
      const result = await controller.setUserStatusMunicipality(dto);
      expect(service.setUserStatusMunicipality).toHaveBeenCalledWith('abc', false);
      expect(result).toBe(fakeResult);
    });

    it('delegates to service.setUserStatusMunicipality with dto.id and dto.enabled (enable)', async () => {
      service.setUserStatusMunicipality.mockResolvedValue(fakeResult);
      const dto = { id: 'abc', enabled: true } as SetUserStatusDto;
      const result = await controller.setUserStatusMunicipality(dto);
      expect(service.setUserStatusMunicipality).toHaveBeenCalledWith('abc', true);
      expect(result).toBe(fakeResult);
    });
  });
});
