import { describe, expect, it } from 'vitest';

import { addDefaultProblemDetailsResponses } from './setup-swagger.js';

describe('addDefaultProblemDetailsResponses', () => {
  it('adds RFC 9457 fallback responses to operations without replacing explicit defaults', () => {
    const document = {
      paths: {
        '/users': {
          get: {
            responses: {
              '200': { description: 'Successful response' },
              '401': { description: 'Authentication required' },
            },
          },
          post: {
            responses: {
              default: { description: 'Existing controller default' },
            },
          },
          parameters: [{ name: 'id', in: 'path' }],
        },
        '/health': {
          get: {
            responses: {
              '200': { description: 'Healthy' },
            },
          },
        },
      },
    };

    addDefaultProblemDetailsResponses(document);

    const userGetResponses = document.paths['/users']?.get?.responses;
    const userPostResponses = document.paths['/users']?.post?.responses;
    const healthGetResponses = document.paths['/health']?.get?.responses;

    expect(
      (userGetResponses as Record<string, unknown> | undefined)?.['default'],
    ).toEqual({
      description:
        'An undocumented error response using RFC 9457 Problem Details.',
      content: {
        'application/problem+json': {
          schema: { $ref: '#/components/schemas/ApiErrorResponseDto' },
        },
      },
    });
    expect(
      (userPostResponses as Record<string, unknown> | undefined)?.['default'],
    ).toEqual({ description: 'Existing controller default' });
    expect(
      (healthGetResponses as Record<string, unknown> | undefined)?.['default'],
    ).toMatchObject({
      content: {
        'application/problem+json': {
          schema: { $ref: '#/components/schemas/ApiErrorResponseDto' },
        },
      },
    });
  });
});
