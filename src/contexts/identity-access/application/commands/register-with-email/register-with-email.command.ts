import { Command } from '@nestjs/cqrs';

export interface RegisterWithEmailResult {
  message: string;
}

export class RegisterWithEmailCommand extends Command<RegisterWithEmailResult> {
  constructor(
    public readonly email: string,
    public readonly password: string,
    public readonly displayName?: string,
  ) {
    super();
  }
}
