import { Test } from '@nestjs/testing';
import { Prisma } from '../../../../generated/prisma/client.js';
import { PrismaService } from '../../../../prisma/prisma.service.js';
import { describe, expect, it, vi } from 'vitest';
import { PrismaDefaultAuthorizationSnapshotReader } from './prisma-authorization-snapshot.reader.js';

describe('PrismaDefaultAuthorizationSnapshotReader NestJS DI', () => {
  it('resolves PrismaService from the Nest container and uses its transaction', async () => {
    const organizationFindUnique = vi.fn().mockResolvedValue({
      id: 'org-1',
      status: 'ACTIVE',
    });
    const organizationMembershipFindFirst = vi.fn().mockResolvedValue(null);

    const tx = {
      organization: {
        findUnique: organizationFindUnique,
      },
      organizationMembership: {
        findFirst: organizationMembershipFindFirst,
      },
    } as unknown as Prisma.TransactionClient;

    const transaction = vi.fn(
      async (
        operation: (client: Prisma.TransactionClient) => Promise<unknown>,
      ) => operation(tx),
    );

    const prisma = {
      $transaction: transaction,
    } as unknown as PrismaService;

    const moduleRef = await Test.createTestingModule({
      providers: [
        PrismaDefaultAuthorizationSnapshotReader,
        {
          provide: PrismaService,
          useValue: prisma,
        },
      ],
    }).compile();

    try {
      const reader = moduleRef.get(PrismaDefaultAuthorizationSnapshotReader);

      const snapshot = await reader.loadSnapshot({
        userId: 'user-1',
        organizationId: 'org-1',
      });

      expect(snapshot.organization).toEqual({
        id: 'org-1',
        status: 'ACTIVE',
      });
      expect(snapshot.organizationMembership).toBeNull();
      expect(transaction).toHaveBeenCalledOnce();
      expect(organizationFindUnique).toHaveBeenCalledOnce();
      expect(organizationMembershipFindFirst).toHaveBeenCalledOnce();
    } finally {
      await moduleRef.close();
    }
  });
});
