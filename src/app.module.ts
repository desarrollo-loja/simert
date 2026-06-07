//Si se importa CommonCacheModule se debe importar  CacheModule redisStore y configurar   CacheModule.register({
import { CacheModule } from '@nestjs/cache-manager';
import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import * as redisStore from 'cache-manager-redis-store';

import { AgentActivitiesModule as AgentActivitiesModuleAdmin } from './admin/agent-activities/agent-activities.module';
import { BlockModule } from './admin/block/block.module';
import { BlockOperatorModule } from './admin/block_operator/block_operator.module';
import { CardModule } from './admin/card/card.module';
import { CatalogModule } from './admin/catalog/catalog.module';
import { CheckboxModule as CheckboxModuleAdmin } from './admin/checkbox/checkbox.module';
import { CheckboxUserModule } from './admin/checkbox-user/checkbox-user.module';
import { FractionModule } from './admin/fraction/fraction.module';
import { FractionStatusModule } from './admin/fraction_status/fraction_status.module';
import { IncidentModule as IncidentModuleAdmin } from './admin/incident/incident.module';
import { IncidentNotificationModule } from './admin/incident-notification/incident-notification.module';
import { IncidentPaymentModule } from './admin/incident-payment/incident-payment.module';
import { IncidentTypeModule as IncidentTypeModuleAdmin } from './admin/incident-type/incident-type.module';
import { LModule } from './admin/l/l.module';
import { PhysicsModule } from './admin/physics/physics.module';
import { RangeModule } from './admin/range/range.module';
import { RangeSalePointModule } from './admin/range-sale-point/range-sale-point.module';
import { RangeSalePointTransactionModule as RangeSalePointTransactionModuleAdmin } from './admin/range-sale-point-transaction/range-sale-point-transaction.module';
import { SalePointModule } from './admin/sale-point/sale-point.module';
import { ScheduleModule } from './admin/schedule/schedule.module';
import { SlotModule } from './admin/slot/slot.module';
import { StatusModule } from './admin/status/status.module';
import { SupportTicketModule as SupportTicketModuleAdmin } from './admin/support-ticket/support-ticket.module';
import { ZoneModule } from './admin/zone/zone.module';
import { AntModule } from './api/ant/ant.module';
import { DinardapAntModule } from './api/dinardap-ant/dinardap-ant.module';
import { GimModule } from './api/gim/gim.module';
import { KeycloakModule } from './api/keycloak/keycloak.module';
import { PortalModule } from './api/portal/portal.module';
import { AppController } from './app.controller';
import { AuthModule } from './auth/auth.module';
import { CheckModule } from './check/check.module';
import { AdminModule } from './client/admin/admin.module';
import { AgentActivitiesModule as AgentActivitiesModuleClient } from './client/agent-activities/agent-activities.module';
import { CheckboxModule as CheckboxModuleClient } from './client/checkbox/checkbox.module';
import { IncidentModule } from './client/incident/incident.module';
import { IncidentTypeModule } from './client/incident-type/incident-type.module';
import { MappingModule } from './client/mapping/mapping.module';
import { OperatorModule } from './client/operator/operator.module';
import { RangeSalePointModule as RangeSalePointModuleClient } from './client/range-sale-point/range-sale-point.module';
import { RangeSalePointTransactionModule as RangeSalePointTransactionModuleClient } from './client/range-sale-point-transaction/range-sale-point-transaction.module';
import { SalePointModule as SalePointModuleClient } from './client/sale-point/sale-point.module';
import { SimertModule } from './client/simert/simert.module';
import { SupportTicketModule } from './client/support-ticket/support-ticket.module';
import { TrakingModule } from './client/traking/traking.module';
import { CommonCacheModule } from './common/common.cache.module';
import { CommonModule } from './common/common.module';
import { LoggerModule } from './common/logger.module';
import { ResponseTimeMiddleware } from './common/response-time.middleware';
import { DataModule } from './data/data.module';
import { IncidentCheckModule } from './incident/incident.module';
import { PublicModule } from './public/public.module';

/**
 *
 */
@Module({
  imports: [
    ConfigModule.forRoot(),
    CacheModule.register({
      isGlobal: true,
      store: redisStore,
      host: process.env.DB_HOST_CACHE,
      port: +process.env.DB_PORT_CACHE,
      password: process.env.DB_PASSWORD_CACHE,
      prefix: process.env.NODE_ENV === 'production' ? `P|` : `D|`, // Prefijo basado en el entorno para generar keys diferentes para ambos entornos del mismo recurso
      // Default cache TTL is 5 s; override per method as needed:
      // ttl: 10, // seconds
      // max: 20, // maximum number of items in cache
      // ttl: null,  // Disable global default so per-method TTL is not overridden
    }),
    TypeOrmModule.forRoot({
      type: 'postgres',
      host: process.env.DB_HOST,
      port: +process.env.DB_PORT,
      username: process.env.DB_USERNAME,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,
      // insecureAuth: false,
      // ----------- OJO -----------
      // ALERTA NO MODIFICAR NUNCA--
      // ---- NI EN DESARROLLO -----
      //>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
      entities: [],
      autoLoadEntities: true, // Siempre true
      // keepConnectionAlive: true,// Siempre true
      // legacySpatialSupport: false,// Siempre true
      //>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
      //
      // NUNCA PONER EN TRUE EN SUS .ENV
      // SYNCHRONIZE=FALSE
      //
      synchronize: process.env.SYNCHRONIZE === 'TRUE',
      //
      // dropSchema: false,// NUNCA ACTIVAR
      // ALERTA NO MODIFICAR NUNCA--
      // ----------- OJO -----------
      extra: {
        connectionLimit: process.env.T_CONNECTIONLIMIT
          ? +process.env.T_CONNECTIONLIMIT
          : 10,
      },
      schema: 'public',
      //logging: ['query', 'error'],
    }),

    TypeOrmModule.forRoot({
      name: 'tracking',
      type: 'postgres', // Cambia el tipo de base de datos a MySQL
      host: process.env.DB_HOST_TRAKING,
      port: +process.env.DB_PORT_TRAKING,
      username: process.env.DB_USERNAME_TRAKING,
      password: process.env.DB_PASSWORD_TRAKING,
      database: process.env.DB_NAME_TRAKING,
      // ----------- OJO -----------
      // ALERTA NO MODIFICAR NUNCA--
      // ---- NI EN DESARROLLO -----
      //>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
      entities: [],
      autoLoadEntities: false, // Siempre true
      //keepConnectionAlive: true,// Siempre true
      //>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
      // debug: true,
      synchronize: false,
      // dropSchema: false,// NUNCA ACTIVAR
      // ALERTA NO MODIFICAR NUNCA--
      // ----------- OJO -----------,
      extra: {
        connectionLimit: process.env.H_CONNECTIONLIMIT
          ? +process.env.H_CONNECTIONLIMIT
          : 10,
      },
    }),
    TypeOrmModule.forRoot({
      name: 'tracking_controller',
      type: 'postgres', // Cambia el tipo de base de datos a MySQL
      host: process.env.DB_HOST_TRAKING_CONTROLLER,
      port: +process.env.DB_PORT_TRAKING_CONTROLLER,
      username: process.env.DB_USERNAME_TRAKING_CONTROLLER,
      password: process.env.DB_PASSWORD_TRAKING_CONTROLLER,
      database: process.env.DB_NAME_TRAKING_CONTROLLER,
      // ----------- OJO -----------
      // ALERTA NO MODIFICAR NUNCA--
      // ---- NI EN DESARROLLO -----
      //>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
      entities: [],
      autoLoadEntities: false, // Siempre true
      //keepConnectionAlive: true,// Siempre true
      //>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
      // debug: true,
      synchronize: process.env.SYNCHRONIZE === 'TRUE',

      // dropSchema: false,// NUNCA ACTIVAR
      // ALERTA NO MODIFICAR NUNCA--
      // ----------- OJO -----------,
      extra: {
        connectionLimit: process.env.H_CONNECTIONLIMIT
          ? +process.env.H_CONNECTIONLIMIT
          : 10,
      },
    }),
    LoggerModule,
    CommonModule,
    AuthModule,
    ConfigModule,
    SlotModule,
    BlockModule,
    ZoneModule,
    FractionModule,
    SimertModule,
    DataModule,
    StatusModule,
    FractionStatusModule,
    OperatorModule,
    BlockOperatorModule,
    CheckModule,
    IncidentCheckModule,
    CheckboxModuleAdmin,
    CheckboxModuleClient,
    CheckboxUserModule,
    CardModule,
    CommonCacheModule,
    AdminModule,
    MappingModule,
    ScheduleModule,
    TrakingModule,
    LModule,
    SalePointModule,
    RangeModule,
    PhysicsModule,
    SalePointModuleClient,
    IncidentTypeModule,
    IncidentTypeModuleAdmin,
    IncidentModule,
    IncidentModuleAdmin,
    IncidentPaymentModule,
    RangeSalePointModule,
    RangeSalePointModuleClient,
    RangeSalePointTransactionModuleAdmin,
    RangeSalePointTransactionModuleClient,
    SupportTicketModule,
    SupportTicketModuleAdmin,
    AgentActivitiesModuleAdmin,
    AgentActivitiesModuleClient,
    AntModule,
    GimModule,
    IncidentNotificationModule,
    PortalModule,
    DinardapAntModule,
    KeycloakModule,
    CatalogModule,
    PublicModule,
  ],
  controllers: [AppController],
})
export class AppModule implements NestModule {
  /**
   * Registers application-wide middleware.
   * @param consumer Middleware consumer used to apply middleware to routes.
   */
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(ResponseTimeMiddleware).forRoutes('*');
  }
}
