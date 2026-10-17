import type { ArgumentsHost } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { PinoLogger } from 'nestjs-pino';

import { ApplicationError } from '../../application/errors/application-error.js';
import { ERROR_CATEGORY } from '../../errors/error-category.js';
import { GlobalHttpExceptionFilter } from './global-http-exception.filter.js';

function createHost(request: Record<string, unknown>) {
  const response = {
    setHeader: vi.fn(),
    status: vi.fn(),
    json: vi.fn(),
  };
  response.status.mockReturnValue(response);

  const httpContext = {
    getRequest: vi.fn(() => request),
    getResponse: vi.fn(() => response),
  };
  const host = {
    switchToHttp: vi.fn(() => httpContext),
  } as unknown as ArgumentsHost;

  return { host, response };
}

class TestPublicApplicationError extends ApplicationError {
  readonly code = 'TEST.EXAMPLE_FAILURE';
  override readonly category = ERROR_CATEGORY.BUSINESS_RULE;

  constructor() {
    super('Internal-only message', {
      params: { min: 2 },
      metadata: { dbUrl: 'must-not-be-public' },
    });
  }
}

describe('GlobalHttpExceptionFilter', () => {
  function createFilter() {
    // Preserve Vitest mock types for test assertions.
    const logger = {
      setContext: vi.fn(),
      error: vi.fn(),
    };

    const filter = new GlobalHttpExceptionFilter(
      logger as unknown as PinoLogger,
    );

    return { filter, logger };
  }

  it('returns only the public contract for known application errors', () => {
    const { filter, logger } = createFilter();
    const { host, response } = createHost({
      id: 'request-123',
      method: 'POST',
      originalUrl: '/test?token=private',
    });

    filter.catch(new TestPublicApplicationError(), host);

    expect(response.setHeader).toHaveBeenCalledWith(
      'X-Request-Id',
      'request-123',
    );
    expect(response.status).toHaveBeenCalledWith(422);
    expect(response.json).toHaveBeenCalledWith({
      code: 'TEST.EXAMPLE_FAILURE',
      category: ERROR_CATEGORY.BUSINESS_RULE,
      requestId: 'request-123',
      params: { min: 2 },
    });
    expect(JSON.stringify(response.json.mock.calls)).not.toContain(
      'must-not-be-public',
    );
    expect(JSON.stringify(response.json.mock.calls)).not.toContain(
      'Internal-only message',
    );
    expect(logger.error).not.toHaveBeenCalled();
  });

  it('hides unexpected exception messages and logs them internally', () => {
    const { filter, logger } = createFilter();
    const { host, response } = createHost({
      id: 'request-456',
      method: 'GET',
      originalUrl: '/health?secret=hidden',
    });

    filter.catch(new Error('postgres://secret-password@private-host/db'), host);

    expect(response.status).toHaveBeenCalledWith(500);
    expect(response.json).toHaveBeenCalledWith({
      code: 'COMMON.INTERNAL_ERROR',
      category: 'internal',
      requestId: 'request-456',
    });
    expect(JSON.stringify(response.json.mock.calls)).not.toContain(
      'secret-password',
    );
    expect(logger.error).toHaveBeenCalledTimes(1);
    expect(logger.error.mock.calls[0]?.[0]).toMatchObject({
      requestId: 'request-456',
      method: 'GET',
      path: '/health',
    });
  });
});
