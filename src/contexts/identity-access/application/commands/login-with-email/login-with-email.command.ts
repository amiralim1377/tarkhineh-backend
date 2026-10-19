import { Command } from '@nestjs/cqrs';

export interface LoginWithEmailResult {
  accessToken: string;
  tokenType: 'Bearer';
  expiresIn: number;

  // Internal-only credentials. The HTTP DTO must never serialize refreshToken.
  refreshToken: string;
  refreshTokenExpiresAt: Date;
  csrfToken: string;

  user: {
    id: string;
    email: string | null;
    displayName: string | null;
  };
}

export class LoginWithEmailCommand extends Command<LoginWithEmailResult> {
  constructor(
    public readonly email: string,
    public readonly password: string,
  ) {
    super();
  }
}
