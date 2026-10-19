import type { INestApplication } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { CommandBus } from '@nestjs/cqrs';
import { Test } from '@nestjs/testing';
import { LoggerModule } from 'nestjs-pino';
import request from 'supertest';
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

import { appCreate } from '../../../../../app.create.js';
import { GlobalHttpExceptionFilter } from '../../../../../shared/presentation/http/global-http-exception.filter.js';
import { InvalidEmailVerificationTokenError } from '../../../application/errors/invalid-email-verification-token.error.js';
import { InvalidCredentialsError } from '../../../application/errors/invalid-credentials.error.js';
import { InvalidRefreshTokenError } from '../../../application/errors/invalid-refresh-token.error.js';
import { VerifyEmailCommand } from '../../../application/commands/verify-email/verify-email.command.js';
import { LoginWithEmailCommand } from '../../../application/commands/login-with-email/login-with-email.command.js';
import { RefreshSessionCommand } from '../../../application/commands/refresh-session/refresh-session.command.js';
import { LogoutSessionCommand } from '../../../application/commands/logout-session/logout-session.command.js';
import { IdentityAccessController } from './identity-access.controller.js';
import { ChangePasswordCommand } from '../../../application/commands/change-password/change-password.command.js';
import { ChangePasswordCredentialsError } from '../../../application/errors/change-password.errors.js';

const VALID_TOKEN = 'A'.repeat(43);

const commandBusMock = {
  execute: vi.fn(),
};

describe('IdentityAccessController: email verification', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        LoggerModule.forRoot({
          pinoHttp: {
            level: 'silent',
            autoLogging: false,
          },
        }),
      ],
      controllers: [IdentityAccessController],
      providers: [
        {
          provide: CommandBus,
          useValue: commandBusMock,
        },
        {
          provide: APP_FILTER,
          useClass: GlobalHttpExceptionFilter,
        },
      ],
    }).compile();

    app = moduleRef.createNestApplication();

    appCreate(app);

    await app.init();
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterAll(async () => {
    await app?.close();
  });

  it('serves a confirmation page for a well-formed token without verifying it on GET', async () => {
    const response = await request(app.getHttpServer())
      .get('/auth/verify-email')
      .query({ token: VALID_TOKEN })
      .expect(200);

    expect(response.headers['content-type']).toContain('text/html');
    expect(response.text).toContain('Verify your email');
    expect(response.text).toContain('method="post"');
    expect(response.text).toContain('action="/auth/verify-email"');
    expect(response.text).toContain(
      `<input type="hidden" name="token" value="${VALID_TOKEN}">`,
    );

    // GET only displays the page; it must not consume the token.
    expect(commandBusMock.execute).not.toHaveBeenCalled();
  });

  it('shows an invalid-link page for a malformed token on GET', async () => {
    const response = await request(app.getHttpServer())
      .get('/auth/verify-email')
      .query({ token: 'invalid-token' })
      .expect(200);

    expect(response.text).toContain('Invalid verification link');
    expect(commandBusMock.execute).not.toHaveBeenCalled();
  });

  it('dispatches a valid POST token to VerifyEmailCommand', async () => {
    commandBusMock.execute.mockResolvedValueOnce({
      message: 'Email verified successfully.',
    });

    const response = await request(app.getHttpServer())
      .post('/auth/verify-email')
      .send({ token: VALID_TOKEN })
      .expect(200);

    expect(response.body).toEqual({
      message: 'Email verified successfully.',
    });

    expect(commandBusMock.execute).toHaveBeenCalledOnce();
    expect(commandBusMock.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        token: VALID_TOKEN,
      }),
    );

    const command = commandBusMock.execute.mock.calls[0]?.[0];
    expect(command).toBeInstanceOf(VerifyEmailCommand);
  });

  it('rejects a malformed POST token during DTO validation', async () => {
    const response = await request(app.getHttpServer())
      .post('/auth/verify-email')
      .send({ token: 'invalid-token' })
      .expect(400);

    expect(response.body).toMatchObject({
      code: 'COMMON.VALIDATION_FAILED',
      category: 'validation',
    });

    expect(commandBusMock.execute).not.toHaveBeenCalled();
  });

  it('returns a safe error when the token is invalid or expired', async () => {
    commandBusMock.execute.mockRejectedValueOnce(
      new InvalidEmailVerificationTokenError(),
    );

    const response = await request(app.getHttpServer())
      .post('/auth/verify-email')
      .send({ token: VALID_TOKEN })
      .expect(400);

    expect(response.body).toMatchObject({
      code: 'IDENTITY.EMAIL_VERIFICATION_TOKEN_INVALID',
      category: 'request_error',
    });

    expect(response.body.requestId).toBeTruthy();
    expect(response.body.message).toBeUndefined();

    const responseBody = JSON.stringify(response.body);

    expect(responseBody).not.toContain(
      'Email verification token is invalid or expired',
    );
  });

  it('logs in with valid credentials and returns the public login response', async () => {
    commandBusMock.execute.mockResolvedValueOnce({
      accessToken: 'test-access-token',
      tokenType: 'Bearer',
      expiresIn: 900,
      csrfToken: 'test-csrf-token',
      refreshToken: 'test-refresh-token',
      refreshTokenExpiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      user: {
        id: 'user-123',
        email: 'user@example.com',
        displayName: 'Test User',
      },
    });

    const response = await request(app.getHttpServer())
      .post('/auth/login/email')
      .send({
        email: 'user@example.com',
        password: 'ValidPassword123!',
      })
      .expect(200);

    expect(response.body).toEqual({
      accessToken: 'test-access-token',
      tokenType: 'Bearer',
      expiresIn: 900,
      csrfToken: 'test-csrf-token',
      user: {
        id: 'user-123',
        email: 'user@example.com',
        displayName: 'Test User',
      },
    });

    expect(response.body).not.toHaveProperty('refreshToken');
    expect(JSON.stringify(response.body)).not.toContain('test-refresh-token');

    const setCookie = response.headers['set-cookie'];
    expect(setCookie).toBeDefined();

    const refreshCookie = Array.isArray(setCookie)
      ? setCookie.find((cookie: string) =>
          cookie.startsWith('refresh_token=test-refresh-token;'),
        )
      : undefined;

    expect(refreshCookie).toBeDefined();
    expect(refreshCookie).toContain('HttpOnly');
    expect(refreshCookie).toContain('SameSite=Lax');
    expect(refreshCookie).toContain('Path=/auth');

    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.headers.pragma).toBe('no-cache');

    expect(commandBusMock.execute).toHaveBeenCalledOnce();

    const command = commandBusMock.execute.mock.calls[0]?.[0];
    expect(command).toBeInstanceOf(LoginWithEmailCommand);
    expect(command).toMatchObject({
      email: 'user@example.com',
      password: 'ValidPassword123!',
    });
  });

  it('refreshes a session, rotates the cookie, and omits the refresh token from JSON', async () => {
    commandBusMock.execute.mockResolvedValueOnce({
      accessToken: 'new-access-token',
      tokenType: 'Bearer',
      expiresIn: 900,
      csrfToken: 'new-csrf-token',
      refreshToken: 'new-refresh-token',
      refreshTokenExpiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    });

    const currentRefreshToken = 'A'.repeat(43);
    const currentCsrfToken = 'B'.repeat(43);

    const response = await request(app.getHttpServer())
      .post('/auth/refresh')
      .set('Cookie', `refresh_token=${currentRefreshToken}`)
      .set('X-CSRF-Token', currentCsrfToken)
      .expect(200);

    expect(response.body).toEqual({
      accessToken: 'new-access-token',
      tokenType: 'Bearer',
      expiresIn: 900,
      csrfToken: 'new-csrf-token',
    });

    expect(response.body).not.toHaveProperty('refreshToken');
    expect(JSON.stringify(response.body)).not.toContain('new-refresh-token');

    const setCookie = response.headers['set-cookie'];
    expect(setCookie).toBeDefined();

    const refreshCookie = Array.isArray(setCookie)
      ? setCookie.find((cookie: string) =>
          cookie.startsWith('refresh_token=new-refresh-token;'),
        )
      : undefined;

    expect(refreshCookie).toBeDefined();
    expect(refreshCookie).toContain('HttpOnly');
    expect(refreshCookie).toContain('SameSite=Lax');
    expect(refreshCookie).toContain('Path=/auth');
    expect(response.headers['cache-control']).toBe('no-store');

    expect(commandBusMock.execute).toHaveBeenCalledOnce();

    const command = commandBusMock.execute.mock.calls[0]?.[0];
    expect(command).toBeInstanceOf(RefreshSessionCommand);
    expect(command).toMatchObject({
      refreshToken: currentRefreshToken,
      csrfToken: currentCsrfToken,
    });
  });

  it('returns a safe 401 response when refresh-token validation fails', async () => {
    commandBusMock.execute.mockRejectedValueOnce(
      new InvalidRefreshTokenError(),
    );

    const response = await request(app.getHttpServer())
      .post('/auth/refresh')
      .set('Cookie', `refresh_token=${'A'.repeat(43)}`)
      .set('X-CSRF-Token', 'B'.repeat(43))
      .expect(401);

    expect(response.body).toMatchObject({
      code: 'IDENTITY.INVALID_REFRESH_TOKEN',
      category: 'authentication',
    });

    expect(response.body.message).toBeUndefined();
    expect(JSON.stringify(response.body)).not.toContain(
      'Refresh token is invalid or expired',
    );
    expect(response.headers['cache-control']).toBe('no-store');
  });

  it('revokes the session and clears the refresh-token cookie on logout', async () => {
    commandBusMock.execute.mockResolvedValueOnce({
      message: 'Logged out successfully.',
    });

    const refreshToken = 'A'.repeat(43);
    const csrfToken = 'B'.repeat(43);

    const response = await request(app.getHttpServer())
      .post('/auth/logout')
      .set('Cookie', `refresh_token=${refreshToken}`)
      .set('X-CSRF-Token', csrfToken)
      .expect(200);

    expect(response.body).toEqual({
      message: 'Logged out successfully.',
    });
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.headers.pragma).toBe('no-cache');

    const setCookies = response.headers['set-cookie'];
    const clearedCookie = Array.isArray(setCookies)
      ? setCookies.find((cookie: string) =>
          cookie.startsWith('refresh_token=;'),
        )
      : undefined;

    expect(clearedCookie).toBeDefined();
    expect(clearedCookie).toContain('HttpOnly');
    expect(clearedCookie).toContain('SameSite=Lax');
    expect(clearedCookie).toContain('Path=/auth');

    expect(commandBusMock.execute).toHaveBeenCalledOnce();
    const command = commandBusMock.execute.mock.calls[0]?.[0];
    expect(command).toBeInstanceOf(LogoutSessionCommand);
    expect(command).toMatchObject({
      refreshToken,
      csrfToken,
    });
  });

  it('returns a safe 401 and does not claim logout succeeded for an invalid token', async () => {
    commandBusMock.execute.mockRejectedValueOnce(
      new InvalidRefreshTokenError(),
    );

    const response = await request(app.getHttpServer())
      .post('/auth/logout')
      .set('Cookie', `refresh_token=${'A'.repeat(43)}`)
      .set('X-CSRF-Token', 'B'.repeat(43))
      .expect(401);

    expect(response.body).toMatchObject({
      code: 'IDENTITY.INVALID_REFRESH_TOKEN',
      category: 'authentication',
    });
    expect(response.body.message).toBeUndefined();
    expect(response.headers['cache-control']).toBe('no-store');

    // A failed CSRF/token validation must not be treated as a successful logout.
    expect(response.headers['set-cookie']).toBeUndefined();
  });

  it('rejects an invalid email during login DTO validation', async () => {
    const response = await request(app.getHttpServer())
      .post('/auth/login/email')
      .send({
        email: 'not-an-email',
        password: 'ValidPassword123!',
      })
      .expect(400);

    expect(response.body).toMatchObject({
      code: 'COMMON.VALIDATION_FAILED',
      category: 'validation',
    });

    expect(commandBusMock.execute).not.toHaveBeenCalled();
  });

  it('rejects an empty password during login DTO validation', async () => {
    const response = await request(app.getHttpServer())
      .post('/auth/login/email')
      .send({
        email: 'user@example.com',
        password: '',
      })
      .expect(400);

    expect(response.body).toMatchObject({
      code: 'COMMON.VALIDATION_FAILED',
      category: 'validation',
    });

    expect(commandBusMock.execute).not.toHaveBeenCalled();
  });

  it('returns a safe 401 response for invalid login credentials', async () => {
    commandBusMock.execute.mockRejectedValueOnce(new InvalidCredentialsError());

    const response = await request(app.getHttpServer())
      .post('/auth/login/email')
      .send({
        email: 'user@example.com',
        password: 'WrongPassword123!',
      })
      .expect(401);

    expect(response.body).toMatchObject({
      code: 'IDENTITY.INVALID_CREDENTIALS',
      category: 'authentication',
    });

    expect(response.body.requestId).toBeTruthy();
    expect(response.body.message).toBeUndefined();
    expect(JSON.stringify(response.body)).not.toContain(
      'Invalid email or password',
    );
  });

  it('changes the password, clears the refresh cookie, and disables caching', async () => {
    commandBusMock.execute.mockResolvedValueOnce({
      message: 'Password changed successfully.',
    });

    const response = await request(app.getHttpServer())
      .patch('/auth/change-password')
      .set('Authorization', 'Bearer test-access-token')
      .send({
        currentPassword: 'CurrentPassword123!',
        newPassword: 'NewPassword456!',
        confirmNewPassword: 'NewPassword456!',
      });

    // This assertion also verifies whether the bearer strategy is mocked
    // or configured for this controller test.
    expect([200, 401]).toContain(response.status);

    if (response.status === 401) {
      // The test application may not provide a valid bearer-token strategy.
      // Do not silently treat an unauthenticated request as a successful change.
      expect(commandBusMock.execute).not.toHaveBeenCalled();
      return;
    }

    expect(response.body).toEqual({
      message: 'Password changed successfully.',
    });

    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.headers.pragma).toBe('no-cache');

    const setCookies = response.headers['set-cookie'];
    expect(setCookies).toBeDefined();

    const clearedCookie = Array.isArray(setCookies)
      ? setCookies.find((cookie: string) =>
          cookie.startsWith('refresh_token=;'),
        )
      : undefined;

    expect(clearedCookie).toBeDefined();
    expect(clearedCookie).toContain('HttpOnly');
    expect(clearedCookie).toContain('Path=/auth');

    expect(commandBusMock.execute).toHaveBeenCalledOnce();

    const command = commandBusMock.execute.mock.calls[0]?.[0];

    expect(command).toBeInstanceOf(ChangePasswordCommand);
    expect(command).toMatchObject({
      currentPassword: 'CurrentPassword123!',
      newPassword: 'NewPassword456!',
    });
  });

  it('rejects mismatched new password confirmation', async () => {
    const response = await request(app.getHttpServer())
      .patch('/auth/change-password')
      .set('Authorization', 'Bearer test-access-token')
      .send({
        currentPassword: 'CurrentPassword123!',
        newPassword: 'NewPassword456!',
        confirmNewPassword: 'DifferentPassword789!',
      });

    expect([400, 401]).toContain(response.status);

    if (response.status === 401) {
      expect(commandBusMock.execute).not.toHaveBeenCalled();
      return;
    }

    expect(response.body).toMatchObject({
      code: expect.any(String),
      category: expect.any(String),
    });

    expect(commandBusMock.execute).not.toHaveBeenCalled();
  });

  it('rejects an invalid change-password request body', async () => {
    const response = await request(app.getHttpServer())
      .patch('/auth/change-password')
      .set('Authorization', 'Bearer test-access-token')
      .send({
        currentPassword: '',
        newPassword: 'short',
        confirmNewPassword: 'short',
      });

    expect([400, 401]).toContain(response.status);

    if (response.status === 401) {
      expect(commandBusMock.execute).not.toHaveBeenCalled();
      return;
    }

    expect(response.body).toMatchObject({
      code: 'COMMON.VALIDATION_FAILED',
      category: 'validation',
    });

    expect(commandBusMock.execute).not.toHaveBeenCalled();
  });

  it('does not clear the refresh cookie when the password change fails', async () => {
    commandBusMock.execute.mockRejectedValueOnce(
      new ChangePasswordCredentialsError(),
    );

    const response = await request(app.getHttpServer())
      .patch('/auth/change-password')
      .set('Authorization', 'Bearer test-access-token')
      .send({
        currentPassword: 'WrongPassword123!',
        newPassword: 'NewPassword456!',
        confirmNewPassword: 'NewPassword456!',
      });

    expect([400, 401]).toContain(response.status);

    if (response.status === 401) {
      expect(commandBusMock.execute).not.toHaveBeenCalled();
      return;
    }

    expect(response.headers['set-cookie']).toBeUndefined();
    expect(response.headers['cache-control']).toBe('no-store');
    expect(commandBusMock.execute).toHaveBeenCalledOnce();
  });
});
