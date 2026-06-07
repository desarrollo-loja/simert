import { applyDecorators, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { TypeRol } from 'src/common/glob/type/type_rol';

import { KeycloakTokenGuard } from '../guards/keycloak-token.guard';
import { UserRoleGuard } from '../guards/user-role.guard';
import { RoleProtected } from './role-protected.decorator';

/**
 * Composes the role protection metadata with the passport and role guards.
 *
 * @param {...TypeRol} roles Roles allowed to access the decorated handler.
 * @returns The combined decorator enforcing authentication and role checks.
 */
// PascalCase is the NestJS convention for decorator factories (used as `@Auth`).

export function Auth(...roles: TypeRol[]) {
  return applyDecorators(
    RoleProtected(...roles),
    UseGuards(AuthGuard(), UserRoleGuard),
  );
}

/**
 * Composes the role protection metadata with the passport, role and Keycloak guards.
 *
 * @param {...TypeRol} roles Roles allowed to access the decorated handler.
 * @returns The combined decorator enforcing Keycloak authentication and role checks.
 */
// PascalCase is the NestJS convention for decorator factories (used as `@AuthWithKeycloak`).

export function AuthWithKeycloak(...roles: TypeRol[]) {
  return applyDecorators(
    RoleProtected(...roles),
    UseGuards(AuthGuard(), UserRoleGuard, KeycloakTokenGuard),
  );
}
