import { Command } from '@nestjs/cqrs';

export interface LogoutSessionResult {
  readonly message: string;
}

export class LogoutSessionCommand extends Command<LogoutSessionResult> {
  constructor(
    public readonly refreshToken: string,
    public readonly csrfToken: string,
  ) {
    super();
  }
}
