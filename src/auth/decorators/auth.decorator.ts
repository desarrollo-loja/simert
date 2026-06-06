import { applyDecorators, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { TypeRol } from 'src/common/glob/type/type_rol';

import { KeycloakTokenGuard } from '../guards/keycloak-token.guard';
import { UserRoleGuard } from '../guards/user-role.guard';
import { RoleProtected } from './role-protected.decorator';

/**
 *
 * @param {...any} roles
 */
// PascalCase is the NestJS convention for decorator factories (used as `@Auth`).
// eslint-disable-next-line @typescript-eslint/naming-convention
export function Auth(...roles: TypeRol[]) {
  return applyDecorators(
    RoleProtected(...roles),
    UseGuards(AuthGuard(), UserRoleGuard),
  );
}

/**
 *
 * @param {...any} roles
 */
// PascalCase is the NestJS convention for decorator factories (used as `@AuthWithKeycloak`).
// eslint-disable-next-line @typescript-eslint/naming-convention
export function AuthWithKeycloak(...roles: TypeRol[]) {
  return applyDecorators(
    RoleProtected(...roles),
    UseGuards(AuthGuard(), UserRoleGuard, KeycloakTokenGuard),
  );
}
