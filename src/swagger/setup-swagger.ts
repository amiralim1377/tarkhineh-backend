import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

export function setupSwagger(app: INestApplication): void {
  const config = new DocumentBuilder()
    .setTitle('Tarkhineh Backend API')
    .setDescription(
      'OpenAPI documentation for the Tarkhineh backend services.',
    )
    .setVersion('0.0.1')
    .addTag('Health', 'Application health endpoints')
    .addTag(
      'Identity & Access',
      'Registration, authentication, and email verification',
    )
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'Enter an access token issued by the login endpoint.',
      },
      'access-token',
    )
    .build();

  const document = SwaggerModule.createDocument(app, config, {
    operationIdFactory: (_controllerKey, methodKey) => methodKey,
  });

  SwaggerModule.setup('api/docs', app, document, {
    jsonDocumentUrl: 'api/docs-json',
    yamlDocumentUrl: 'api/docs-yaml',
    customSiteTitle: 'Tarkhineh API Documentation',
    swaggerOptions: {
      persistAuthorization: false,
      displayRequestDuration: true,
      filter: true,
      docExpansion: 'list',
    },
  });
}
