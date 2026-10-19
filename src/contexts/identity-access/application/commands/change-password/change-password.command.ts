import { Command } from '@nestjs/cqrs';

export interface ChangePasswordResult {
  message: string;
}

export class ChangePasswordCommand extends Command<ChangePasswordResult> {
  constructor(
    public readonly userId: string,
    public readonly currentPassword: string,
    public readonly newPassword: string,
  ) {
    super();
  }
}
