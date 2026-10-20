import { Module } from '@nestjs/common';
import { CLOCK } from './application/ports/clock.port.js';
import { SystemClock } from './infrastructure/time/system-clock.js';
import { SECURE_TOKEN_FACTORY } from './application/ports/secure-token-factory.port.js';
import { CryptoSecureTokenFactory } from './infrastructure/security/crypto-secure-token.factory.js';

@Module({
  providers: [
    {
      provide: CLOCK,
      useClass: SystemClock,
    },
    {
      provide: SECURE_TOKEN_FACTORY,
      useClass: CryptoSecureTokenFactory,
    },
  ],
  exports: [CLOCK, SECURE_TOKEN_FACTORY],
})
export class SharedModule {}
