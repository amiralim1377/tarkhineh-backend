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
      ...(meta ? { meta } : {}),
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

  it.each(['P1001', 'P1002', 'P1008', 'P1017', 'P2024', 'P2037'])(
    'normalizes dependency error %s',
    (code) => {
      const originalError = createPrismaError(code);

      const result = normalizePrismaError(originalError);

      expect(result).toBeInstanceOf(DependencyUnavailableError);

      if (!(result instanceof DependencyUnavailableError)) {
        throw new Error('Expected DependencyUnavailableError');
      }

      expect(result.code).toBe('COMMON.DEPENDENCY_UNAVAILABLE');
      expect(result.cause).toBe(originalError);
    },
  );

  it('maps P2010 when the adapter reports DatabaseNotReachable', () => {
    const originalError = createPrismaError('P2010', {
      driverAdapterError: {
        name: 'DriverAdapterError',
        cause: {
          kind: 'DatabaseNotReachable',
          host: '127.0.0.1',
          port: 59999,
        },
      },
    });

    const result = normalizePrismaError(originalError);

    expect(result).toBeInstanceOf(DependencyUnavailableError);

    if (!(result instanceof DependencyUnavailableError)) {
      throw new Error('Expected DependencyUnavailableError');
    }

    expect(result.code).toBe('COMMON.DEPENDENCY_UNAVAILABLE');
    expect(result.metadata).toMatchObject({
      dependency: 'postgresql',
      prismaCode: 'P2010',
    });
    expect(result.cause).toBe(originalError);
  });

  it('preserves P2010 for a non-connectivity adapter error', () => {
    const originalError = createPrismaError('P2010', {
      driverAdapterError: {
        name: 'DriverAdapterError',
        cause: {
          kind: 'TableDoesNotExist',
        },
      },
    });

    expect(normalizePrismaError(originalError)).toBe(originalError);
  });
});
