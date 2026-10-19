import { beforeEach, describe, expect, it, vi } from 'vitest';

const { findUnique, updateMany, normalizePrismaError } = vi.hoisted(() => ({
  findUnique: vi.fn(),
  updateMany: vi.fn(),
  normalizePrismaError: vi.fn((error: unknown) => error),
}));

vi.mock('../../../../prisma/prisma.service.js', () => ({
  PrismaService: class {
    user = {
      findUnique,
      updateMany,
    };
  },
}));

vi.mock('../../../../prisma/errors/prisma-error-translator.js', () => ({
  normalizePrismaError,
}));

import { PrismaService } from '../../../../prisma/prisma.service.js';
import { IdentityUser } from '../../domain/entities/identity-user.js';
import { PrismaUserAuthenticationRepository } from './prisma-user-authentication.repository.js';

const VERIFIED_AT = new Date('2026-10-18T12:00:00.000Z');

const USER_ROW = {
  id: 'user-123',
  email: 'user@example.com',
  emailVerifiedAt: VERIFIED_AT,
  passwordHash: 'argon2-current-hash',
  displayName: 'Test User',
  status: 'ACTIVE',
};

const USER_SELECT = {
  id: true,
  email: true,
  emailVerifiedAt: true,
  passwordHash: true,
  displayName: true,
  status: true,
};

describe('PrismaUserAuthenticationRepository', () => {
  let repository: PrismaUserAuthenticationRepository;

  beforeEach(() => {
    vi.resetAllMocks();

    normalizePrismaError.mockImplementation((error: unknown) => error);

    repository = new PrismaUserAuthenticationRepository({
      user: {
        findUnique,
        updateMany,
      },
    } as never);
  });

  describe('findByEmail', () => {
    it('returns an IdentityUser when the email exists', async () => {
      findUnique.mockResolvedValue(USER_ROW);

      const result = await repository.findByEmail('user@example.com');

      expect(findUnique).toHaveBeenCalledOnce();
      expect(findUnique).toHaveBeenCalledWith({
        where: { email: 'user@example.com' },
        select: USER_SELECT,
      });

      expect(result).toBeInstanceOf(IdentityUser);
      expect(result?.id).toBe('user-123');
      expect(result?.email).toBe('user@example.com');
      expect(result?.emailVerifiedAt).toEqual(VERIFIED_AT);
      expect(result?.passwordHash).toBe('argon2-current-hash');
      expect(result?.displayName).toBe('Test User');
    });

    it('returns null when the email does not exist', async () => {
      findUnique.mockResolvedValue(null);

      await expect(
        repository.findByEmail('missing@example.com'),
      ).resolves.toBeNull();

      expect(findUnique).toHaveBeenCalledWith({
        where: { email: 'missing@example.com' },
        select: USER_SELECT,
      });
    });

    it('propagates the normalized error when the query fails', async () => {
      const databaseError = new Error('Database unavailable');
      const normalizedError = new Error('Persistence failure');

      findUnique.mockRejectedValue(databaseError);
      normalizePrismaError.mockReturnValue(normalizedError);

      await expect(repository.findByEmail('user@example.com')).rejects.toBe(
        normalizedError,
      );

      expect(normalizePrismaError).toHaveBeenCalledWith(databaseError);
    });
  });

  describe('findById', () => {
    it('returns an IdentityUser when the ID exists', async () => {
      findUnique.mockResolvedValue(USER_ROW);

      const result = await repository.findById('user-123');

      expect(findUnique).toHaveBeenCalledOnce();
      expect(findUnique).toHaveBeenCalledWith({
        where: { id: 'user-123' },
        select: USER_SELECT,
      });

      expect(result).toBeInstanceOf(IdentityUser);
      expect(result?.id).toBe('user-123');
      expect(result?.email).toBe('user@example.com');
      expect(result?.passwordHash).toBe('argon2-current-hash');
    });

    it('returns null when the ID does not exist', async () => {
      findUnique.mockResolvedValue(null);

      await expect(repository.findById('missing-user')).resolves.toBeNull();

      expect(findUnique).toHaveBeenCalledWith({
        where: { id: 'missing-user' },
        select: USER_SELECT,
      });
    });

    it('propagates the normalized error when the query fails', async () => {
      const databaseError = new Error('Database unavailable');
      const normalizedError = new Error('Persistence failure');

      findUnique.mockRejectedValue(databaseError);
      normalizePrismaError.mockReturnValue(normalizedError);

      await expect(repository.findById('user-123')).rejects.toBe(
        normalizedError,
      );

      expect(normalizePrismaError).toHaveBeenCalledWith(databaseError);
    });
  });

  describe('changePassword', () => {
    const input = {
      userId: 'user-123',
      currentPasswordHash: 'argon2-current-hash',
      newPasswordHash: 'argon2-new-hash',
    };

    it('returns true when exactly one user is updated', async () => {
      updateMany.mockResolvedValue({ count: 1 });

      await expect(repository.changePassword(input)).resolves.toBe(true);

      expect(updateMany).toHaveBeenCalledOnce();
      expect(updateMany).toHaveBeenCalledWith({
        where: {
          id: 'user-123',
          passwordHash: 'argon2-current-hash',
          status: 'ACTIVE',
          emailVerifiedAt: { not: null },
        },
        data: {
          passwordHash: 'argon2-new-hash',
        },
      });
    });

    it('returns false when no user matches the update conditions', async () => {
      updateMany.mockResolvedValue({ count: 0 });

      await expect(repository.changePassword(input)).resolves.toBe(false);

      expect(updateMany).toHaveBeenCalledOnce();
    });

    it('requires the expected current password hash to match', async () => {
      updateMany.mockResolvedValue({ count: 0 });

      await expect(
        repository.changePassword({
          ...input,
          currentPasswordHash: 'outdated-password-hash',
        }),
      ).resolves.toBe(false);

      expect(updateMany).toHaveBeenCalledWith({
        where: {
          id: 'user-123',
          passwordHash: 'outdated-password-hash',
          status: 'ACTIVE',
          emailVerifiedAt: { not: null },
        },
        data: {
          passwordHash: 'argon2-new-hash',
        },
      });
    });

    it('only updates an active, email-verified account', async () => {
      updateMany.mockResolvedValue({ count: 0 });

      await repository.changePassword(input);

      expect(updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: 'ACTIVE',
            emailVerifiedAt: { not: null },
          }),
        }),
      );
    });

    it('stores the new password hash rather than the plain-text password', async () => {
      updateMany.mockResolvedValue({ count: 1 });

      await repository.changePassword(input);

      expect(updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: {
            passwordHash: 'argon2-new-hash',
          },
        }),
      );

      expect(updateMany).not.toHaveBeenCalledWith(
        expect.objectContaining({
          data: {
            passwordHash: 'NewPassword456!',
          },
        }),
      );
    });

    it('propagates the normalized error when the update fails', async () => {
      const databaseError = new Error('Database unavailable');
      const normalizedError = new Error('Persistence failure');

      updateMany.mockRejectedValue(databaseError);
      normalizePrismaError.mockReturnValue(normalizedError);

      await expect(repository.changePassword(input)).rejects.toBe(
        normalizedError,
      );

      expect(normalizePrismaError).toHaveBeenCalledWith(databaseError);
    });
  });
});
