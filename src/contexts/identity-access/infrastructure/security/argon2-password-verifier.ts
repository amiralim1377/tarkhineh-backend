import { Injectable } from '@nestjs/common';
import { verify } from 'argon2';

import type { PasswordVerifier } from '../../application/ports/password-verifier.port.js';

@Injectable()
export class Argon2PasswordVerifier implements PasswordVerifier {
  async verify(
    passwordHash: string,
    plainPassword: string,
  ): Promise<boolean> {
    return verify(passwordHash, plainPassword);
  }
}
