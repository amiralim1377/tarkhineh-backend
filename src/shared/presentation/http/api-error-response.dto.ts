import {
  ApiProperty,
  ApiPropertyOptional,
} from '@nestjs/swagger';

export class ApiErrorResponseDto {
  @ApiProperty({
    description: 'Stable, machine-readable error code.',
    example: 'IDENTITY.INVALID_CREDENTIALS',
  })
  readonly code!: string;

  @ApiProperty({
    description: 'Semantic category of the error.',
    example: 'authentication',
  })
  readonly category!: string;

  @ApiProperty({
    description: 'Identifier used to correlate the request with logs.',
    example: 'c1335de6-7315-4425-b3f4-1528b4dec6ab',
  })
  readonly requestId!: string;

  @ApiPropertyOptional({
    description: 'Optional safe parameters for client-side error messages.',
    type: 'object',
    additionalProperties: {
      oneOf: [
        { type: 'string' },
        { type: 'number' },
        { type: 'boolean' },
      ],
    },
  })
  readonly params?: Record<string, string | number | boolean>;

  @ApiPropertyOptional({
    description: 'Field-level validation details when applicable.',
    type: 'array',
    items: {
      type: 'object',
      additionalProperties: true,
    },
  })
  readonly fields?: Array<Record<string, unknown>>;
}
