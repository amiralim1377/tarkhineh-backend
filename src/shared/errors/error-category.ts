export const ERROR_CATEGORY = {
  VALIDATION: 'validation',
  AUTHENTICATION: 'authentication',
  AUTHORIZATION: 'authorization',
  NOT_FOUND: 'not_found',
  CONFLICT: 'conflict',
  BUSINESS_RULE: 'business_rule',
  RATE_LIMITED: 'rate_limited',
  DEPENDENCY_UNAVAILABLE: 'dependency_unavailable',
} as const;

export type ErrorCategory =
  (typeof ERROR_CATEGORY)[keyof typeof ERROR_CATEGORY];
