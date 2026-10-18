import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Post,
  Query,
} from '@nestjs/common';
import { CommandBus } from '@nestjs/cqrs';
import { RegisterWithEmailCommand } from '../../application/commands/register-with-email/register-with-email.command.js';
import { VerifyEmailCommand } from '../../application/commands/verify-email/verify-email.command.js';
import { LoginWithEmailCommand } from '../../application/commands/login-with-email/login-with-email.command.js';
import { RegisterWithEmailDto } from './dto/register-with-email.dto.js';
import { VerifyEmailDto } from './dto/verify-email.dto.js';
import { LoginWithEmailDto } from './dto/login-with-email.dto.js';
import { LoginWithEmailResponseDto } from './dto/login-with-email-response.dto.js';

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

@Controller('auth')
export class IdentityAccessController {
  constructor(private readonly commandBus: CommandBus) {}

  @Post('login/email')
  @HttpCode(HttpStatus.OK)
  async loginWithEmail(
    @Body() dto: LoginWithEmailDto,
  ): Promise<LoginWithEmailResponseDto> {
    const result = await this.commandBus.execute(
      new LoginWithEmailCommand(dto.email, dto.password),
    );

    return LoginWithEmailResponseDto.fromResult(result);
  }

  @Post('register/email')
  @HttpCode(HttpStatus.ACCEPTED)
  registerWithEmail(@Body() dto: RegisterWithEmailDto) {
    return this.commandBus.execute(
      new RegisterWithEmailCommand(dto.email, dto.password, dto.displayName),
    );
  }

  @Get('verify-email')
  @Header('Content-Type', 'text/html; charset=utf-8')
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

  @Post('verify-email')
  @HttpCode(HttpStatus.OK)
  verifyEmail(@Body() dto: VerifyEmailDto) {
    return this.commandBus.execute(new VerifyEmailCommand(dto.token));
  }
}
