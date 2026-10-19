import { ApiProperty } from '@nestjs/swagger';

import type { RefreshSessionResult } from '../../../../application/commands/refresh-session/refresh-session.command.js';

export class RefreshSessionResponseDto {
  @ApiProperty({
    description: 'New signed JWT access token.',
    example: 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ1c2VyLWlkIn0.signature',
  })
  readonly accessToken: string;

  @ApiProperty({
    description: 'Authentication scheme used with the access token.',
    example: 'Bearer',
    enum: ['Bearer'],
  })
  readonly tokenType: 'Bearer';

  @ApiProperty({
    description: 'Access-token lifetime in seconds.',
    example: 900,
    minimum: 1,
  })
  readonly expiresIn: number;

  @ApiProperty({
    description: 'New CSRF token to send in the X-CSRF-Token header on the next refresh or logout request.',
    example: 'A-random-CSRF-token-value',
  })
  readonly csrfToken: string;

  private constructor(result: RefreshSessionResult) {
    this.accessToken = result.accessToken;
    this.tokenType = result.tokenType;
    this.expiresIn = result.expiresIn;
    this.csrfToken = result.csrfToken;
  }

  static fromResult(
    result: RefreshSessionResult,
  ): RefreshSessionResponseDto {
    return new RefreshSessionResponseDto(result);
  }
}
