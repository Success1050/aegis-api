import { NestFactory } from '@nestjs/core';
import { ValidationPipe, VersioningType } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { Logger } from 'nestjs-pino';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module';
import { AllExceptionsFilter, REQUEST_ID_HEADER } from './common';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });

  // Use Pino Logger for all Nest application logging
  const logger = app.get(Logger);
  app.useLogger(logger);

  const configService = app.get(ConfigService);
  const port = configService.get<number>('port', 4000);
  const corsOrigins = configService.get<string[]>('corsOrigins', ['http://localhost:3000']);

  // Mount Cookie Parser for HttpOnly authentication tokens
  app.use(cookieParser());

  // Security Headers via Helmet
  app.use(
    helmet({
      contentSecurityPolicy: false, // Allows Swagger UI assets
      crossOriginEmbedderPolicy: false,
    }),
  );

  // Strict CORS Allowlist
  app.enableCors({
    origin: corsOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', REQUEST_ID_HEADER, 'Idempotency-Key'],
    exposedHeaders: [REQUEST_ID_HEADER, 'Idempotency-Key'],
  });

  // Global Exception Filter
  app.useGlobalFilters(new AllExceptionsFilter());

  // Global Validation Pipe with strict whitelisting
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );

  // Global API Prefix: /api/v1, excluding root, /health, and /ready
  app.setGlobalPrefix('api/v1', {
    exclude: ['', 'health', 'ready'],
  });

  // Enable Graceful Shutdown Hooks
  app.enableShutdownHooks();

  // Swagger / OpenAPI Documentation
  const swaggerConfig = new DocumentBuilder()
    .setTitle('AEGIS Early-Warning System API')
    .setDescription(
      'Community early-warning system alert delivery engine and manual incident management API for Nigerian communities.',
    )
    .setVersion('1.0.0')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        name: 'Authorization',
        description: 'Enter your Bearer access token',
        in: 'header',
      },
      'JWT-auth',
    )
    .addApiKey(
      {
        type: 'apiKey',
        name: 'Idempotency-Key',
        in: 'header',
        description: 'Idempotency key for mutating requests',
      },
      'Idempotency-Key',
    )
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/docs', app, document, {
    swaggerOptions: {
      persistAuthorization: true,
      tagsSorter: 'alpha',
      operationsSorter: 'alpha',
    },
  });

  await app.listen(port);
  logger.log(`🛡️  AEGIS API running on port ${port} (Environment: ${configService.get('nodeEnv')})`);
  logger.log(`📚 Swagger documentation available at http://localhost:${port}/api/docs`);
  logger.log(`🩺 Health probes available at http://localhost:${port}/health and http://localhost:${port}/ready`);
}

bootstrap().catch((err) => {
  console.error('Fatal bootstrap failure:', err);
  process.exit(1);
});
