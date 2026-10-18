import type { LoginWithEmailResult } from '../../../application/commands/login-with-email/login-with-email.command.js';

export class LoginWithEmailResponseDto {
  readonly accessToken: string;
  readonly tokenType: 'Bearer';
  readonly expiresIn: number;
  readonly user: LoginWithEmailResult['user'];

  private constructor(result: LoginWithEmailResult) {
    this.accessToken = result.accessToken;
    this.tokenType = result.tokenType;
    this.expiresIn = result.expiresIn;
    this.user = { ...result.user };
  }

  static fromResult(
    result: LoginWithEmailResult,
  ): LoginWithEmailResponseDto {
    return new LoginWithEmailResponseDto(result);
  }
}
