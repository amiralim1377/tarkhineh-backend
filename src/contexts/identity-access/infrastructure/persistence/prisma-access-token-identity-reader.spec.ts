import { describe, expect, it, vi } from 'vitest';

import { PrismaService } from '../../../../prisma/prisma.service.js';
import { PrismaAccessTokenIdentityReader } from './prisma-access-token-identity-reader.js';

describe('PrismaAccessTokenIdentityReader', () => {
  it('returns the account status without selecting the password hash', async () => {
    const emailVerifiedAt = new Date('2026-10-19T08:00:00.000Z');

    const findUnique = vi.fn().mockResolvedValue({
      id: 'user-123',
      status: 'ACTIVE',
      emailVerifiedAt,
    });

    const prisma = {
      user: { findUnique },
    } as unknown as PrismaService;

    const reader = new PrismaAccessTokenIdentityReader(prisma);

    await expect(reader.findById('user-123')).resolves.toEqual({
      id: 'user-123',
      status: 'ACTIVE',
      emailVerifiedAt,
    });

    expect(findUnique).toHaveBeenCalledWith({
      where: { id: 'user-123' },
      select: {
        id: true,
        status: true,
        emailVerifiedAt: true,
      },
    });
  });

  it('returns null when the user no longer exists', async () => {
    const findUnique = vi.fn().mockResolvedValue(null);

    const prisma = {
      user: { findUnique },
    } as unknown as PrismaService;

    const reader = new PrismaAccessTokenIdentityReader(prisma);

    await expect(reader.findById('missing-user')).resolves.toBeNull();
  });
});
