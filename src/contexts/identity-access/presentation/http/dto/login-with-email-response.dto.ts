import { ApiProperty } from '@nestjs/swagger';

import type { LoginWithEmailResult } from '../../../../application/commands/login-with-email/login-with-email.command.js';

export class LoginWithEmailUserResponseDto {
  @ApiProperty({
    description: 'Unique identifier of the authenticated user.',
    example: 'c1335de6-7315-4425-b3f4-1528b4dec6ab',
  })
  readonly id: string;

  @ApiProperty({
    description: 'Email address of the authenticated user.',
    example: 'user@example.com',
    nullable: true,
  })
  readonly email: string | null;

  @ApiProperty({
    description: 'Display name of the authenticated user.',
    example: 'Alex Morgan',
    nullable: true,
  })
  readonly displayName: string | null;

  constructor(user: LoginWithEmailResult['user']) {
    this.id = user.id;
    this.email = user.email;
    this.displayName = user.displayName;
  }
}

export class LoginWithEmailResponseDto {
  @ApiProperty({
    description: 'Signed JWT access token. Treat this value as a credential.',
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
    description: 'CSRF token to send in the X-CSRF-Token header on refresh and logout requests.',
    example: 'a-random-csrf-token-value',
  })
  readonly csrfToken: string;

  @ApiProperty({
    description: 'Public information about the authenticated user.',
    type: () => LoginWithEmailUserResponseDto,
  })
  readonly user: LoginWithEmailUserResponseDto;

  private constructor(result: LoginWithEmailResult) {
    this.accessToken = result.accessToken;
    this.tokenType = result.tokenType;
    this.expiresIn = result.expiresIn;
    this.csrfToken = result.csrfToken;
    this.user = new LoginWithEmailUserResponseDto(result.user);
  }

  static fromResult(
    result: LoginWithEmailResult,
  ): LoginWithEmailResponseDto {
    return new LoginWithEmailResponseDto(result);
  }
}
