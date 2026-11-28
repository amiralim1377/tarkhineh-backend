import type { BranchTestFactory } from '../../organization/factories/branch-test.factory.js';
import type { OrganizationTestFactory } from '../../organization/factories/organization-test.factory.js';
import type { UserTestFactory } from '../../identity-access/factories/user-test.factory.js';

export class MenuTestFixtureFactory {
  constructor(
    private readonly users: UserTestFactory,
    private readonly organizations: OrganizationTestFactory,
    private readonly branches: BranchTestFactory,
  ) {}

  async create() {
    const user = await this.users.create();
    const organization = await this.organizations.create({
      ownerUserId: user.id,
    });
    const branch = await this.branches.create({
      organizationId: organization.id,
    });

    return { user, organization, branch };
  }
}
