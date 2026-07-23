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
 * Guard that authorizes a request by matching the authenticated user's roles
 * against the roles required by the route metadata.
 */
@Injectable()
export class UserRoleGuard implements CanActivate {
    /**
     * Creates a new UserRoleGuard.
     * @param reflector Reflector used to read the required-roles metadata from the route handler.
     */
    constructor(private readonly reflector: Reflector) {}

    /**
     * Determines whether the current request is allowed based on the required roles.
     * @param context Execution context providing access to the request and route handler.
     * @returns `true` when the route has no role requirements or the user owns a valid role.
     * @throws ForbiddenException When the user is missing or holds none of the required roles.
     */
    canActivate(
        context: ExecutionContext,
    ): boolean | Promise<boolean> | Observable<boolean> {
        const req = context.switchToHttp().getRequest();

        const validRoles: string[] = this.reflector.get(
            META_ROLES,
            context.getHandler(),
        );

        // If the route has no required roles, allow access
        if (!validRoles || validRoles.length === 0) return true;

        // Retrieve the user attached by the AuthGuard
        const user = req.user;

        // Guard against a missing user object (should never happen when AuthGuard is applied)
        if (!user) {
            throw new ForbiddenException('User not found');
        }

        // Check whether any of the user's roles matches the required ones
        if (user.roles) {
            for (const role of user.roles) {
                if (validRoles.includes(role)) {
                    return true;
                }
            }
        }

        // If the user holds none of the roles, throw 403
        throw new ForbiddenException(
            `User need a valid role: [ ${validRoles} ]`,
        );
    }
}
