import { expect } from 'vitest';

import {
  InvalidBranchDataError,
  type BranchDataErrorCode,
} from '../errors/invalid-branch-data.error.js';

export function expectBranchDataError(
  operation: () => unknown,
  expectedCode: BranchDataErrorCode,
): void {
  let thrownError: unknown;

  try {
    operation();
  } catch (error: unknown) {
    thrownError = error;
  }

  expect(thrownError).toBeInstanceOf(InvalidBranchDataError);

  expect((thrownError as InvalidBranchDataError).code).toBe(expectedCode);
}
