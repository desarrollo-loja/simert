import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CommonAuthModule } from 'src/common/common.auth.module';
import { LoggerModule } from 'src/common/logger.module';

import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtStrategy } from './strategies/jwt.strategy';

/**
 *
 */
@Module({
    controllers: [AuthController],
    providers: [AuthService, JwtStrategy],
    imports: [
        TypeOrmModule.forFeature([]),
        PassportModule.register({ defaultStrategy: 'jwt' }),
        JwtModule.registerAsync({
            imports: [],
            inject: [],
            useFactory: () => {
                return {
                    secret: process.env.JWT_SECREAT,
                    signOptions: { expiresIn: '60m' },
                };
            },
        }),
        CommonAuthModule,
        // KeycloakTokenGuard is applied through the @Auth() decorator, so it is
        // instantiated in the module of whichever controller uses it. Exporting
        // LoggerModule from here — already imported by every such module for
        // JwtService — guarantees the guard can always resolve LoggerService.
        LoggerModule,
    ],
    exports: [
        TypeOrmModule,
        JwtStrategy,
        PassportModule,
        JwtModule,
        LoggerModule,
    ],
})
export class AuthModule {}
