import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';

import type {
  AccessTokenIssuer,
  IssuedAccessToken,
} from '../../application/ports/access-token-issuer.port.js';

@Injectable()
export class JwtAccessTokenIssuer implements AccessTokenIssuer {
  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  async issueFor(userId: string): Promise<IssuedAccessToken> {
    const expiresInSeconds =
      this.configService.get<number>('JWT_ACCESS_TTL_SECONDS') ?? 900;

    if (!Number.isSafeInteger(expiresInSeconds) || expiresInSeconds <= 0) {
      throw new Error('JWT_ACCESS_TTL_SECONDS must be a positive integer');
    }

    const accessToken = await this.jwtService.signAsync(
      { sub: userId },
      { expiresIn: expiresInSeconds },
    );

    return {
      accessToken,
      expiresInSeconds,
    };
  }
}
