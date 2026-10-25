import { Command } from '@nestjs/cqrs';

export interface ResetPasswordResult {
  message: string;
}

export class ResetPasswordCommand extends Command<ResetPasswordResult> {
  constructor(
    public readonly recoveryToken: string,
    public readonly newPassword: string,
  ) {
    super();
  }
}
