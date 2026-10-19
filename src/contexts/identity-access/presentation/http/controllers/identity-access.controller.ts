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
} from '@nestjs/common';

import type { Request, Response } from 'express';
import { CommandBus } from '@nestjs/cqrs';
import { Auth } from '../auth/decorators/auth.decorator.js';
import { AuthType } from '../auth/contracts/auth-type.enum.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { REFRESH_TOKEN_COOKIE_NAME } from '../auth/cookies/auth-cookie.constants.js';
import type { AuthenticatedPrincipal } from '../auth/contracts/authentication-strategy.js';
import {
  ApiAcceptedResponse,
  ApiBearerAuth,
  ApiBadRequestResponse,
  ApiBody,
  ApiOkResponse,
  ApiOperation,
  ApiProduces,
  ApiQuery,
  ApiResponse,
  ApiServiceUnavailableResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';

import { RegisterWithEmailCommand } from '../../../application/commands/register-with-email/register-with-email.command.js';
import { VerifyEmailCommand } from '../../../application/commands/verify-email/verify-email.command.js';
import { LoginWithEmailCommand } from '../../../application/commands/login-with-email/login-with-email.command.js';
import { RefreshSessionCommand } from '../../../application/commands/refresh-session/refresh-session.command.js';
import { LogoutSessionCommand } from '../../../application/commands/logout-session/logout-session.command.js';

import { RegisterWithEmailDto } from '../dto/registration/register-with-email.dto.js';
import { VerifyEmailDto } from '../dto/verification/verify-email.dto.js';
import { LoginWithEmailDto } from '../dto/login/login-with-email.dto.js';
import { LoginWithEmailResponseDto } from '../dto/login/login-with-email-response.dto.js';
import { RefreshSessionResponseDto } from '../dto/login/refresh-session-response.dto.js';
import { CurrentUserResponseDto } from '../dto/current-user/current-user-response.dto.js';
import { AuthMessageResponseDto } from '../dto/common/auth-message-response.dto.js';
import { ApiErrorResponseDto } from '../../../../../shared/presentation/http/api-error-response.dto.js';

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
  @ApiUnauthorizedResponse({
    description: 'A valid bearer access token is required.',
    type: ApiErrorResponseDto,
  })
  getCurrentUser(
    @CurrentUser() principal: AuthenticatedPrincipal,
  ): CurrentUserResponseDto {
    return { userId: principal.userId };
  }

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
  @ApiBadRequestResponse({
    description: 'The request body is invalid.',
    type: ApiErrorResponseDto,
  })
  @ApiUnauthorizedResponse({
    description: 'The credentials are invalid or the account cannot log in.',
    type: ApiErrorResponseDto,
  })
  @ApiServiceUnavailableResponse({
    description: 'A required dependency is unavailable.',
    type: ApiErrorResponseDto,
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

  @Auth(AuthType.None)
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Refresh an authentication session',
    description:
      'Rotates the HttpOnly refresh-token cookie. Requires the matching CSRF token in the X-CSRF-Token header.',
  })
  @ApiOkResponse({
    description: 'The session was refreshed. Returns a new access token and CSRF token.',
    type: RefreshSessionResponseDto,
  })
  @ApiUnauthorizedResponse({
    description: 'The refresh token or CSRF token is invalid, expired, or has been reused.',
    type: ApiErrorResponseDto,
  })
  @ApiServiceUnavailableResponse({
    description: 'A required dependency is unavailable.',
    type: ApiErrorResponseDto,
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

  @Auth(AuthType.None)
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Log out the current authentication session',
    description:
      'Revokes the session associated with the refresh-token cookie and clears that cookie. Requires the matching CSRF token.',
  })
  @ApiOkResponse({
    description: 'The session was revoked and the refresh-token cookie was cleared.',
    type: AuthMessageResponseDto,
  })
  @ApiUnauthorizedResponse({
    description: 'The refresh token or CSRF token is invalid.',
    type: ApiErrorResponseDto,
  })
  @ApiServiceUnavailableResponse({
    description: 'A required dependency is unavailable.',
    type: ApiErrorResponseDto,
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
  @ApiBadRequestResponse({
    description: 'The request body is invalid.',
    type: ApiErrorResponseDto,
  })
  @ApiServiceUnavailableResponse({
    description: 'A required dependency is unavailable.',
    type: ApiErrorResponseDto,
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
  @ApiBadRequestResponse({
    description:
      'The token is invalid, expired, or the request body is invalid.',
    type: ApiErrorResponseDto,
  })
  @ApiServiceUnavailableResponse({
    description: 'A required dependency is unavailable.',
    type: ApiErrorResponseDto,
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

}
