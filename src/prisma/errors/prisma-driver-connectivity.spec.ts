import { describe, expect, it } from 'vitest';

import { DependencyUnavailableError } from '../../shared/application/errors/dependency-unavailable.error.js';
import { normalizePrismaError } from './prisma-error-translator.js';

describe('Prisma driver connectivity errors', () => {
  it.each([
    'ECONNREFUSED',
    'ENOTFOUND',
    'EAI_AGAIN',
    'ETIMEDOUT',
    'ECONNRESET',
    'EHOSTUNREACH',
  ])('normalizes driver error %s', (code) => {
    const originalError = Object.assign(
      new Error(`Synthetic driver failure: ${code}`),
      { code },
    );

    const result = normalizePrismaError(originalError);

    expect(result).toBeInstanceOf(DependencyUnavailableError);

    if (!(result instanceof DependencyUnavailableError)) {
      throw new Error('Expected DependencyUnavailableError');
    }

    expect(result.code).toBe('COMMON.DEPENDENCY_UNAVAILABLE');
    expect(result.cause).toBe(originalError);
    expect(result.metadata).toMatchObject({
      dependency: 'postgresql',
      prismaCode: code,
    });
  });

  it('preserves an unrelated native error', () => {
    const originalError = Object.assign(
      new Error('Unexpected failure'),
      { code: 'SOME_UNRELATED_CODE' },
    );

    expect(normalizePrismaError(originalError)).toBe(originalError);
  });
});
