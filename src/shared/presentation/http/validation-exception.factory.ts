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
  // NestJS / class-validator internal constraints
  whitelistValidation: 'VALIDATION.UNKNOWN_PROPERTY',
  unknownValue: 'VALIDATION.UNKNOWN_VALUE',
  nestedValidation: 'VALIDATION.NESTED_INVALID',
  // Common
  isDefined: 'VALIDATION.REQUIRED',
  isEmpty: 'VALIDATION.IS_EMPTY',
  isNotEmpty: 'VALIDATION.NOT_EMPTY',
  isNotEmptyObject: 'VALIDATION.NOT_EMPTY_OBJECT',
  equals: 'VALIDATION.EQUALS',
  notEquals: 'VALIDATION.NOT_EQUALS',
  isIn: 'VALIDATION.IS_IN',
  isNotIn: 'VALIDATION.IS_NOT_IN',
  // Type validation
  isString: 'VALIDATION.IS_STRING',
  isBoolean: 'VALIDATION.IS_BOOLEAN',
  isNumber: 'VALIDATION.IS_NUMBER',
  isInt: 'VALIDATION.IS_INTEGER',
  isDate: 'VALIDATION.IS_DATE',
  isArray: 'VALIDATION.IS_ARRAY',
  isObject: 'VALIDATION.IS_OBJECT',
  isEnum: 'VALIDATION.IS_ENUM',
  isInstance: 'VALIDATION.IS_INSTANCE',
  // Number validation
  isDivisibleBy: 'VALIDATION.IS_DIVISIBLE_BY',
  isPositive: 'VALIDATION.IS_POSITIVE',
  isNegative: 'VALIDATION.IS_NEGATIVE',
  min: 'VALIDATION.MIN',
  max: 'VALIDATION.MAX',
  // Date validation
  minDate: 'VALIDATION.MIN_DATE',
  maxDate: 'VALIDATION.MAX_DATE',
  // String-type validation
  isBooleanString: 'VALIDATION.IS_BOOLEAN_STRING',
  isDateString: 'VALIDATION.IS_DATE_STRING',
  isNumberString: 'VALIDATION.IS_NUMBER_STRING',
  // String validation
  contains: 'VALIDATION.CONTAINS',
  notContains: 'VALIDATION.NOT_CONTAINS',
  isAlpha: 'VALIDATION.IS_ALPHA',
  isAlphanumeric: 'VALIDATION.IS_ALPHANUMERIC',
  isDecimal: 'VALIDATION.IS_DECIMAL',
  isAscii: 'VALIDATION.IS_ASCII',
  isBase32: 'VALIDATION.IS_BASE32',
  isBase58: 'VALIDATION.IS_BASE58',
  isBase64: 'VALIDATION.IS_BASE64',
  isIBAN: 'VALIDATION.IS_IBAN',
  isBIC: 'VALIDATION.IS_BIC',
  isByteLength: 'VALIDATION.IS_BYTE_LENGTH',
  isCreditCard: 'VALIDATION.IS_CREDIT_CARD',
  isCurrency: 'VALIDATION.IS_CURRENCY',
  isISO4217CurrencyCode: 'VALIDATION.IS_CURRENCY_CODE',
  isEthereumAddress: 'VALIDATION.IS_ETHEREUM_ADDRESS',
  isBtcAddress: 'VALIDATION.IS_BTC_ADDRESS',
  isDataURI: 'VALIDATION.IS_DATA_URI',
  isEmail: 'VALIDATION.IS_EMAIL',
  isFQDN: 'VALIDATION.IS_FQDN',
  isFullWidth: 'VALIDATION.IS_FULL_WIDTH',
  isHalfWidth: 'VALIDATION.IS_HALF_WIDTH',
  isVariableWidth: 'VALIDATION.IS_VARIABLE_WIDTH',
  isHexColor: 'VALIDATION.IS_HEX_COLOR',
  isHSL: 'VALIDATION.IS_HSL',
  isRgbColor: 'VALIDATION.IS_RGB_COLOR',
  isIdentityCard: 'VALIDATION.IS_IDENTITY_CARD',
  isPassportNumber: 'VALIDATION.IS_PASSPORT_NUMBER',
  isPostalCode: 'VALIDATION.IS_POSTAL_CODE',
  isHexadecimal: 'VALIDATION.IS_HEXADECIMAL',
  isOctal: 'VALIDATION.IS_OCTAL',
  isMacAddress: 'VALIDATION.IS_MAC_ADDRESS',
  isIP: 'VALIDATION.IS_IP',
  isPort: 'VALIDATION.IS_PORT',
  isISBN: 'VALIDATION.IS_ISBN',
  isEAN: 'VALIDATION.IS_EAN',
  isISIN: 'VALIDATION.IS_ISIN',
  isISO8601: 'VALIDATION.IS_ISO8601',
  isJSON: 'VALIDATION.IS_JSON',
  isJWT: 'VALIDATION.IS_JWT',
  isLowercase: 'VALIDATION.IS_LOWERCASE',
  isLatLong: 'VALIDATION.IS_LAT_LONG',
  isLatitude: 'VALIDATION.IS_LATITUDE',
  isLongitude: 'VALIDATION.IS_LONGITUDE',
  isMobilePhone: 'VALIDATION.IS_MOBILE_PHONE',
  isISO6391: 'VALIDATION.IS_LANGUAGE_CODE',
  isISO31661Alpha2: 'VALIDATION.IS_COUNTRY_CODE',
  isISO31661Alpha3: 'VALIDATION.IS_COUNTRY_CODE',
  isISO31661Numeric: 'VALIDATION.IS_COUNTRY_CODE',
  isLocale: 'VALIDATION.IS_LOCALE',
  isPhoneNumber: 'VALIDATION.IS_PHONE_NUMBER',
  isMongoId: 'VALIDATION.IS_MONGO_ID',
  isMultibyte: 'VALIDATION.IS_MULTIBYTE',
  isSurrogatePair: 'VALIDATION.IS_SURROGATE_PAIR',
  isTaxId: 'VALIDATION.IS_TAX_ID',
  isUrl: 'VALIDATION.IS_URL',
  isMagnetURI: 'VALIDATION.IS_MAGNET_URI',
  isUUID: 'VALIDATION.IS_UUID',
  isFirebasePushId: 'VALIDATION.IS_FIREBASE_PUSH_ID',
  isUppercase: 'VALIDATION.IS_UPPERCASE',
  isLength: 'VALIDATION.LENGTH',
  minLength: 'VALIDATION.MIN_LENGTH',
  maxLength: 'VALIDATION.MAX_LENGTH',
  matches: 'VALIDATION.MATCHES',
  isMilitaryTime: 'VALIDATION.IS_MILITARY_TIME',
  isTimeZone: 'VALIDATION.IS_TIME_ZONE',
  isHash: 'VALIDATION.IS_HASH',
  isMimeType: 'VALIDATION.IS_MIME_TYPE',
  isSemVer: 'VALIDATION.IS_SEMVER',
  isISSN: 'VALIDATION.IS_ISSN',
  isISRC: 'VALIDATION.IS_ISRC',
  isRFC3339: 'VALIDATION.IS_RFC3339',
  isStrongPassword: 'VALIDATION.IS_STRONG_PASSWORD',
  // Array validation
  arrayContains: 'VALIDATION.ARRAY_CONTAINS',
  arrayNotContains: 'VALIDATION.ARRAY_NOT_CONTAINS',
  arrayNotEmpty: 'VALIDATION.ARRAY_NOT_EMPTY',
  arrayMinSize: 'VALIDATION.ARRAY_MIN_SIZE',
  arrayMaxSize: 'VALIDATION.ARRAY_MAX_SIZE',
  arrayUnique: 'VALIDATION.ARRAY_UNIQUE',
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
