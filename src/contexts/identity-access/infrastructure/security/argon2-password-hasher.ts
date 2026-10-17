import { Injectable } from '@nestjs/common';
import { hash } from 'argon2';

import type { PasswordHasher } from '../../application/ports/password-hasher.port.js';

@Injectable()
export class Argon2PasswordHasher implements PasswordHasher {
  async hash(plainPassword: string): Promise<string> {
    return hash(plainPassword);
  }
}
