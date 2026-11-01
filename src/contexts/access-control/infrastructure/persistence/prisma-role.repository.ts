import { Prisma } from '../../../../generated/prisma/client.js';
import { normalizePrismaError } from '../../../../prisma/errors/prisma-error-translator.js';
import { RoleCodeAlreadyExistsError } from '../../application/errors/role-code-already-exists.error.js';
import type { RoleRepository } from '../../application/ports/role.repository.js';
import type { Role } from '../../domain/roles/role.js';
import {
  mapRoleToDomain,
  ROLE_WITH_PERMISSIONS,
} from './access-control-persistence.mapper.js';

export class PrismaRoleRepository implements RoleRepository {
  constructor(private readonly prisma: Prisma.TransactionClient) {}

  async existsByCode(
    organizationId: string,
    code: string,
  ): Promise<boolean> {
    try {
      const record = await this.prisma.role.findFirst({
        where: {
          definitionScope: 'ORGANIZATION',
          organizationId,
          code,
        },
        select: {
          id: true,
        },
      });

      return record !== null;
    } catch (error: unknown) {
      throw normalizePrismaError(error);
    }
  }

  async findAssignableById(
    organizationId: string,
    roleId: string,
  ): Promise<Role | null> {
    try {
      const record = await this.prisma.role.findFirst({
        where: {
          id: roleId,
          status: 'ACTIVE',
          isAssignable: true,
          OR: [
            {
              definitionScope: 'SYSTEM',
              organizationId: null,
            },
            {
              definitionScope: 'ORGANIZATION',
              organizationId,
            },
          ],
        },
        include: ROLE_WITH_PERMISSIONS,
      });

      return record ? mapRoleToDomain(record) : null;
    } catch (error: unknown) {
      throw normalizePrismaError(error);
    }
  }

  async findById(
    organizationId: string,
    roleId: string,
  ): Promise<Role | null> {
    try {
      const record = await this.prisma.role.findFirst({
        where: {
          id: roleId,
          definitionScope: 'ORGANIZATION',
          organizationId,
        },
        include: ROLE_WITH_PERMISSIONS,
      });

      return record ? mapRoleToDomain(record) : null;
    } catch (error: unknown) {
      throw normalizePrismaError(error);
    }
  }

  async save(role: Role, createdById: string): Promise<void> {
    try {
      await this.prisma.role.create({
        data: {
          id: role.getId().getValue(),
          code: role.getCode(),
          name: role.getName(),
          description: role.getDescription(),
          definitionScope: role.getDefinitionScope(),
          assignmentScope: role.getAssignmentScope(),
          organizationId: role.getOrganizationId(),
          isAssignable: role.isAssignable(),
          status: role.getStatus(),
          createdById,
          permissions: {
            create: role.getPermissionCodes().map((code) => ({
              permission: {
                connect: { code },
              },
            })),
          },
        },
      });
    } catch (error: unknown) {
      if (this.isOrganizationRoleCodeUniqueViolation(error)) {
        throw new RoleCodeAlreadyExistsError();
      }

      throw normalizePrismaError(error);
    }
  }

  async update(role: Role): Promise<void> {
    try {
      await this.prisma.role.update({
        where: {
          id: role.getId().getValue(),
        },
        data: {
          name: role.getName(),
          description: role.getDescription(),
          status: role.getStatus(),
          permissions: {
            deleteMany: {},
            create: role.getPermissionCodes().map((code) => ({
              permission: {
                connect: { code },
              },
            })),
          },
        },
      });
    } catch (error: unknown) {
      throw normalizePrismaError(error);
    }
  }

  private isOrganizationRoleCodeUniqueViolation(
    error: unknown,
  ): boolean {
    if (
      !(error instanceof Prisma.PrismaClientKnownRequestError) ||
      error.code !== 'P2002'
    ) {
      return false;
    }

    const target = error.meta?.target;

    if (Array.isArray(target)) {
      return (
        target.includes('organizationId') &&
        target.includes('code')
      );
    }

    if (typeof target === 'string') {
      return (
        target.includes('Role_organizationId_code_key') ||
        (target.includes('organizationId') && target.includes('code'))
      );
    }

    return false;
  }
}
