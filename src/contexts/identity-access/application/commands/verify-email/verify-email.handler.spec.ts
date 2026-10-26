import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Clock } from '../../../../../shared/application/ports/clock.port.js';

import type { EmailVerificationTokenFactory } from '../../ports/email-verification-token-factory.port.js';

import type { EmailVerificationCompletionStore } from '../../ports/email-verification-completion-store.port.js';

import { InvalidEmailVerificationTokenError } from '../../errors/invalid-email-verification-token.error.js';

import { VerifyEmailCommand } from './verify-email.command.js';
import { VerifyEmailHandler } from './verify-email.handler.js';

const FIXED_NOW = new Date('2026-10-26T10:00:00.000Z');

const RAW_TOKEN = 'raw-email-verification-token';
const TOKEN_HASH = 'hashed-email-verification-token';

function createSut() {
  const hash = vi.fn((_token: string) => TOKEN_HASH);

  const completeEmailVerification = vi.fn();

  const now = vi.fn(() => new Date(FIXED_NOW.getTime()));

  const tokenFactory = {
    hash,
  } as unknown as EmailVerificationTokenFactory;

  const verificationStore = {
    completeEmailVerification,
  } as unknown as EmailVerificationCompletionStore;

  const clock = {
    now,
  } as Clock;

  const handler = new VerifyEmailHandler(
    verificationStore,
    tokenFactory,
    clock,
  );

  return {
    handler,
    hash,
    completeEmailVerification,
    now,
  };
}

describe('VerifyEmailHandler', () => {
  let sut: ReturnType<typeof createSut>;

  beforeEach(() => {
    sut = createSut();

    sut.completeEmailVerification.mockResolvedValue(true);
  });

  describe('successful email verification', () => {
    it('hashes the token and delegates email verification to the store', async () => {
      const result = await sut.handler.execute(
        new VerifyEmailCommand(RAW_TOKEN),
      );

      expect(result).toEqual({
        message: 'Email verified successfully.',
      });

      expect(sut.hash).toHaveBeenCalledOnce();
      expect(sut.hash).toHaveBeenCalledWith(RAW_TOKEN);

      expect(sut.now).toHaveBeenCalledOnce();

      expect(sut.completeEmailVerification).toHaveBeenCalledOnce();

      expect(sut.completeEmailVerification).toHaveBeenCalledWith({
        tokenHash: TOKEN_HASH,
        now: FIXED_NOW,
      });
    });

    it('does not pass the raw token to the persistence store', async () => {
      await sut.handler.execute(new VerifyEmailCommand(RAW_TOKEN));

      expect(sut.completeEmailVerification).toHaveBeenCalledWith({
        tokenHash: TOKEN_HASH,
        now: FIXED_NOW,
      });

      expect(sut.completeEmailVerification).not.toHaveBeenCalledWith(
        expect.objectContaining({
          tokenHash: RAW_TOKEN,
        }),
      );
    });
  });

  describe('token validation', () => {
    it('throws InvalidEmailVerificationTokenError when the store returns false', async () => {
      sut.completeEmailVerification.mockResolvedValueOnce(false);

      await expect(
        sut.handler.execute(new VerifyEmailCommand(RAW_TOKEN)),
      ).rejects.toBeInstanceOf(InvalidEmailVerificationTokenError);

      expect(sut.hash).toHaveBeenCalledWith(RAW_TOKEN);

      expect(sut.completeEmailVerification).toHaveBeenCalledWith({
        tokenHash: TOKEN_HASH,
        now: FIXED_NOW,
      });
    });
  });

  describe('failure handling', () => {
    it('propagates errors from the verification store', async () => {
      const databaseError = new Error('Email verification transaction failed');

      sut.completeEmailVerification.mockRejectedValueOnce(databaseError);

      await expect(
        sut.handler.execute(new VerifyEmailCommand(RAW_TOKEN)),
      ).rejects.toBe(databaseError);

      expect(sut.hash).toHaveBeenCalledWith(RAW_TOKEN);

      expect(sut.completeEmailVerification).toHaveBeenCalledOnce();
    });

    it('does not call the store if token hashing fails', async () => {
      const hashingError = new Error('Token hashing failed');

      sut.hash.mockImplementationOnce(() => {
        throw hashingError;
      });

      await expect(
        sut.handler.execute(new VerifyEmailCommand(RAW_TOKEN)),
      ).rejects.toBe(hashingError);

      expect(sut.completeEmailVerification).not.toHaveBeenCalled();

      expect(sut.now).not.toHaveBeenCalled();
    });
  });
});
