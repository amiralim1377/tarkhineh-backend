import { randomUUID } from 'node:crypto';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { LoggerModule } from 'nestjs-pino';

import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { IdentityAccessModule } from './contexts/identity-access/identity-access.module.js';
import { HealthModule } from './health/health.module.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { envSchema } from './config/env.schema.js';
import { APP_FILTER } from '@nestjs/core';
import { GlobalHttpExceptionFilter } from './shared/presentation/http/global-http-exception.filter.js';
import { BullModule } from '@nestjs/bullmq';
import { ScheduleModule } from '@nestjs/schedule';
import { SharedModule } from './shared/shared.module.js';
import { OutboundEmailModule } from './contexts/outbound-email/outbound-email.module.js';
import './queue/redis-client.factory.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validationSchema: envSchema,
    }),
    BullModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        connection: {
          host: configService.getOrThrow<string>('REDIS_HOST'),
          port: Number(configService.getOrThrow('REDIS_PORT')),
        },
        prefix: configService.getOrThrow<string>('BULLMQ_PREFIX'),
      }),
    }),
    ScheduleModule.forRoot(),
    LoggerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const isProduction = config.get<string>('NODE_ENV') === 'production';

        return {
          pinoHttp: {
            // Never trust a caller-supplied X-Request-Id as the internal ID.
            // Generate a new globally unique correlation ID per inbound request.
            genReqId: (_request, response) => {
              const requestId = randomUUID();
              response.setHeader('X-Request-Id', requestId);
              return requestId;
            },

            // Put the same ID at the top level of every request-context log.
            customProps: (request) => ({ requestId: String(request.id) }),
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
    SharedModule,
    OutboundEmailModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_FILTER,
      useClass: GlobalHttpExceptionFilter,
    },
  ],
})
export class AppModule {}
