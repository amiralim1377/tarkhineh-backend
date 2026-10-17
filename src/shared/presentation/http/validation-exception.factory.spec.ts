import type { ValidationError } from 'class-validator';
import { describe, expect, it } from 'vitest';

import { createValidationException } from './validation-exception.factory.js';

describe('createValidationException', () => {
  it('maps constraint types to stable codes and safe parameters', () => {
    const errors: ValidationError[] = [
      {
        property: 'password',
        constraints: {
          minLength: 'password must be longer than or equal to 12 characters',
        },
        contexts: {
          minLength: { publicParams: { min: 12 } },
        },
      },
    ];

    const exception = createValidationException(errors);

    expect(exception.code).toBe('COMMON.VALIDATION_FAILED');
    expect(exception.fields).toEqual([
      {
        field: 'password',
        code: 'VALIDATION.MIN_LENGTH',
        params: { min: 12 },
      },
    ]);
    expect(exception.message).not.toContain('longer than');
  });

  it('never returns raw class-validator messages for unknown constraints', () => {
    const errors: ValidationError[] = [
      {
        property: 'email',
        constraints: {
          customInternalValidator:
            'Internal database diagnostic must never be returned',
        },
      },
    ];

    const exception = createValidationException(errors);

    expect(exception.fields).toEqual([
      {
        field: 'email',
        code: 'VALIDATION.CONSTRAINT_FAILED',
      },
    ]);
    expect(exception.message).not.toContain('database diagnostic');
  });

  it('maps nested errors to deterministic property paths', () => {
    const errors: ValidationError[] = [
      {
        property: 'address',
        children: [
          {
            property: 'postalCode',
            constraints: { isString: 'Raw framework message' },
          },
        ],
      },
    ];

    expect(createValidationException(errors).fields).toEqual([
      {
        field: 'address.postalCode',
        code: 'VALIDATION.IS_STRING',
      },
    ]);
  });

  it('does not reflect arbitrary non-whitelisted property names', () => {
    const errors: ValidationError[] = [
      {
        property: '<script>alert(1)</script>',
        constraints: { whitelistValidation: 'property is not allowed' },
      },
    ];

    expect(createValidationException(errors).fields).toEqual([
      {
        field: '$',
        code: 'VALIDATION.UNKNOWN_PROPERTY',
      },
    ]);
  });

  it('sorts results deterministically and caps the number of issues', () => {
    const errors: ValidationError[] = Array.from(
      { length: 120 },
      (_, index) => ({
        property: `field${String(119 - index).padStart(3, '0')}`,
        constraints: { isString: 'Raw message' },
      }),
    );

    const exception = createValidationException(errors);

    expect(exception.fields).toHaveLength(100);
    expect(exception.fields[0]?.field).toBe('field000');
    expect(exception.fields[99]?.field).toBe('field099');
  });
});
