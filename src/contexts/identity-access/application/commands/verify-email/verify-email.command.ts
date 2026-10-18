import { Command } from '@nestjs/cqrs';

export interface VerifyEmailResult {
  message: string;
}

export class VerifyEmailCommand extends Command<VerifyEmailResult> {
  constructor(public readonly token: string) {
    super();
  }
}
