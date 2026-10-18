import { z } from 'zod';

const emptyToUndefined = (value: unknown): unknown => {
  if (typeof value === 'string' && value.trim() === '') {
    return undefined;
  }

  return value;
};

const optionalText = z.preprocess(
  emptyToUndefined,
  z.string().trim().min(1).optional(),
);

const optionalSecret = z.preprocess(
  emptyToUndefined,
  z.string().min(1).optional(),
);

const optionalPort = z.preprocess(
  emptyToUndefined,
  z.coerce.number().int().min(1).max(65535).optional(),
);

const optionalSmtpSecure = z.preprocess(
  emptyToUndefined,
  z.enum(['true', 'false']).optional(),
);

const optionalPublicUrl = z.preprocess(
  emptyToUndefined,
  z
    .string()
    .url()
    .refine((value) => {
      const url = new URL(value);
      return url.protocol === 'http:' || url.protocol === 'https:';
    }, 'API_PUBLIC_URL must use HTTP or HTTPS')
    .optional(),
);

export const envSchema = z
  .object({
    NODE_ENV: z
      .enum(['development', 'test', 'production'])
      .default('development'),

    PORT: z.coerce.number().int().min(1).max(65535).default(3000),

    LOG_LEVEL: z
      .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
      .default('debug'),

    DATABASE_URL: z.string().refine((value) => {
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

    JWT_ACCESS_TTL_SECONDS: z.coerce.number().int().positive().default(900),

    EMAIL_VERIFICATION_TTL_SECONDS: z.coerce
      .number()
      .int()
      .positive()
      .default(1800),

    CORS_ORIGINS: z.string().default('http://localhost:5173'),

    SMTP_HOST: optionalText,
    SMTP_PORT: optionalPort,
    SMTP_SECURE: optionalSmtpSecure,
    SMTP_USER: optionalText,
    SMTP_PASSWORD: optionalSecret,
    SMTP_FROM: optionalText,
    API_PUBLIC_URL: optionalPublicUrl,
  })
  .superRefine((env, ctx) => {
    const smtpConfigured = [
      env.SMTP_HOST,
      env.SMTP_USER,
      env.SMTP_PASSWORD,
      env.SMTP_FROM,
    ].some((value) => value !== undefined);

    const smtpRequiredFields = [
      ['SMTP_HOST', env.SMTP_HOST],
      ['SMTP_USER', env.SMTP_USER],
      ['SMTP_PASSWORD', env.SMTP_PASSWORD],
      ['SMTP_FROM', env.SMTP_FROM],
      ['API_PUBLIC_URL', env.API_PUBLIC_URL],
    ] as const;

    if (env.NODE_ENV === 'production' && !smtpConfigured) {
      ctx.addIssue({
        code: 'custom',
        path: ['SMTP_HOST'],
        message: 'SMTP configuration is required in production',
      });

      return;
    }

    if (!smtpConfigured) {
      return;
    }

    for (const [key, value] of smtpRequiredFields) {
      if (value === undefined) {
        ctx.addIssue({
          code: 'custom',
          path: [key],
          message: `${key} is required when SMTP is configured`,
        });
      }
    }

    if (
      env.NODE_ENV === 'production' &&
      env.API_PUBLIC_URL !== undefined &&
      new URL(env.API_PUBLIC_URL).protocol !== 'https:'
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['API_PUBLIC_URL'],
        message: 'API_PUBLIC_URL must use HTTPS in production',
      });
    }
  });
