import { describe, expect, it } from 'vitest';

import { Prisma } from '../../generated/prisma/client.js';
import { DependencyUnavailableError } from '../../shared/application/errors/dependency-unavailable.error.js';
import { normalizePrismaError } from './prisma-error-translator.js';

function createPrismaError(
  code: string,
  meta?: Record<string, unknown>,
): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError(
    `Test Prisma error: ${code}`,
    {
      code,
      clientVersion: 'test-version',
      meta,
    },
  );
}

describe('normalizePrismaError', () => {
  it('maps a known database dependency failure', () => {
    const originalError = createPrismaError('P2024');

    const result = normalizePrismaError(originalError);

    expect(result).toBeInstanceOf(DependencyUnavailableError);

    if (!(result instanceof DependencyUnavailableError)) {
      throw new Error('Expected DependencyUnavailableError');
    }

    expect(result.code).toBe('COMMON.DEPENDENCY_UNAVAILABLE');
    expect(result.metadata).toMatchObject({
      dependency: 'postgresql',
      prismaCode: 'P2024',
    });
    expect(result.cause).toBe(originalError);
  });

  it('preserves a unique constraint error for contextual handling', () => {
    const originalError = createPrismaError('P2002', {
      target: ['email'],
    });

    expect(normalizePrismaError(originalError)).toBe(originalError);
  });

  it('preserves unknown exceptions', () => {
    const originalError = new Error('Unexpected internal failure');

    expect(normalizePrismaError(originalError)).toBe(originalError);
  });
});
