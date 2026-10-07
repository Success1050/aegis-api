import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import * as fs from 'fs';
import * as path from 'path';
import { AppModule } from '../src/app.module';

async function generateOpenApi() {
  console.log('Generating OpenAPI specification...');
  const app = await NestFactory.create(AppModule, { logger: false });

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
  const outputPath = path.join(process.cwd(), 'openapi.json');
  fs.writeFileSync(outputPath, JSON.stringify(document, null, 2), 'utf8');

  console.log(`✅ OpenAPI JSON exported successfully to: ${outputPath}`);
  await app.close();
}

generateOpenApi().catch((err) => {
  console.error('Failed to export OpenAPI specification:', err);
  process.exit(1);
});
