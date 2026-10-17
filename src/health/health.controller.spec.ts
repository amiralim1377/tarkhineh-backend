import { describe, expect, it, vi } from 'vitest';
import { Prisma } from '../generated/prisma/client.js';

import { PrismaService } from '../prisma/prisma.service.js';
import { DependencyUnavailableError } from '../shared/application/errors/dependency-unavailable.error.js';

import { HealthController } from './health.controller.js';
import { DatabaseReadinessFailedError } from './errors/database-readiness-failed.error.js';

function createController(queryRaw: ReturnType<typeof vi.fn>) {
  const prisma = {
    $queryRaw: queryRaw,
  } as unknown as PrismaService;

  return new HealthController(prisma);
}

describe('HealthController', () => {
  it('reports liveness without querying the database', () => {
    const queryRaw = vi.fn();
    const controller = createController(queryRaw);

    expect(controller.liveness()).toEqual({
      status: 'ok',
    });

    expect(queryRaw).not.toHaveBeenCalled();
  });

  it('reports readiness when the database query succeeds', async () => {
    const queryRaw = vi.fn().mockResolvedValue([{ result: 1 }]);
    const controller = createController(queryRaw);

    await expect(controller.readiness()).resolves.toEqual({
      status: 'ok',
      database: 'up',
    });

    expect(queryRaw).toHaveBeenCalledTimes(1);
  });

  it('normalizes a recognized Prisma dependency failure', async () => {
    const prismaError = new Prisma.PrismaClientKnownRequestError(
      'Synthetic database failure',
      {
        code: 'P2024',
        clientVersion: 'test-version',
      },
    );

    const queryRaw = vi.fn().mockRejectedValue(prismaError);
    const controller = createController(queryRaw);

    await expect(controller.readiness()).rejects.toBeInstanceOf(
      DependencyUnavailableError,
    );
  });

  it('returns a generic readiness error for an unmapped database failure', async () => {
    const queryRaw = vi
      .fn()
      .mockRejectedValue(
        new Error('Internal database diagnostic must not be public'),
      );

    const controller = createController(queryRaw);

    let caughtError: unknown;

    try {
      await controller.readiness();
    } catch (error: unknown) {
      caughtError = error;
    }

    expect(caughtError).toBeInstanceOf(DatabaseReadinessFailedError);

    if (!(caughtError instanceof DatabaseReadinessFailedError)) {
      throw new Error('Expected DatabaseReadinessFailedError');
    }

    expect(caughtError.code).toBe('COMMON.DEPENDENCY_UNAVAILABLE');
    expect(caughtError.message).toBe('Database readiness check failed');
    expect(caughtError.metadata).toMatchObject({
      dependency: 'postgresql',
      operation: 'readiness-check',
      diagnosticType: 'Error',
    });

    expect(caughtError.message).not.toContain('Internal database diagnostic');
  });
});
