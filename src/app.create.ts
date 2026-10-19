import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Logger } from 'nestjs-pino';
import cookieParser from 'cookie-parser';
import { createValidationException } from './shared/presentation/http/validation-exception.factory.js';

export function appCreate(app: INestApplication): void {
  app.useLogger(app.get(Logger));

  app.use(cookieParser());

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,

      validationError: {
        target: false,
        value: false,
      },
      exceptionFactory: createValidationException,
    }),
  );

  const allowedOrigins = (process.env.CORS_ORIGINS ?? 'http://localhost:5173')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  app.enableCors({
    origin: allowedOrigins,
    credentials: true,
  });
}
