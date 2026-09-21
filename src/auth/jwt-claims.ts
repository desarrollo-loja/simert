import { JwtPayload } from './interfaces';

const KNOWN_APPLICATION_IDS = [100, 300, 400];
const ROLE_APPLICATIONS: Record<string, number[]> = {
    CLIENT: [100],
    client: [100],
    admin: [300],
    controller: [400],
    supervisor: [400],
    sale_point: [400],
    sale_point_card_sale: [400],
    sale_point_fine_query: [400],
    controller_parking_control: [400],
    controller_logbook: [400],
    controller_sanctions: [400],
    controller_fine_query: [400],
};

export const jwtIssuer = () => process.env.JWT_ISSUER || 'simert-auth';
export const jwtAudienceForApp = (idApp: number) => `simert-app:${idApp}`;
export const jwtSignOptionsForApp = (idApp: number) => ({
    issuer: jwtIssuer(),
    audience: jwtAudienceForApp(idApp),
});
export const isRoleAllowedForApplication = (role: string, idApp: number) =>
    !ROLE_APPLICATIONS[role] || ROLE_APPLICATIONS[role].includes(idApp);

export function validateJwtApplicationClaims(
    payload: JwtPayload,
    legacyCutoff: number,
): boolean {
    if (payload.roles?.includes('SERVER' as any)) return true;

    const hasClaims = Boolean(payload.iss || payload.aud);
    if (!hasClaims && payload.iat && payload.iat < legacyCutoff) return true;

    const allowedIds = (process.env.JWT_ALLOWED_APP_IDS || '')
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean)
        .map(Number)
        .filter(Number.isInteger);
    const acceptedIds =
        allowedIds.length > 0 ? allowedIds : KNOWN_APPLICATION_IDS;
    const expectedAudience = jwtAudienceForApp(payload.idApp);
    const audiences = Array.isArray(payload.aud) ? payload.aud : [payload.aud];

    return (
        acceptedIds.includes(payload.idApp) &&
        payload.iss === jwtIssuer() &&
        audiences.includes(expectedAudience)
    );
}
