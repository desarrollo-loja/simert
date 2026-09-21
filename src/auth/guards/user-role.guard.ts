import {
    CanActivate,
    ExecutionContext,
    ForbiddenException,
    Injectable,
    Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable } from 'rxjs';

import { META_ROLES } from '../decorators/role-protected.decorator';
import { isRoleAllowedForApplication } from '../jwt-claims';
/**
 * Guard that authorizes a request by matching the authenticated user's roles
 * against the roles required by the route metadata.
 */
@Injectable()
export class UserRoleGuard implements CanActivate {
    private readonly logger = new Logger(UserRoleGuard.name);
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

        const validRoles: string[] = this.reflector.getAllAndOverride(
            META_ROLES,
            [context.getHandler(), context.getClass()],
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
                    if (isRoleAllowedForApplication(role, user.idApp))
                        return true;
                }
            }
        }

        // If the user holds none of the roles, throw 403
        this.logger.warn(
            `Authorization denied route=${req.method ?? 'UNKNOWN'} ${req.originalUrl ?? req.url ?? 'UNKNOWN'} userId=${user.id ?? 'UNKNOWN'} requiredRoles=${validRoles.join(',')}`,
        );
        throw new ForbiddenException(
            `User need a valid role: [ ${validRoles} ]`,
        );
    }
}
