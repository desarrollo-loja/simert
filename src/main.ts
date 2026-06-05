import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';

import { AppModule } from './app.module';
import { TypePrefix } from './common/glob/type/type_prefix';
const expressip = require('express-ip');

const developmentDomain = process.env.DEVELOPMENT_ALLOWED_DOMAIN || '"https://www.web.clipp.app", "https://web.clipp.app", "http://localhost:8080", "https://localhost:8080"';
const productionDomain = process.env.PRODUCTION_ALLOWED_DOMAIN || '"https://www.maas.clipp.app", "https://maas.clipp.app", "https://teva.clipp.app", "https://www.teva.clipp.app"';

const development: string[] = developmentDomain.replace(/"/g, '').split(',').map(s => s.trim());
const production: string[] = productionDomain.replace(/"/g, '').split(',').map(s => s.trim());

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.enableShutdownHooks();

  app.setGlobalPrefix(TypePrefix.API_SIMERT);
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
    })
  );

  app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    if (process.env.NODE_ENV === 'development') {
      development.forEach(dominio => {
        res.setHeader('Access-Control-Allow-Origin', dominio);
      });
    }
    else if (process.env.NODE_ENV === 'production') {
      production.forEach(dominio => {
        res.setHeader('Access-Control-Allow-Origin', dominio);
      });
    }
    next();
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
    })
  );

  const allowedOrigins = [];
  if (process.env.NODE_ENV === 'development') {
    development.forEach(dominio => {
      allowedOrigins.push(dominio);
    });
  }
  else if (process.env.NODE_ENV === 'production') {
    production.forEach(dominio => {
      allowedOrigins.push(dominio);
    });
  }

  const swaggerConfig = new DocumentBuilder()
    .setTitle('Parking Simert API')
    .setDescription('Documentación de la API del sistema Parking Simert (admin, client, api).')
    .setVersion(process.env.npm_package_version || '1.0.0')
    .addBearerAuth(
      { type: 'http', scheme: 'bearer', bearerFormat: 'JWT', name: 'Authorization', in: 'header' },
      'keycloak',
    )
    .addTag('Auth', 'Autenticación y tokens')
    .addTag('Admin', 'Endpoints de administración')
    .addTag('Client', 'Endpoints consumidos por la app cliente')
    .addTag('Api', 'Integraciones externas (GIM, Keycloak, Ant, Portal, Dinardap)')
    .addTag('Public', 'Public read-only endpoints for third-party consumers, mobile apps and maps')
    .build();
  const swaggerDocument = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup(`${TypePrefix.API_SIMERT}internal/docs`, app, swaggerDocument, {
    swaggerOptions: {
      persistAuthorization: true,
      tagsSorter: 'alpha',
      operationsSorter: 'alpha',
    },
  });

  app.enableCors({
    origin: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'platform', 'brand', 'versionapp'],
    credentials: true,
    exposedHeaders: ['x-token'],
  });
  await app.listen(process.env.PORT_SERVER);
}

bootstrap();
