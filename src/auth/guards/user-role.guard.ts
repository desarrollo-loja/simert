import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable } from 'rxjs';

import { META_ROLES } from '../decorators/role-protected.decorator';
@Injectable()
export class UserRoleGuard implements CanActivate {

  constructor(
    private readonly reflector: Reflector,
  ) { }

  canActivate(context: ExecutionContext): boolean | Promise<boolean> | Observable<boolean> {
    const req = context.switchToHttp().getRequest();

    const validRoles: string[] = this.reflector.get(META_ROLES, context.getHandler());
    
    // Si no hay roles requeridos para la ruta, permitimos el acceso
    if (!validRoles || validRoles.length === 0) return true;

    // Obtenemos el usuario que adjuntó el AuthGuard
    const user = req.user;

    // Si por alguna razón el usuario llega nulo (no debería si usas AuthGuard)
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
