import { RequestMethod, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';

import { PAID_OBLIGATIONS_ROUTE } from './api/gim/external-simert.controller';
import { AppModule } from './app.module';
import { TypePrefix } from './common/glob/type/type_prefix';
import { PublicModule } from './public/public.module';
import { setupObservability } from './observability/observability';
// express-ip is a CommonJS module loaded via require to preserve its runtime
// interop in this already-deployed bootstrap.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const expressip = require('express-ip');

const developmentDomain =
    process.env.DEVELOPMENT_ALLOWED_DOMAIN ||
    '"http://localhost:8080", "https://localhost:8080"';
const productionDomain =
    process.env.PRODUCTION_ALLOWED_DOMAIN || '"http://181.113.129.20"';

const development: string[] = developmentDomain
    .replace(/"/g, '')
    .split(',')
    .map((s) => s.trim());
const production: string[] = productionDomain
    .replace(/"/g, '')
    .split(',')
    .map((s) => s.trim());

/**
 * Bootstraps the NestJS application: creates the app, configures global
 * settings, middleware, CORS, Swagger and starts listening for requests.
 */
async function bootstrap() {
    const app = await NestFactory.create(AppModule);
    setupObservability(app, 'simert');

    app.enableShutdownHooks();

    // The paid-obligations resource is published under the municipality's own
    // external path (`/api/external/simert/...`, memorando ML-DT-2026-0819-M),
    // so the `api/simert/` service prefix must not be prepended to it. Every
    // other route keeps the prefix. Reaching it also needs the deployment to
    // proxy `/api/external/` here, which nginx does not do by default.
    app.setGlobalPrefix(TypePrefix.API_SIMERT, {
        exclude: [{ path: PAID_OBLIGATIONS_ROUTE, method: RequestMethod.POST }],
    });
    app.use(expressip().getIpInfoMiddleware);
    app.use(
        helmet({
            contentSecurityPolicy: false,
            hsts: false,
            crossOriginOpenerPolicy: false,
            originAgentCluster: false,
            crossOriginEmbedderPolicy: false,
            hidePoweredBy: true,
            xssFilter: true,
            frameguard: {
                action: 'sameorigin',
            },
        }),
    );

    app.useGlobalPipes(
        new ValidationPipe({
            whitelist: true,
            forbidNonWhitelisted: true,
        }),
    );

    const swaggerConfig = new DocumentBuilder()
        .setTitle('Parking Simert API')
        .setDescription(
            'Documentación de la API del sistema Parking Simert (admin, client, api).',
        )
        .setVersion(process.env.npm_package_version || '1.0.0')
        .addBearerAuth(
            {
                type: 'http',
                scheme: 'bearer',
                bearerFormat: 'JWT',
                name: 'Authorization',
                in: 'header',
            },
            'keycloak',
        )
        .addTag('Auth', 'Autenticación y tokens')
        .addTag('Admin', 'Endpoints de administración')
        .addTag('Client', 'Endpoints consumidos por la app cliente')
        .addTag(
            'Api',
            'Integraciones externas (GIM, Keycloak, Ant, Portal, Dinardap)',
        )
        .addTag(
            'Public',
            'Public read-only endpoints for third-party consumers, mobile apps and maps',
        )
        .build();
    const swaggerDocument = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup(
        `${TypePrefix.API_SIMERT}internal/docs`,
        app,
        swaggerDocument,
        {
            swaggerOptions: {
                persistAuthorization: true,
                tagsSorter: 'alpha',
                operationsSorter: 'alpha',
            },
        },
    );

    // Public-only API documentation. Scoped to `PublicModule` via the `include`
    // option so it exposes solely the unauthenticated read-only endpoints meant
    // for third-party consumers, mobile apps and maps. The full internal docs
    // (Auth, Admin, Client, Api) remain available at `internal/docs`.
    const publicSwaggerConfig = new DocumentBuilder()
        .setTitle('Parking Simert Public API')
        .setDescription(
            'Public read-only endpoints for third-party consumers, mobile apps and maps (zones, sectors, schedules, availability, map data).',
        )
        .setVersion(process.env.npm_package_version || '1.0.0')
        .addTag(
            'Public',
            'Public read-only endpoints for third-party consumers, mobile apps and maps',
        )
        .build();
    const publicSwaggerDocument = SwaggerModule.createDocument(
        app,
        publicSwaggerConfig,
        {
            include: [PublicModule],
        },
    );
    SwaggerModule.setup(
        `${TypePrefix.API_SIMERT}public/docs`,
        app,
        publicSwaggerDocument,
        {
            swaggerOptions: {
                tagsSorter: 'alpha',
                operationsSorter: 'alpha',
            },
        },
    );

    app.enableCors({
        origin:
            process.env.NODE_ENV === 'development' ? development : production,
        methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
        allowedHeaders: [
            'Content-Type',
            'Authorization',
            'X-Correlation-ID',
            'platform',
            'brand',
            'versionapp',
        ],
        credentials: true,
        exposedHeaders: ['x-token', 'X-Correlation-ID'],
    });
    await app.listen(process.env.PORT_SERVER);
}

bootstrap();
