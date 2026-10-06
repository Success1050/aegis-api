import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { LoggerModule } from 'nestjs-pino';
import { JwtModule } from '@nestjs/jwt';
import { ScheduleModule } from '@nestjs/schedule';
import { randomUUID } from 'crypto';
import { validateEnv, configuration } from './config';
import { PrismaModule } from './database';
import { RequestIdMiddleware, REQUEST_ID_HEADER, JwtAuthGuard, RolesGuard, CommonModule } from './common';
import { HealthModule } from './modules/health/health.module';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { LocationsModule } from './modules/locations/locations.module';
import { IncidentsModule } from './modules/incidents/incidents.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { AlertsModule } from './modules/alerts/alerts.module';
import { AuditModule } from './modules/audit/audit.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';

@Module({
  imports: [
    // Global Configuration with Zod validation
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateEnv,
      load: [configuration],
      envFilePath: ['.env.local', '.env'],
    }),

    // Structured JSON Logging via Pino
    LoggerModule.forRootAsync({
      useFactory: () => {
        const isProduction = process.env.NODE_ENV === 'production';
        return {
          pinoHttp: {
            level: isProduction ? 'info' : 'debug',
            transport: isProduction
              ? undefined
              : {
                  target: 'pino-pretty',
                  options: {
                    colorize: true,
                    singleLine: true,
                    translateTime: 'yyyy-mm-dd HH:MM:ss.l o',
                  },
                },
            genReqId: (req) =>
              ((req.headers[REQUEST_ID_HEADER] as string) || (req.id as string) || randomUUID()),
            redact: {
              paths: [
                'req.headers.authorization',
                'req.headers.cookie',
                'req.body.password',
                'req.body.token',
                'req.body.refreshToken',
              ],
              censor: '[REDACTED]',
            },
          },
        };
      },
    }),

    // Core Database, Common & Health Modules
    PrismaModule,
    CommonModule,
    HealthModule,
    ScheduleModule.forRoot(),
    JwtModule.register({ global: true }),

    // Feature Modules (Aegis specification)
    AuthModule,
    UsersModule,
    LocationsModule,
    IncidentsModule,
    NotificationsModule,
    AlertsModule,
    AuditModule,
    DashboardModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
    {
      provide: APP_GUARD,
      useClass: RolesGuard,
    },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(RequestIdMiddleware).forRoutes('*');
  }
}
