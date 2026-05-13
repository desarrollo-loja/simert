import { Body, Controller, ForbiddenException, Get, Param, Post, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Auth } from 'src/auth/decorators/auth.decorator';
import { GetUser } from 'src/auth/decorators/get-user.decorator';
import { JwtPayload } from 'src/auth/interfaces/jwt-payload.interface';
import { ApiStandardResponse } from 'src/common/decorators/api-standard-response.decorator';
import { CreateKeycloakUserDto } from 'src/common/dto/create-keycloak-user.dto';
import { LoginKeycloakClientDto } from 'src/common/dto/login-keycloak-client.dto';
import { UpdateKeycloakUserDto } from 'src/common/dto/update-keycloak-user.dto';
import { ErrorCode } from 'src/common/glob/error';

import { ChangePasswordDto } from './dto/change-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { KeycloakService } from './keycloak.service';
@ApiTags('Api - Keycloak')
@ApiBearerAuth('keycloak')
@Controller('api/keycloak')
export class KeycloakController {
  constructor(private readonly keycloakService: KeycloakService) { }

  // POST api/keycloak/login-client
  @ApiOperation({ summary: 'Login a ServiceHub client (citizen) against Keycloak realm GIM2_REALM_SERVICE_HUB' })
  @ApiStandardResponse({
    description: 'Keycloak token response (access_token, refresh_token, expires_in, refresh_expires_in)',
    errorCodes: [ErrorCode.NONE],
    data: {
      access_token: { type: 'string', example: 'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...' },
      refresh_token: { type: 'string', example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...' },
      expires_in: { type: 'number', example: 3600 },
      refresh_expires_in: { type: 'number', example: 1800 },
    },
  })
  @Post('login-client')
  loginClient(@Body() dto: LoginKeycloakClientDto) {
    return this.keycloakService.loginClient(dto);
  }

  // POST api/keycloak/login-client-municipality
  @ApiOperation({ summary: 'Login a municipal employee against Keycloak realm GIM2_REALM_MUNICIPIO_K' })
  @ApiStandardResponse({
    description: 'Keycloak token response for a municipal user',
    errorCodes: [ErrorCode.NONE],
    data: {
      access_token: { type: 'string', example: 'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...' },
      refresh_token: { type: 'string', example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...' },
      expires_in: { type: 'number', example: 3600 },
      refresh_expires_in: { type: 'number', example: 1800 },
    },
  })
  @Post('login-client-municipality')
  loginClientMunicipality(@Body() dto: LoginKeycloakClientDto) {
    return this.keycloakService.loginClientMunicipality(dto);
  }

  // POST api/keycloak/create-user
  @ApiOperation({ summary: 'Create a ServiceHub user in Keycloak' })
  @ApiStandardResponse({
    description: 'User created in Keycloak (userId is the Location header UUID)',
    errorCodes: [ErrorCode.NONE, ErrorCode.NOT_FOUND],
    data: {
      message: { type: 'string', example: 'Usuario creado exitosamente' },
      userId: { type: 'string', example: 'b1b9e0f0-1234-4aaa-9999-abcdefabcdef' },
    },
  })
  @Post('create-user')
  createUser(@Body() dto: CreateKeycloakUserDto) {
    return this.keycloakService.createUser(dto);
  }

  // POST api/keycloak/create-user municipal
  @ApiOperation({ summary: 'Create a municipal employee user in Keycloak' })
  @ApiStandardResponse({
    description: 'Municipal user created in Keycloak',
    errorCodes: [ErrorCode.NONE, ErrorCode.NOT_FOUND],
    data: {
      message: { type: 'string', example: 'Usuario creado exitosamente' },
      userId: { type: 'string', example: 'b1b9e0f0-1234-4aaa-9999-abcdefabcdef' },
    },
  })
  @Post('create-user-municipality')
  createUserMunicipality(@Body() dto: CreateKeycloakUserDto) {
    return this.keycloakService.createUserMunicipality(dto);
  }

  // PUT api/keycloak/update-user/:id
  @ApiOperation({ summary: 'Update a ServiceHub user in Keycloak' })
  @ApiStandardResponse({
    description: 'User updated in Keycloak',
    errorCodes: [ErrorCode.NONE, ErrorCode.NOT_FOUND],
    data: {
      message: { type: 'string', example: 'Usuario actualizado exitosamente' },
    },
  })
  @Put('update-user/:id')
  updateUser(@Param('id') id: string, @Body() dto: UpdateKeycloakUserDto) {
    return this.keycloakService.updateUser(id, dto);
  }

  // PUT api/keycloak/update-user-municipality/:id
  @ApiOperation({ summary: 'Update a municipal employee user in Keycloak' })
  @ApiStandardResponse({
    description: 'Municipal user updated in Keycloak',
    errorCodes: [ErrorCode.NONE, ErrorCode.NOT_FOUND],
    data: {
      message: { type: 'string', example: 'Usuario actualizado exitosamente' },
    },
  })
  @Put('update-user-municipality/:id')
  updateUserMunicipality(@Param('id') id: string, @Body() dto: UpdateKeycloakUserDto) {
    return this.keycloakService.updateUserMunicipality(id, dto);
  }

  // GET api/keycloak/find-by-username/:username
  @ApiOperation({ summary: 'Find a ServiceHub Keycloak user by exact username' })
  @ApiStandardResponse({
    description: 'List of matching Keycloak users (empty if not found)',
    errorCodes: [ErrorCode.NONE, ErrorCode.NOT_FOUND],
    data: {
      message: { type: 'string', example: 'Usuario encontrado exitosamente' },
      data: {
        isArray: true,
        type: 'object',
        example: [{ id: 'uuid', username: 'johndoe', email: 'john@example.com', enabled: true }],
      },
    },
  })

  @Get('find-by-username/:username')
  findByUsername(@Param('username') username: string) {
    return this.keycloakService.findByUsername(username);
  }

  // GET api/keycloak/find-by-email?email=...
  @ApiOperation({ summary: 'Find a ServiceHub Keycloak user by exact email' })
  @ApiStandardResponse({
    description: 'List of matching Keycloak users (empty if not found)',
    errorCodes: [ErrorCode.NONE, ErrorCode.NOT_FOUND],
    data: {
      message: { type: 'string', example: 'Usuario encontrado exitosamente' },
      data: {
        isArray: true,
        type: 'object',
        example: [{ id: 'uuid', username: 'johndoe', email: 'john@example.com', enabled: true }],
      },
    },
  })
  @Get('find-by-email')
  findByEmail(@Query('email') email: string) {
    return this.keycloakService.findByEmail(email);
  }

  @ApiOperation({ summary: 'Reset a ServiceHub user password by email (generates temp password and emails it)' })
  @ApiStandardResponse({
    description: 'Temp password generated in Keycloak and dispatched to parking_auth mail service',
    errorCodes: [ErrorCode.NONE, ErrorCode.NOT_FOUND],
    data: {
      message: { type: 'string', example: 'Contraseña temporal generada y enviada al correo' },
      userId: { type: 'string', example: 'b1b9e0f0-1234-4aaa-9999-abcdefabcdef' },
      emailSent: { type: 'boolean', example: true },
    },
  })

  @Post('reset-password')
  setUserPassword(@Body() dto: ResetPasswordDto) {
    return this.keycloakService.setUserPassword(dto.email);
  }

  @ApiOperation({ summary: 'Reset a municipal employee password by email' })
  @ApiStandardResponse({
    description: 'Temp password generated in Keycloak and dispatched to parking_auth mail service',
    errorCodes: [ErrorCode.NONE, ErrorCode.NOT_FOUND],
    data: {
      message: { type: 'string', example: 'Contraseña temporal generada y enviada al correo' },
      userId: { type: 'string', example: 'b1b9e0f0-1234-4aaa-9999-abcdefabcdef' },
      emailSent: { type: 'boolean', example: true },
    },
  })

  @Post('reset-password-municipality')
  setUserPasswordMunicipality(@Body() dto: ResetPasswordDto) {
    return this.keycloakService.setUserPasswordMunicipality(dto.email);
  }

  @ApiOperation({ summary: 'Change own password (authenticated client). Email in body must match the JWT email.' })
  @ApiStandardResponse({
    description: 'Password updated in Keycloak (no email sent — the user already knows it)',
    errorCodes: [ErrorCode.NONE, ErrorCode.NOT_FOUND],
    data: {
      message: { type: 'string', example: 'Contraseña actualizada exitosamente' },
      userId: { type: 'string', example: 'b1b9e0f0-1234-4aaa-9999-abcdefabcdef' },
    },
  })
  @Auth()
  @Post('change-password')
  changePassword(
    @GetUser() user: JwtPayload,
    @Body() dto: ChangePasswordDto,
  ) {
    if (user.email?.toLowerCase() !== dto.email.toLowerCase())
      throw new ForbiddenException('Solo puedes cambiar tu propia contraseña');

    return this.keycloakService.changePassword(dto.email, dto.newPassword);
  }

  // GET api/keycloak/find-by-identification?identification=...
  @ApiOperation({ summary: 'Find a ServiceHub Keycloak user by exact identification' })
  @ApiStandardResponse({
    description: 'List of matching Keycloak users (empty if not found)',
    errorCodes: [ErrorCode.NONE, ErrorCode.NOT_FOUND],
    data: {
      message: { type: 'string', example: 'Usuario encontrado exitosamente' },
      data: {
        isArray: true,
        type: 'object',
        example: [{ id: 'uuid', username: 'johndoe', email: 'john@example.com', enabled: true }],
      },
    },
  })
  @Get('find-by-identification')
  findByIdentification(@Query('identification') identification: string) {
    return this.keycloakService.findByIdentification(identification);
  }

  // GET api/keycloak/find-by-username/:username
  @ApiOperation({ summary: 'Find a municipal Keycloak user by exact username' })
  @ApiStandardResponse({
    description: 'List of matching municipal Keycloak users (empty if not found)',
    errorCodes: [ErrorCode.NONE, ErrorCode.NOT_FOUND],
    data: {
      message: { type: 'string', example: 'Usuario encontrado exitosamente' },
      data: {
        isArray: true,
        type: 'object',
        example: [{ id: 'uuid', username: 'admin01', email: 'admin@loja.gob.ec', enabled: true }],
      },
    },
  })

  @Get('find-by-username-municipality/:username')
  findByUsernameMunicipality(@Param('username') username: string) {
    return this.keycloakService.findByUsernameMunicipality(username);
  }

  // GET api/keycloak/find-by-email?email=...
  @ApiOperation({ summary: 'Find a municipal Keycloak user by exact email' })
  @ApiStandardResponse({
    description: 'List of matching municipal Keycloak users (empty if not found)',
    errorCodes: [ErrorCode.NONE, ErrorCode.NOT_FOUND],
    data: {
      message: { type: 'string', example: 'Usuario encontrado exitosamente' },
      data: {
        isArray: true,
        type: 'object',
        example: [{ id: 'uuid', username: 'admin01', email: 'admin@loja.gob.ec', enabled: true }],
      },
    },
  })
  @Get('find-by-email-municipality')
  findByEmailMunicipality(@Query('email') email: string) {
    return this.keycloakService.findByEmailMunicipality(email);
  }

  // GET api/keycloak/find-by-identification?identification=...
  @ApiOperation({ summary: 'Find a municipal Keycloak user by exact identification' })
  @ApiStandardResponse({
    description: 'List of matching municipal Keycloak users (empty if not found)',
    errorCodes: [ErrorCode.NONE, ErrorCode.NOT_FOUND],
    data: {
      message: { type: 'string', example: 'Usuario encontrado exitosamente' },
      data: {
        isArray: true,
        type: 'object',
        example: [{ id: 'uuid', username: 'admin01', email: 'admin@loja.gob.ec', enabled: true }],
      },
    },
  })
  @Get('find-by-identification-municipality')
  findByIdentificationMunicipality(@Query('identification') identification: string) {
    return this.keycloakService.findByIdentificationMunicipality(identification);
  }

}