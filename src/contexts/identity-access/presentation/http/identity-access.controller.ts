import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { CommandBus } from '@nestjs/cqrs';

import { RegisterWithEmailCommand } from '../../application/commands/register-with-email/register-with-email.command.js';
import { RegisterWithEmailDto } from './register-with-email.dto.js';

@Controller('auth')
export class IdentityAccessController {
  constructor(private readonly commandBus: CommandBus) {}

  @Post('register/email')
  @HttpCode(HttpStatus.ACCEPTED)
  registerWithEmail(@Body() dto: RegisterWithEmailDto) {
    return this.commandBus.execute(
      new RegisterWithEmailCommand(dto.email, dto.password, dto.displayName),
    );
  }
}
