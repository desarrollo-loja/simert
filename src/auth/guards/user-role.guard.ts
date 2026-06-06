import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable } from 'rxjs';

import { META_ROLES } from '../decorators/role-protected.decorator';
/**
 *
 */
@Injectable()
export class UserRoleGuard implements CanActivate {
  /**
   *
   * @param reflector
   */
  constructor(private readonly reflector: Reflector) {}

  /**
   *
   * @param context
   */
  canActivate(
    context: ExecutionContext,
  ): boolean | Promise<boolean> | Observable<boolean> {
    const req = context.switchToHttp().getRequest();

    const validRoles: string[] = this.reflector.get(
      META_ROLES,
      context.getHandler(),
    );

    // Si no hay roles requeridos para la ruta, permitimos el acceso
    if (!validRoles || validRoles.length === 0) return true;

    // Retrieve the user attached by the AuthGuard
    const user = req.user;

    // Guard against a missing user object (should never happen when AuthGuard is applied)
    if (!user) {
      throw new ForbiddenException('User not found');
    }

    // Verificamos si alguno de los roles del usuario coincide con los requeridos
    if (user.roles) {
      for (const role of user.roles) {
        if (validRoles.includes(role)) {
          return true;
        }
      }
    }

    // Si no tiene ninguno de los roles, lanzamos 403
    throw new ForbiddenException(`User need a valid role: [ ${validRoles} ]`);
  }
}
