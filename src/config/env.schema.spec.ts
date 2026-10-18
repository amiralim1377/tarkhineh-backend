import { describe, expect, it } from 'vitest';

import { envSchema } from './env.schema.js';

const validBaseEnv = {
  NODE_ENV: 'development',
  DATABASE_URL: 'postgresql://user:password@localhost:5432/test',
  JWT_ACCESS_SECRET: 'a'.repeat(32),
  EMAIL_TOKEN_ENCRYPTION_KEY: Buffer.alloc(32, 1).toString('base64'),
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
    });

    expect(result.success).toBe(false);
  });

  it('accepts complete SMTP configuration in development', () => {
    const result = envSchema.safeParse({
      ...validBaseEnv,
      SMTP_HOST: 'smtp.example.com',
      SMTP_USER: 'mailer',
      SMTP_PASSWORD: 'test-password',
      SMTP_FROM: 'noreply@example.com',
      API_PUBLIC_URL: 'http://localhost:3000',
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
});
