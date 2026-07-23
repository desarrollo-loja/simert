import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { CommonAuthService } from 'src/common/common.auth.service';
import { ErrorCode } from 'src/common/glob/error';
import { TypeRol } from 'src/common/glob/type/type_rol';

import { JwtPayload } from '../interfaces/jwt-payload.interface';

/**
 * Passport JWT strategy that validates bearer tokens and resolves the
 * authenticated user for protected routes.
 */
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
    /**
     * Creates a new JwtStrategy and configures the JWT secret and extractor.
     * @param commonAuthService Shared auth service used to resolve users from token claims.
     */
    constructor(private readonly commonAuthService: CommonAuthService) {
        super({
            secretOrKey: process.env.JWT_SECREAT,
            jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
        });
    }

    /**
     * Validates the decoded JWT payload and ensures the user exists and is active.
     * @param payload Decoded JWT payload containing the user id and roles.
     * @returns The validated JWT payload.
     * @throws UnauthorizedException When the token is invalid or the user is inactive.
     */
    async validate(payload: JwtPayload): Promise<JwtPayload> {
        const { id, roles } = payload;

        if (roles?.includes(TypeRol.SERVER)) return payload as any;

        const { errorCode, data: user } =
            await this.commonAuthService.findUserByIdAndApplication(id);

        if (errorCode !== ErrorCode.NONE || !user)
            throw new UnauthorizedException('Token not valid');

        if (!user.isActive)
            throw new UnauthorizedException(
                'User is inactive, talk with an admin',
            );

        return payload;
    }
}
