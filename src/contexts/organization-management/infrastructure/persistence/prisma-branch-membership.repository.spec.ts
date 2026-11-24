import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Prisma } from '../../../../generated/prisma/client.js';
import { BranchMembership } from '../../domain/entities/branch-membership.js';
import { MEMBERSHIP_STATUS } from '../../domain/types/lifecycle-status.js';
import { InvalidBranchMembershipDataError } from '../../domain/errors/invalid-branch-membership.error.js';
import { BranchMembershipAlreadyExistsError } from '../../application/errors/branch-membership-already-exists.error.js';
import { PrismaBranchMembershipRepository } from './prisma-branch-membership.repository.js';

// ============================================================
// TEST CONSTANTS
// ============================================================

const MEMBERSHIP_ID = 'branch-membership-123';
const ORGANIZATION_ID = 'organization-123';
const BRANCH_ID = 'branch-123';
const ORGANIZATION_MEMBERSHIP_ID = 'organization-membership-123';

const CREATED_AT = new Date('2026-01-01T10:00:00.000Z');
const UPDATED_AT = new Date('2026-01-01T11:00:00.000Z');

// ============================================================
// MOCKS
// ============================================================

const prisma = {
  branchMembership: {
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  },
};

// ============================================================
// FIXTURES
// ============================================================

function createPrismaMembershipRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: MEMBERSHIP_ID,
    organizationId: ORGANIZATION_ID,
    branchId: BRANCH_ID,
    organizationMembershipId: ORGANIZATION_MEMBERSHIP_ID,
    status: MEMBERSHIP_STATUS.ACTIVE,
    createdAt: CREATED_AT,
    updatedAt: UPDATED_AT,
    ...overrides,
  };
}

function createMembership(
  overrides: Partial<{
    id: string;
    organizationId: string;
    branchId: string;
    organizationMembershipId: string;
    status: typeof MEMBERSHIP_STATUS.ACTIVE;
  }> = {},
): BranchMembership {
  return BranchMembership.create({
    id: MEMBERSHIP_ID,
    organizationId: ORGANIZATION_ID,
    branchId: BRANCH_ID,
    organizationMembershipId: ORGANIZATION_MEMBERSHIP_ID,
    status: MEMBERSHIP_STATUS.ACTIVE,
    ...overrides,
  });
}

function createUniqueConstraintError(
  target: string[] | string,
): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError('Unique constraint failed.', {
    code: 'P2002',
    clientVersion: '7.10.1',
    meta: {
      target,
    },
  });
}

// ============================================================
// TEST SUITE
// ============================================================

describe('PrismaBranchMembershipRepository', () => {
  let sut: PrismaBranchMembershipRepository;

  beforeEach(() => {
    vi.resetAllMocks();

    prisma.branchMembership.findUnique.mockResolvedValue(null);
    prisma.branchMembership.findFirst.mockResolvedValue(null);
    prisma.branchMembership.create.mockResolvedValue(
      createPrismaMembershipRecord(),
    );
    prisma.branchMembership.update.mockResolvedValue(
      createPrismaMembershipRecord(),
    );

    sut = new PrismaBranchMembershipRepository(
      prisma as unknown as Pick<Prisma.TransactionClient, 'branchMembership'>,
    );
  });

  // ==========================================================
  // FIND BY ID
  // ==========================================================

  describe('findById', () => {
    it('should return a branch membership when found', async () => {
      // Arrange
      prisma.branchMembership.findUnique.mockResolvedValue(
        createPrismaMembershipRecord(),
      );

      // Act
      const actual = await sut.findById(ORGANIZATION_ID, MEMBERSHIP_ID);

      // Assert
      expect(actual).toBeInstanceOf(BranchMembership);
      expect(actual?.id).toBe(MEMBERSHIP_ID);
      expect(actual?.organizationId).toBe(ORGANIZATION_ID);
      expect(actual?.branchId).toBe(BRANCH_ID);
      expect(actual?.organizationMembershipId).toBe(ORGANIZATION_MEMBERSHIP_ID);
      expect(actual?.status).toBe(MEMBERSHIP_STATUS.ACTIVE);

      expect(prisma.branchMembership.findUnique).toHaveBeenCalledOnce();
      expect(prisma.branchMembership.findUnique).toHaveBeenCalledWith({
        where: {
          id_organizationId: {
            id: MEMBERSHIP_ID,
            organizationId: ORGANIZATION_ID,
          },
        },
      });
    });

    it('should return null when membership does not exist', async () => {
      // Arrange
      prisma.branchMembership.findUnique.mockResolvedValue(null);

      // Act
      const actual = await sut.findById(ORGANIZATION_ID, MEMBERSHIP_ID);

      // Assert
      expect(actual).toBeNull();
      expect(prisma.branchMembership.findUnique).toHaveBeenCalledOnce();
    });

    it('should propagate Prisma errors', async () => {
      // Arrange
      const expectedError = new Error('Database connection failed.');

      prisma.branchMembership.findUnique.mockRejectedValue(expectedError);

      // Act & Assert
      await expect(sut.findById(ORGANIZATION_ID, MEMBERSHIP_ID)).rejects.toBe(
        expectedError,
      );
    });

    it('should throw InvalidBranchMembershipDataError when persisted data is invalid', async () => {
      // Arrange
      prisma.branchMembership.findUnique.mockResolvedValue(
        createPrismaMembershipRecord({
          status: 'INVALID_STATUS',
        }),
      );

      // Act & Assert
      await expect(
        sut.findById(ORGANIZATION_ID, MEMBERSHIP_ID),
      ).rejects.toBeInstanceOf(InvalidBranchMembershipDataError);
    });
  });

  // ==========================================================
  // FIND BY BRANCH AND ORGANIZATION MEMBERSHIP
  // ==========================================================

  describe('findByBranchAndOrganizationMembership', () => {
    it('should return a branch membership when found', async () => {
      // Arrange
      prisma.branchMembership.findFirst.mockResolvedValue(
        createPrismaMembershipRecord(),
      );

      // Act
      const actual = await sut.findByBranchAndOrganizationMembership(
        ORGANIZATION_ID,
        BRANCH_ID,
        ORGANIZATION_MEMBERSHIP_ID,
      );

      // Assert
      expect(actual).toBeInstanceOf(BranchMembership);
      expect(actual?.id).toBe(MEMBERSHIP_ID);
      expect(actual?.organizationId).toBe(ORGANIZATION_ID);
      expect(actual?.branchId).toBe(BRANCH_ID);
      expect(actual?.organizationMembershipId).toBe(ORGANIZATION_MEMBERSHIP_ID);
      expect(actual?.status).toBe(MEMBERSHIP_STATUS.ACTIVE);

      expect(prisma.branchMembership.findFirst).toHaveBeenCalledOnce();
      expect(prisma.branchMembership.findFirst).toHaveBeenCalledWith({
        where: {
          organizationId: ORGANIZATION_ID,
          branchId: BRANCH_ID,
          organizationMembershipId: ORGANIZATION_MEMBERSHIP_ID,
        },
      });
    });

    it('should return null when membership does not exist', async () => {
      // Arrange
      prisma.branchMembership.findFirst.mockResolvedValue(null);

      // Act
      const actual = await sut.findByBranchAndOrganizationMembership(
        ORGANIZATION_ID,
        BRANCH_ID,
        ORGANIZATION_MEMBERSHIP_ID,
      );

      // Assert
      expect(actual).toBeNull();
      expect(prisma.branchMembership.findFirst).toHaveBeenCalledOnce();
    });

    it('should include organization ID in the lookup criteria', async () => {
      // Arrange
      prisma.branchMembership.findFirst.mockResolvedValue(null);

      // Act
      await sut.findByBranchAndOrganizationMembership(
        ORGANIZATION_ID,
        BRANCH_ID,
        ORGANIZATION_MEMBERSHIP_ID,
      );

      // Assert
      expect(prisma.branchMembership.findFirst).toHaveBeenCalledWith({
        where: {
          organizationId: ORGANIZATION_ID,
          branchId: BRANCH_ID,
          organizationMembershipId: ORGANIZATION_MEMBERSHIP_ID,
        },
      });
    });

    it('should propagate Prisma errors', async () => {
      // Arrange
      const expectedError = new Error('Database query failed.');

      prisma.branchMembership.findFirst.mockRejectedValue(expectedError);

      // Act & Assert
      await expect(
        sut.findByBranchAndOrganizationMembership(
          ORGANIZATION_ID,
          BRANCH_ID,
          ORGANIZATION_MEMBERSHIP_ID,
        ),
      ).rejects.toBe(expectedError);
    });

    it('should throw InvalidBranchMembershipDataError when persisted data is invalid', async () => {
      // Arrange
      prisma.branchMembership.findFirst.mockResolvedValue(
        createPrismaMembershipRecord({
          organizationMembershipId: '',
        }),
      );

      // Act & Assert
      await expect(
        sut.findByBranchAndOrganizationMembership(
          ORGANIZATION_ID,
          BRANCH_ID,
          ORGANIZATION_MEMBERSHIP_ID,
        ),
      ).rejects.toBeInstanceOf(InvalidBranchMembershipDataError);
    });
  });

  // ==========================================================
  // SAVE
  // ==========================================================

  describe('save', () => {
    it('should save a branch membership successfully', async () => {
      // Arrange
      const membership = createMembership();

      // Act
      await sut.save(membership);

      // Assert
      expect(prisma.branchMembership.create).toHaveBeenCalledOnce();
      expect(prisma.branchMembership.create).toHaveBeenCalledWith({
        data: {
          id: membership.id,
          organizationId: membership.organizationId,
          branchId: membership.branchId,
          organizationMembershipId: membership.organizationMembershipId,
          status: membership.status,
          createdAt: membership.createdAt,
          updatedAt: membership.updatedAt,
        },
      });
    });

    it('should throw BranchMembershipAlreadyExistsError when branch membership unique constraint is violated', async () => {
      // Arrange
      const membership = createMembership();

      const prismaError = createUniqueConstraintError([
        'branchId',
        'organizationMembershipId',
      ]);

      prisma.branchMembership.create.mockRejectedValue(prismaError);

      // Act & Assert
      await expect(sut.save(membership)).rejects.toBeInstanceOf(
        BranchMembershipAlreadyExistsError,
      );

      expect(prisma.branchMembership.create).toHaveBeenCalledOnce();
    });

    it('should recognize branch membership unique constraint when target is a string', async () => {
      // Arrange
      const membership = createMembership();

      const prismaError = createUniqueConstraintError(
        'BranchMembership_branchId_organizationMembershipId_key',
      );

      prisma.branchMembership.create.mockRejectedValue(prismaError);

      // Act & Assert
      await expect(sut.save(membership)).rejects.toBeInstanceOf(
        BranchMembershipAlreadyExistsError,
      );
    });

    it('should not translate unrelated unique constraint errors', async () => {
      // Arrange
      const membership = createMembership();

      const prismaError = createUniqueConstraintError(['id', 'organizationId']);

      prisma.branchMembership.create.mockRejectedValue(prismaError);

      // Act & Assert
      await expect(sut.save(membership)).rejects.toBe(prismaError);
    });

    it('should propagate unexpected persistence errors', async () => {
      // Arrange
      const membership = createMembership();

      const expectedError = new Error('Could not save branch membership.');

      prisma.branchMembership.create.mockRejectedValue(expectedError);

      // Act & Assert
      await expect(sut.save(membership)).rejects.toBe(expectedError);
    });
  });

  // ==========================================================
  // UPDATE
  // ==========================================================

  describe('update', () => {
    it('should update a branch membership successfully', async () => {
      // Arrange
      const membership = createMembership({
        status: MEMBERSHIP_STATUS.ACTIVE,
      });

      membership.suspend();

      // Act
      await sut.update(membership);

      // Assert
      expect(prisma.branchMembership.update).toHaveBeenCalledOnce();
      expect(prisma.branchMembership.update).toHaveBeenCalledWith({
        where: {
          id_organizationId: {
            id: membership.id,
            organizationId: membership.organizationId,
          },
        },
        data: {
          status: MEMBERSHIP_STATUS.SUSPENDED,
          updatedAt: membership.updatedAt,
        },
      });
    });

    it('should propagate Prisma errors', async () => {
      // Arrange
      const membership = createMembership();

      const expectedError = new Error('Could not update branch membership.');

      prisma.branchMembership.update.mockRejectedValue(expectedError);

      // Act & Assert
      await expect(sut.update(membership)).rejects.toBe(expectedError);

      expect(prisma.branchMembership.update).toHaveBeenCalledOnce();
    });
  });
});
