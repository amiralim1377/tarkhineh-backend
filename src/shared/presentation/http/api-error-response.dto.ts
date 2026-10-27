import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/** OpenAPI schema for the RFC 9457 response emitted by GlobalHttpExceptionFilter. */
export class ApiErrorResponseDto {
  @ApiProperty({
    description: 'URI reference identifying the problem type.',
    example: 'about:blank',
    format: 'uri-reference',
  })
  readonly type!: string;

  @ApiProperty({
    description:
      'Short human-readable summary for this HTTP status. Clients should use code for localization.',
    example: 'Unprocessable Content',
  })
  readonly title!: string;

  @ApiProperty({
    description:
      'HTTP status code for this occurrence; equals the actual response status.',
    example: 422,
    minimum: 400,
    maximum: 599,
  })
  readonly status!: number;

  @ApiProperty({
    description: 'URI reference identifying this specific problem occurrence.',
    example: '/problem-occurrences/c1335de6-7315-4425-b3f4-1528b4dec6ab',
    format: 'uri-reference',
  })
  readonly instance!: string;

  @ApiProperty({
    description: 'Stable, machine-readable application error code.',
    example: 'IDENTITY.INVALID_CREDENTIALS',
  })
  readonly code!: string;

  @ApiProperty({
    description: 'Semantic category of the application error.',
    example: 'authentication',
  })
  readonly category!: string;

  @ApiProperty({
    description: 'Identifier used to correlate the request with logs.',
    example: 'c1335de6-7315-4425-b3f4-1528b4dec6ab',
  })
  readonly requestId!: string;

  @ApiPropertyOptional({
    description:
      'Optional safe parameters for client-side error-message interpolation.',
    type: 'object',
    additionalProperties: {
      oneOf: [{ type: 'string' }, { type: 'number' }, { type: 'boolean' }],
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
