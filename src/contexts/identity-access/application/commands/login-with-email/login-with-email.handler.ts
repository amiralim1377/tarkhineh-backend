import { Inject } from '@nestjs/common';
import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';

import {
  USER_AUTHENTICATION_REPOSITORY,
  type UserAuthenticationRepository,
} from '../../../domain/ports/user-authentication.repository.js';

import {
  PASSWORD_VERIFIER,
  type PasswordVerifier,
} from '../../ports/password-verifier.port.js';

import {
  ACCESS_TOKEN_ISSUER,
  type AccessTokenIssuer,
} from '../../ports/access-token-issuer.port.js';

import { InvalidCredentialsError } from '../../errors/invalid-credentials.error.js';

import {
  LoginWithEmailCommand,
  type LoginWithEmailResult,
} from './login-with-email.command.js';

@CommandHandler(LoginWithEmailCommand)
export class LoginWithEmailHandler implements ICommandHandler<LoginWithEmailCommand> {

  
  constructor(
    @Inject(USER_AUTHENTICATION_REPOSITORY)
    private readonly users: UserAuthenticationRepository,
    @Inject(PASSWORD_VERIFIER)
    private readonly passwordVerifier: PasswordVerifier,
    @Inject(ACCESS_TOKEN_ISSUER)
    private readonly tokenIssuer: AccessTokenIssuer,
  ) {}

  async execute(command: LoginWithEmailCommand): Promise<LoginWithEmailResult> {
    const email = command.email.trim().toLowerCase();
    const user = await this.users.findByEmail(email);

    if (!user || !user.canLoginWithPassword() || !user.passwordHash) {
      throw new InvalidCredentialsError();
    }

    const passwordIsValid = await this.passwordVerifier.verify(
      user.passwordHash,
      command.password,
    );

    if (!passwordIsValid) {
      throw new InvalidCredentialsError();
    }

    const token = await this.tokenIssuer.issueFor(user.id);

    return {
      accessToken: token.accessToken,
      tokenType: 'Bearer',
      expiresIn: token.expiresInSeconds,
      user: {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
      },
    };
  }
}
