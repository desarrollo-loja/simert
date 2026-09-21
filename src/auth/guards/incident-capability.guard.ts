import {
    CanActivate,
    ExecutionContext,
    ForbiddenException,
    Injectable,
} from '@nestjs/common';
import { IncidentCategory } from 'src/common/glob/type/type_incident';
import { TypeRol } from 'src/common/glob/type/type_rol';

/** Enforces the capability associated with the requested incident category. */
@Injectable()
export class IncidentCapabilityGuard implements CanActivate {
    /**
     * Checks sanctions, logbook and generic reports against their backend role.
     * @param context Current HTTP execution context.
     * @returns True when the authenticated user owns the required capability.
     */
    canActivate(context: ExecutionContext): boolean {
        const request = context.switchToHttp().getRequest();
        const roles: TypeRol[] = request.user?.roles ?? [];
        if (roles.includes(TypeRol.ADMIN)) return true;

        const requiredRole =
            request.body?.incidentCategory === IncidentCategory.NOTIFICATION
                ? TypeRol.CONTROLLER_SANCTIONS
                : request.body?.incidentCategory ===
                    IncidentCategory.INCIDENT_BITACORA
                  ? TypeRol.CONTROLLER_LOGBOOK
                  : TypeRol.CONTROLLER;

        if (roles.includes(requiredRole)) return true;
        throw new ForbiddenException(
            `The incident category requires role ${requiredRole}`,
        );
    }
}
