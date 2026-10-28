import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Post,
  Headers,
  Query,
  Req,
  Res,
  Patch,
} from '@nestjs/common';

import type { Request, Response } from 'express';
import { Throttle } from '@nestjs/throttler';
import { RATE_LIMIT_POLICIES } from '../../../../../config/rate-limit.policies.js';
import { CommandBus } from '@nestjs/cqrs';
import { Auth } from '../auth/decorators/auth.decorator.js';
import { AuthType } from '../auth/contracts/auth-type.enum.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { REFRESH_TOKEN_COOKIE_NAME } from '../auth/cookies/auth-cookie.constants.js';
import type { AuthenticatedPrincipal } from '../auth/contracts/authentication-strategy.js';
import {
  ApiAcceptedResponse,
  ApiBearerAuth,
  ApiBody,
  ApiOkResponse,
  ApiOperation,
  ApiProduces,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import {
  ApiProblemBadRequestResponse,
  ApiProblemServiceUnavailableResponse,
  ApiProblemUnauthorizedResponse,
} from '../../../../../shared/presentation/http/api-problem-response.decorator.js';
import { RegisterWithEmailCommand } from '../../../application/commands/register-with-email/register-with-email.command.js';
import { VerifyEmailCommand } from '../../../application/commands/verify-email/verify-email.command.js';
import { LoginWithEmailCommand } from '../../../application/commands/login-with-email/login-with-email.command.js';
import { RefreshSessionCommand } from '../../../application/commands/refresh-session/refresh-session.command.js';
import { LogoutSessionCommand } from '../../../application/commands/logout-session/logout-session.command.js';
import { RegisterWithEmailDto } from '../dto/register-with-email.dto.js';
import { VerifyEmailDto } from '../dto/verify-email.dto.js';
import { LoginWithEmailDto } from '../dto/login-with-email.dto.js';
import { LoginWithEmailResponseDto } from '../dto/login-with-email-response.dto.js';
import { RefreshSessionResponseDto } from '../dto/refresh-session-response.dto.js';
import { CurrentUserResponseDto } from '../dto/current-user-response.dto.js';
import { AuthMessageResponseDto } from '../dto/auth-message-response.dto.js';
import { BadRequestException } from '@nestjs/common';
import { ChangePasswordDto } from '../dto/change-password.dto.js';
import { ChangePasswordCommand } from '../../../application/commands/change-password/change-password.command.js';
import { ForgotPasswordDto } from '../dto/forgot-password.dto.js';
import { ForgotPasswordCommand } from '../../../application/commands/forgot-password/forgot-password.command.js';
import { ResetPasswordCommand } from '../../../application/commands/reset-password/reset-password.command.js';
import { ResetPasswordDto } from '../dto/reset-password.dto.js';

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

@ApiTags('Identity & Access')
@Controller('auth')
export class IdentityAccessController {
  constructor(private readonly commandBus: CommandBus) {}

  @Auth(AuthType.Bearer)
  @Get('me')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Get the current authenticated user',
    description: 'Returns the identifier of the authenticated user.',
  })
  @ApiOkResponse({
    description: 'The authenticated user was found.',
    type: CurrentUserResponseDto,
  })
  @ApiProblemUnauthorizedResponse({
    description: 'A valid bearer access token is required.',
  })
  getCurrentUser(
    @CurrentUser() principal: AuthenticatedPrincipal,
  ): CurrentUserResponseDto {
    return { userId: principal.userId };
  }

  @Throttle({ default: RATE_LIMIT_POLICIES.loginEmail })
  @Auth(AuthType.None)
  @Post('login/email')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Log in with email and password',
    description:
      'Authenticates an active user with a verified email address and returns a signed JWT access token.',
  })
  @ApiBody({ type: LoginWithEmailDto })
  @ApiOkResponse({
    description:
      'Login successful. Returns the access token and public user information.',
    type: LoginWithEmailResponseDto,
  })
  @ApiProblemBadRequestResponse({
    description: 'The request body is invalid.',
  })
  @ApiProblemUnauthorizedResponse({
    description: 'The credentials are invalid or the account cannot log in.',
  })
  @ApiProblemServiceUnavailableResponse({
    description: 'A required dependency is unavailable.',
  })
  async loginWithEmail(
    @Body() dto: LoginWithEmailDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<LoginWithEmailResponseDto> {
    const result = await this.commandBus.execute(
      new LoginWithEmailCommand(dto.email, dto.password),
    );

    this.setRefreshTokenCookie(
      response,
      result.refreshToken,
      result.refreshTokenExpiresAt,
    );

    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('Pragma', 'no-cache');

    return LoginWithEmailResponseDto.fromResult(result);
  }

  @Throttle({ default: RATE_LIMIT_POLICIES.refreshSession })
  @Auth(AuthType.None)
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Refresh an authentication session',
    description:
      'Rotates the HttpOnly refresh-token cookie. Requires the matching CSRF token in the X-CSRF-Token header.',
  })
  @ApiOkResponse({
    description:
      'The session was refreshed. Returns a new access token and CSRF token.',
    type: RefreshSessionResponseDto,
  })
  @ApiProblemUnauthorizedResponse({
    description:
      'The refresh token or CSRF token is invalid, expired, or has been reused.',
  })
  @ApiProblemServiceUnavailableResponse({
    description: 'A required dependency is unavailable.',
  })
  async refreshSession(
    @Req() request: Request,
    @Headers('x-csrf-token') csrfTokenHeader: string | undefined,
    @Res({ passthrough: true }) response: Response,
  ): Promise<RefreshSessionResponseDto> {
    // Ensure refresh responses, including failures, are not cached.
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('Pragma', 'no-cache');

    const refreshToken = request.cookies?.[REFRESH_TOKEN_COOKIE_NAME];

    const result = await this.commandBus.execute(
      new RefreshSessionCommand(
        typeof refreshToken === 'string' ? refreshToken : '',
        typeof csrfTokenHeader === 'string' ? csrfTokenHeader : '',
      ),
    );

    this.setRefreshTokenCookie(
      response,
      result.refreshToken,
      result.refreshTokenExpiresAt,
    );

    return RefreshSessionResponseDto.fromResult(result);
  }

  @Throttle({ default: RATE_LIMIT_POLICIES.logoutSession })
  @Auth(AuthType.None)
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Log out the current authentication session',
    description:
      'Revokes the session associated with the refresh-token cookie and clears that cookie. Requires the matching CSRF token.',
  })
  @ApiOkResponse({
    description:
      'The session was revoked and the refresh-token cookie was cleared.',
    type: AuthMessageResponseDto,
  })
  @ApiProblemUnauthorizedResponse({
    description: 'The refresh token or CSRF token is invalid.',
  })
  @ApiProblemServiceUnavailableResponse({
    description: 'A required dependency is unavailable.',
  })
  async logoutSession(
    @Req() request: Request,
    @Headers('x-csrf-token') csrfTokenHeader: string | undefined,
    @Res({ passthrough: true }) response: Response,
  ): Promise<AuthMessageResponseDto> {
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('Pragma', 'no-cache');

    const refreshToken = request.cookies?.[REFRESH_TOKEN_COOKIE_NAME];

    const result = await this.commandBus.execute(
      new LogoutSessionCommand(
        typeof refreshToken === 'string' ? refreshToken : '',
        typeof csrfTokenHeader === 'string' ? csrfTokenHeader : '',
      ),
    );

    response.clearCookie(REFRESH_TOKEN_COOKIE_NAME, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/auth',
    });

    return result;
  }

  @Throttle({ default: RATE_LIMIT_POLICIES.registerEmail })
  @Auth(AuthType.None)
  @Post('register/email')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({
    summary: 'Register with email',
    description:
      'Starts email registration. A verification email is sent when registration can proceed.',
  })
  @ApiBody({ type: RegisterWithEmailDto })
  @ApiAcceptedResponse({
    description: 'The registration request has been accepted.',
    type: AuthMessageResponseDto,
  })
  @ApiProblemBadRequestResponse({
    description: 'The request body is invalid.',
  })
  @ApiProblemServiceUnavailableResponse({
    description: 'A required dependency is unavailable.',
  })
  registerWithEmail(@Body() dto: RegisterWithEmailDto) {
    return this.commandBus.execute(
      new RegisterWithEmailCommand(dto.email, dto.password, dto.displayName),
    );
  }

  @Auth(AuthType.None)
  @Get('verify-email')
  @Header('Content-Type', 'text/html; charset=utf-8')
  @ApiOperation({
    summary: 'Display the email verification page',
    description:
      'Returns an HTML confirmation page for a well-formed token. A GET request does not consume or verify the token.',
  })
  @ApiQuery({
    name: 'token',
    required: true,
    description: 'Email verification token from the email link.',
    example: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
  })
  @ApiProduces('text/html')
  @ApiResponse({
    status: 200,
    description:
      'HTML confirmation page, or an HTML invalid-link page if the token format is invalid.',
    content: {
      'text/html': {
        schema: {
          type: 'string',
          example: '<html><body><h1>Verify your email</h1></body></html>',
        },
      },
    },
  })
  verificationConfirmationPage(@Query('token') token?: string): string {
    if (typeof token !== 'string' || !TOKEN_PATTERN.test(token)) {
      return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Email verification</title>
  </head>
  <body>
    <main>
      <h1>Invalid verification link</h1>
      <p>This link is invalid. Please request a new verification email.</p>
    </main>
  </body>
</html>`;
    }

    return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Verify your Tarkhineh email</title>
  </head>
  <body>
    <main>
      <h1>Verify your email</h1>
      <p>Press the button below to complete email verification.</p>

      <form method="post" action="/auth/verify-email">
        <input type="hidden" name="token" value="${token}">
        <button type="submit">Verify email</button>
      </form>
    </main>
  </body>
</html>`;
  }

  @Throttle({ default: RATE_LIMIT_POLICIES.verifyEmail })
  @Auth(AuthType.None)
  @Post('verify-email')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Verify an email address',
    description:
      'Consumes a valid email verification token and activates the pending account.',
  })
  @ApiBody({ type: VerifyEmailDto })
  @ApiOkResponse({
    description: 'Email successfully verified.',
    type: AuthMessageResponseDto,
  })
  @ApiProblemBadRequestResponse({
    description:
      'The token is invalid, expired, or the request body is invalid.',
  })
  @ApiProblemServiceUnavailableResponse({
    description: 'A required dependency is unavailable.',
  })
  verifyEmail(@Body() dto: VerifyEmailDto) {
    return this.commandBus.execute(new VerifyEmailCommand(dto.token));
  }
  private setRefreshTokenCookie(
    response: Response,
    token: string,
    expiresAt: Date,
  ): void {
    response.cookie(REFRESH_TOKEN_COOKIE_NAME, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/auth',
      expires: expiresAt,
      maxAge: Math.max(0, expiresAt.getTime() - Date.now()),
    });
  }

  @Throttle({ default: RATE_LIMIT_POLICIES.changePassword })
  @Auth(AuthType.Bearer)
  @Patch('change-password')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({
    summary: "Change the current user's password",
    description:
      'Requires a valid bearer access token and the current password. Revokes the user’s refresh sessions after a successful password change.',
  })
  @ApiBody({ type: ChangePasswordDto })
  @ApiOkResponse({
    description: 'Password changed successfully.',
    type: AuthMessageResponseDto,
  })
  @ApiProblemBadRequestResponse({
    description:
      'The request body is invalid or the new password is unchanged.',
  })
  @ApiProblemUnauthorizedResponse({
    description: 'Authentication failed or the current password is invalid.',
  })
  async changePassword(
    @CurrentUser() principal: AuthenticatedPrincipal,
    @Body() dto: ChangePasswordDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<AuthMessageResponseDto> {
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('Pragma', 'no-cache');

    if (dto.newPassword !== dto.confirmNewPassword) {
      throw new BadRequestException(
        'The new password and confirmation do not match.',
      );
    }

    const result = await this.commandBus.execute(
      new ChangePasswordCommand(
        principal.userId,
        dto.currentPassword,
        dto.newPassword,
      ),
    );

    response.clearCookie(REFRESH_TOKEN_COOKIE_NAME, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/auth',
    });

    return result;
  }

  @Throttle({ default: RATE_LIMIT_POLICIES.forgotPassword })
  @Auth(AuthType.None)
  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Request a password reset link',
    description:
      'Generates a secure password reset challenge and sends an email if the account exists.',
  })
  @ApiBody({ type: ForgotPasswordDto })
  @ApiOkResponse({
    description:
      'Returns a generic success message regardless of whether the email exists, preventing enumeration.',
    type: AuthMessageResponseDto,
  })
  @ApiProblemBadRequestResponse({
    description: 'The request body is invalid or missing the email field.',
  })
  @ApiProblemServiceUnavailableResponse({
    description: 'A required dependency is unavailable.',
  })
  async forgotPassword(
    @Body() dto: ForgotPasswordDto,
  ): Promise<AuthMessageResponseDto> {
    const result = await this.commandBus.execute(
      new ForgotPasswordCommand(dto.email),
    );

    return { message: result.message };
  }

  @Throttle({ default: RATE_LIMIT_POLICIES.resetPassword })
  @Auth(AuthType.None)
  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Complete password reset',
    description: 'Validates the recovery token and sets a new password.',
  })
  @ApiBody({ type: ResetPasswordDto })
  @ApiOkResponse({
    description: 'The password reset completed successfully.',
    type: AuthMessageResponseDto,
  })
  @ApiProblemBadRequestResponse({
    description: 'The request is invalid or the recovery token cannot be used.',
  })
  @ApiProblemServiceUnavailableResponse({
    description: 'A required dependency is unavailable.',
  })
  async resetPassword(
    @Body() dto: ResetPasswordDto,
  ): Promise<AuthMessageResponseDto> {
    const result = await this.commandBus.execute(
      new ResetPasswordCommand(dto.recoveryToken, dto.newPassword),
    );

    return { message: result.message };
  }
}
