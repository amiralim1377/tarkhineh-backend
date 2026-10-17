import type { ValidationError } from 'class-validator';

import type { ErrorTranslationParams } from '../../errors/app-error.js';
import {
  InputValidationError,
  type FieldValidationIssue,
} from '../../application/errors/input-validation.error.js';

const FALLBACK_VALIDATION_CODE = 'VALIDATION.CONSTRAINT_FAILED';
const MAX_VALIDATION_ISSUES = 100;
const MAX_FIELD_SEGMENT_LENGTH = 80;

const CONSTRAINT_CODES: Readonly<Record<string, string>> = {
  whitelistValidation: 'VALIDATION.UNKNOWN_PROPERTY',
  isDefined: 'VALIDATION.REQUIRED',
  isNotEmpty: 'VALIDATION.NOT_EMPTY',
  isNotEmptyObject: 'VALIDATION.NOT_EMPTY_OBJECT',
  isString: 'VALIDATION.IS_STRING',
  isBoolean: 'VALIDATION.IS_BOOLEAN',
  isNumber: 'VALIDATION.IS_NUMBER',
  isInt: 'VALIDATION.IS_INTEGER',
  isPositive: 'VALIDATION.IS_POSITIVE',
  isNegative: 'VALIDATION.IS_NEGATIVE',
  isEmail: 'VALIDATION.IS_EMAIL',
  isUrl: 'VALIDATION.IS_URL',
  isUUID: 'VALIDATION.IS_UUID',
  isEnum: 'VALIDATION.IS_ENUM',
  isArray: 'VALIDATION.IS_ARRAY',
  isObject: 'VALIDATION.IS_OBJECT',
  isDate: 'VALIDATION.IS_DATE',
  minLength: 'VALIDATION.MIN_LENGTH',
  maxLength: 'VALIDATION.MAX_LENGTH',
  min: 'VALIDATION.MIN',
  max: 'VALIDATION.MAX',
  arrayMinSize: 'VALIDATION.ARRAY_MIN_SIZE',
  arrayMaxSize: 'VALIDATION.ARRAY_MAX_SIZE',
  arrayUnique: 'VALIDATION.ARRAY_UNIQUE',
  equals: 'VALIDATION.EQUALS',
  notEquals: 'VALIDATION.NOT_EQUALS',
  isIn: 'VALIDATION.IS_IN',
  isNotIn: 'VALIDATION.IS_NOT_IN',
  matches: 'VALIDATION.MATCHES',
  contains: 'VALIDATION.CONTAINS',
  notContains: 'VALIDATION.NOT_CONTAINS',
  nestedValidation: 'VALIDATION.NESTED_INVALID',
};

const PUBLIC_NUMERIC_PARAMS: Readonly<Record<string, readonly string[]>> = {
  minLength: ['min'],
  maxLength: ['max'],
  min: ['min'],
  max: ['max'],
  arrayMinSize: ['min'],
  arrayMaxSize: ['max'],
};

function compareStrings(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizePathSegment(property: string): string {
  return property
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .slice(0, MAX_FIELD_SEGMENT_LENGTH)
    .replace(/\\/g, '\\\\')
    .replace(/\./g, '\\.');
}

function extractPublicParams(
  error: ValidationError,
  constraintName: string,
): ErrorTranslationParams | undefined {
  const allowedKeys = PUBLIC_NUMERIC_PARAMS[constraintName];
  if (!allowedKeys?.length) return undefined;

  const context = error.contexts?.[constraintName];
  if (!isRecord(context) || !isRecord(context.publicParams)) return undefined;

  const rawParams = context.publicParams;
  const safeParams: Record<string, number> = {};

  for (const key of allowedKeys) {
    const value = rawParams[key];
    if (typeof value === 'number' && Number.isFinite(value)) {
      safeParams[key] = value;
    }
  }

  return Object.keys(safeParams).length > 0
    ? Object.freeze(safeParams)
    : undefined;
}

export function createValidationException(
  errors: ValidationError[],
): InputValidationError {
  const issues: FieldValidationIssue[] = [];
  const seenIssues = new Set<string>();

  const addIssue = (issue: FieldValidationIssue): void => {
    if (issues.length >= MAX_VALIDATION_ISSUES) return;

    const identity = `${issue.field}\u0000${issue.code}\u0000${JSON.stringify(issue.params ?? {})}`;
    if (seenIssues.has(identity)) return;

    seenIssues.add(identity);
    issues.push(issue);
  };

  const collect = (
    validationErrors: readonly ValidationError[],
    parentPath: string,
  ): void => {
    const sortedErrors = [...validationErrors].sort((left, right) =>
      compareStrings(left.property ?? '', right.property ?? ''),
    );

    for (const error of sortedErrors) {
      if (issues.length >= MAX_VALIDATION_ISSUES) return;

      const segment = normalizePathSegment(error.property ?? '');
      const currentPath = segment
        ? parentPath
          ? `${parentPath}.${segment}`
          : segment
        : parentPath;

      const constraintNames = Object.keys(error.constraints ?? {}).sort(
        compareStrings,
      );

      for (const constraintName of constraintNames) {
        if (issues.length >= MAX_VALIDATION_ISSUES) return;

        // Do not reflect attacker-controlled unknown-property names in responses.
        const field =
          constraintName === 'whitelistValidation' ? '$' : currentPath || '$';
        const code =
          CONSTRAINT_CODES[constraintName] ?? FALLBACK_VALIDATION_CODE;
        const params = extractPublicParams(error, constraintName);

        addIssue({
          field,
          code,
          ...(params ? { params } : {}),
        });
      }

      if (error.children?.length) collect(error.children, currentPath);
    }
  };

  collect(errors, '');

  if (issues.length === 0) {
    issues.push({ field: '$', code: 'VALIDATION.INVALID_INPUT' });
  }

  issues.sort(
    (left, right) =>
      compareStrings(left.field, right.field) ||
      compareStrings(left.code, right.code),
  );

  return new InputValidationError(issues);
}
