import { z } from 'zod';

export const envSchema = z.object({
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),

  PORT: z.coerce
    .number()
    .int()
    .min(1)
    .max(65535)
    .default(3000),

  LOG_LEVEL: z
    .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
    .default('debug'),

  DATABASE_URL: z
    .string()
    .refine((value) => {
      try {
        const url = new URL(value);

        return (
          ['postgres:', 'postgresql:'].includes(url.protocol) &&
          url.hostname.length > 0
        );
      } catch {
        return false;
      }
    }, 'DATABASE_URL must be a valid PostgreSQL URL'),

  JWT_ACCESS_SECRET: z
    .string()
    .min(32, 'JWT_ACCESS_SECRET must be at least 32 characters'),

  EMAIL_VERIFICATION_TTL_SECONDS: z.coerce
    .number()
    .int()
    .positive()
    .default(1800),

  CORS_ORIGINS: z
    .string()
    .default('http://localhost:5173'),
});
