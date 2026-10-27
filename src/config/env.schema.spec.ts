import { describe, expect, it } from 'vitest';

import { envSchema } from './env.schema.js';

const validLogoUrl = 'https://assets.example.test/tarkhineh-logo-white.png';

const validBaseEnv = {
  NODE_ENV: 'development',
  DATABASE_URL: 'postgresql://user:password@localhost:5432/test',
  JWT_ACCESS_SECRET: 'a'.repeat(32),
  EMAIL_TOKEN_ENCRYPTION_KEY: Buffer.alloc(32, 1).toString('base64'),
  OUTBOUND_EMAIL_PAYLOAD_ENCRYPTION_KEY: Buffer.alloc(32, 2).toString('base64'),
};

describe('envSchema', () => {
  it('accepts a valid development configuration without SMTP', () => {
    const result = envSchema.safeParse(validBaseEnv);

    expect(result.success).toBe(true);

    if (result.success) {
      expect(result.data.PORT).toBe(3000);
      expect(result.data.JWT_ACCESS_TTL_SECONDS).toBe(900);
      expect(result.data.EMAIL_VERIFICATION_TTL_SECONDS).toBe(1800);
      expect(result.data.REDIS_HOST).toBe('127.0.0.1');
      expect(result.data.REDIS_PORT).toBe(6379);
      expect(result.data.RATE_LIMIT_KEY_PREFIX).toBe('tarkhineh:rate-limit:v1');
      expect(result.data.OUTBOUND_EMAIL_LOGO_URL).toBeUndefined();
    }
  });

  it('rejects an invalid email token encryption key', () => {
    const result = envSchema.safeParse({
      ...validBaseEnv,
      EMAIL_TOKEN_ENCRYPTION_KEY: 'not-a-valid-key',
    });

    expect(result.success).toBe(false);
  });

  it('rejects a short JWT secret', () => {
    const result = envSchema.safeParse({
      ...validBaseEnv,
      JWT_ACCESS_SECRET: 'too-short',
    });

    expect(result.success).toBe(false);
  });

  it('rejects an invalid database URL', () => {
    const result = envSchema.safeParse({
      ...validBaseEnv,
      DATABASE_URL: 'not-a-database-url',
    });

    expect(result.success).toBe(false);
  });

  it('requires SMTP configuration in production', () => {
    const result = envSchema.safeParse({
      ...validBaseEnv,
      NODE_ENV: 'production',
    });

    expect(result.success).toBe(false);
  });

  it('rejects partial SMTP configuration', () => {
    const result = envSchema.safeParse({
      ...validBaseEnv,
      SMTP_HOST: 'smtp.example.com',
    });

    expect(result.success).toBe(false);
  });

  it('requires HTTPS for the public API URL in production', () => {
    const result = envSchema.safeParse({
      ...validBaseEnv,
      NODE_ENV: 'production',
      SMTP_HOST: 'smtp.example.com',
      SMTP_USER: 'mailer',
      SMTP_PASSWORD: 'test-password',
      SMTP_FROM: 'noreply@example.com',
      API_PUBLIC_URL: 'http://api.example.com',
      OUTBOUND_EMAIL_LOGO_URL: validLogoUrl,
    });

    expect(result.success).toBe(false);

    if (!result.success) {
      expect(
        result.error.issues.some((issue) => issue.path[0] === 'API_PUBLIC_URL'),
      ).toBe(true);
    }
  });

  it('accepts complete SMTP configuration in development', () => {
    const result = envSchema.safeParse({
      ...validBaseEnv,
      SMTP_HOST: 'smtp.example.com',
      SMTP_USER: 'mailer',
      SMTP_PASSWORD: 'test-password',
      SMTP_FROM: 'noreply@example.com',
      API_PUBLIC_URL: 'http://localhost:3000',
      OUTBOUND_EMAIL_LOGO_URL: validLogoUrl,
    });

    expect(result.success).toBe(true);
  });

  it('rejects an invalid Redis port', () => {
    const result = envSchema.safeParse({
      ...validBaseEnv,
      REDIS_PORT: '70000',
    });

    expect(result.success).toBe(false);
  });

  it('rejects rate-limit prefixes containing unsupported characters', () => {
    const result = envSchema.safeParse({
      ...validBaseEnv,
      RATE_LIMIT_KEY_PREFIX: 'tarkhineh:{unsafe}',
    });

    expect(result.success).toBe(false);
  });

  it('defaults the frontend URL for development', () => {
    const result = envSchema.safeParse(validBaseEnv);

    expect(result.success).toBe(true);

    if (result.success) {
      expect(result.data.FRONTEND_URL).toBe('http://localhost:5173');
    }
  });

  it('rejects HTTP frontend URLs in production', () => {
    const result = envSchema.safeParse({
      ...validBaseEnv,
      NODE_ENV: 'production',
      FRONTEND_URL: 'http://tarkhineh.com',
      SMTP_HOST: 'smtp.example.com',
      SMTP_USER: 'mailer',
      SMTP_PASSWORD: 'test-password',
      SMTP_FROM: 'noreply@example.com',
      API_PUBLIC_URL: 'https://api.example.com',
      OUTBOUND_EMAIL_LOGO_URL: validLogoUrl,
    });

    expect(result.success).toBe(false);

    if (!result.success) {
      expect(
        result.error.issues.some((issue) => issue.path[0] === 'FRONTEND_URL'),
      ).toBe(true);
    }
  });

  it('accepts HTTPS frontend URLs in production', () => {
    const result = envSchema.safeParse({
      ...validBaseEnv,
      NODE_ENV: 'production',
      FRONTEND_URL: 'https://tarkhineh.com',
      SMTP_HOST: 'smtp.example.com',
      SMTP_USER: 'mailer',
      SMTP_PASSWORD: 'test-password',
      SMTP_FROM: 'noreply@example.com',
      API_PUBLIC_URL: 'https://api.example.com',
      OUTBOUND_EMAIL_LOGO_URL: validLogoUrl,
    });

    expect(result.success).toBe(true);
  });
});
