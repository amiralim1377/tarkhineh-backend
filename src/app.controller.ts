import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service.js';
import { Auth } from './contexts/identity-access/presentation/http/auth/auth.decorator.js';
import { AuthType } from './contexts/identity-access/presentation/http/auth/auth-type.enum.js';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Auth(AuthType.None)
  @Get()
  getHello(): string {
    return this.appService.getHello();
  }
}
