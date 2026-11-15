import { PrismaService } from '../../../../prisma/prisma.service.js';
import { PrismaOrganizationLookupAdapter } from './prisma-organization-lookup.adapter.js';

describe('PrismaOrganizationLookupAdapter', () => {
  const prisma = {
    organization: {
      findUnique: vi.fn(),
    },
  };

  let repository: PrismaOrganizationLookupAdapter;

  beforeEach(() => {
    vi.clearAllMocks();
    repository = new PrismaOrganizationLookupAdapter(
      prisma as unknown as PrismaService,
    );
  });

  describe('findStatusById', () => {
    it('should find a organization-status by id and return status', async () => {
      // arrange
      const organizationId = 'organizationId-123';

      prisma.organization.findUnique.mockResolvedValue({
        status: 'ACTIVE',
      });

      //   ACT
      const actual = await repository.findStatusById(organizationId);

      expect(actual).toBe('ACTIVE');
      expect(prisma.organization.findUnique).toHaveBeenCalledTimes(1);

      expect(prisma.organization.findUnique).toHaveBeenCalledWith({
        where: {
          id: organizationId,
        },
        select: {
          status: true,
        },
      });
    });
  });
});
