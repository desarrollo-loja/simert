import { ForbiddenException } from '@nestjs/common';
import { IncidentCategory } from 'src/common/glob/type/type_incident';
import { TypeRol } from 'src/common/glob/type/type_rol';

import { IncidentCapabilityGuard } from '../incident-capability.guard';

describe('IncidentCapabilityGuard', () => {
    const guard = new IncidentCapabilityGuard();
    const context = (roles: TypeRol[], incidentCategory: IncidentCategory) =>
        ({
            switchToHttp: () => ({
                getRequest: () => ({
                    user: { roles },
                    body: { incidentCategory },
                }),
            }),
        }) as any;

    it('allows sanctions only with the sanctions capability', () => {
        expect(
            guard.canActivate(
                context(
                    [TypeRol.CONTROLLER_SANCTIONS],
                    IncidentCategory.NOTIFICATION,
                ),
            ),
        ).toBe(true);
        expect(() =>
            guard.canActivate(
                context(
                    [TypeRol.CONTROLLER_LOGBOOK],
                    IncidentCategory.NOTIFICATION,
                ),
            ),
        ).toThrow(ForbiddenException);
    });

    it('allows logbook incidents only with the logbook capability', () => {
        expect(
            guard.canActivate(
                context(
                    [TypeRol.CONTROLLER_LOGBOOK],
                    IncidentCategory.INCIDENT_BITACORA,
                ),
            ),
        ).toBe(true);
    });

    it('allows administrators regardless of category', () => {
        expect(
            guard.canActivate(
                context([TypeRol.ADMIN], IncidentCategory.NOTIFICATION),
            ),
        ).toBe(true);
    });
});
