import { Command } from '@nestjs/cqrs';

export interface ForgotPasswordResult {
  message: string;
}

export class ForgotPasswordCommand extends Command<ForgotPasswordResult> {
  constructor(public readonly email: string) {
    super();
  }
}
