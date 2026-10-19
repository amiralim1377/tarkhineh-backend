import { Command } from '@nestjs/cqrs';

export interface RefreshSessionResult {
  accessToken: string;
  tokenType: 'Bearer';
  expiresIn: number;
  refreshToken: string;
  refreshTokenExpiresAt: Date;
  csrfToken: string;
}

export class RefreshSessionCommand extends Command<RefreshSessionResult> {
  constructor(
    public readonly refreshToken: string,
    public readonly csrfToken: string,
  ) {
    super();
  }
}
