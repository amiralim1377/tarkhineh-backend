import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { LoggerModule } from 'nestjs-pino';

import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { IdentityAccessModule } from './contexts/identity-access/identity-access.module.js';
import { HealthModule } from './health/health.module.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { envSchema } from './config/env.schema.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validationSchema: envSchema,
    }),

    LoggerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const isProduction = config.get<string>('NODE_ENV') === 'production';

        return {
          pinoHttp: {
            level:
              config.get<string>('LOG_LEVEL') ??
              (isProduction ? 'info' : 'debug'),

            redact: {
              paths: [
                'req.headers.authorization',
                'req.headers.cookie',
                'res.headers["set-cookie"]',
                'password',
                'passwordHash',
                'token',
                'tokenHash',
                'accessToken',
                'refreshToken',
                '*.password',
                '*.passwordHash',
                '*.token',
                '*.tokenHash',
                '*.accessToken',
                '*.refreshToken',
              ],
              censor: '[REDACTED]',
            },

            serializers: {
              req(req) {
                const request = req as typeof req & {
                  id?: string | number;
                };

                return {
                  id: request.id,
                  method: req.method,
                  url: req.url?.split('?')[0],
                  remoteAddress: req.socket?.remoteAddress,
                };
              },

              res(res) {
                return {
                  statusCode: res.statusCode,
                };
              },
            },

            ...(!isProduction
              ? {
                  transport: {
                    target: 'pino-pretty',
                    options: {
                      colorize: true,
                      singleLine: true,
                      translateTime: 'SYS:standard',
                      ignore: 'pid,hostname',
                    },
                  },
                }
              : {}),
          },
        };
      },
    }),

    IdentityAccessModule,
    PrismaModule,
    HealthModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
