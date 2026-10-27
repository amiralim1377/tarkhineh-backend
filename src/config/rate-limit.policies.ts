/**
 * HTTP rate-limit policies shared by the throttler module and controllers.
 * TTL and blockDuration values are expressed in milliseconds.
 */
export const RATE_LIMIT_POLICIES = {
  default: {
    limit: 120,
    ttl: 60_000,
    blockDuration: 60_000,
  },
  loginEmail: {
    limit: 10,
    ttl: 15 * 60_000,
    blockDuration: 15 * 60_000,
  },
  registerEmail: {
    limit: 5,
    ttl: 15 * 60_000,
    blockDuration: 15 * 60_000,
  },
  forgotPassword: {
    limit: 5,
    ttl: 15 * 60_000,
    blockDuration: 15 * 60_000,
  },
  resetPassword: {
    limit: 10,
    ttl: 15 * 60_000,
    blockDuration: 15 * 60_000,
  },
  verifyEmail: {
    limit: 10,
    ttl: 15 * 60_000,
    blockDuration: 15 * 60_000,
  },
  refreshSession: {
    limit: 30,
    ttl: 60_000,
    blockDuration: 60_000,
  },
  logoutSession: {
    limit: 30,
    ttl: 60_000,
    blockDuration: 60_000,
  },
  changePassword: {
    limit: 5,
    ttl: 15 * 60_000,
    blockDuration: 15 * 60_000,
  },
} as const;
