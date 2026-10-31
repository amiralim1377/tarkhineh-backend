/*
  Warnings:

  - You are about to drop the column `isSystem` on the `Role` table. All the data in the column will be lost.
  - You are about to drop the column `branchId` on the `RoleAssignment` table. All the data in the column will be lost.
  - You are about to drop the column `userId` on the `RoleAssignment` table. All the data in the column will be lost.
  - You are about to drop the column `branchId` on the `UserPermissionOverride` table. All the data in the column will be lost.
  - You are about to drop the column `userId` on the `UserPermissionOverride` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[id,organizationId]` on the table `Branch` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[code]` on the table `Role` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[organizationId,code]` on the table `Role` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[branchId,code]` on the table `Role` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[organizationMembershipId,roleId]` on the table `RoleAssignment` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[branchMembershipId,roleId]` on the table `RoleAssignment` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[branchMembershipId,permissionId]` on the table `UserPermissionOverride` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `organizationId` to the `Branch` table without a default value. This is not possible if the table is not empty.
  - Added the required column `branchMembershipId` to the `UserPermissionOverride` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "RoleScope" AS ENUM ('SYSTEM', 'ORGANIZATION', 'BRANCH');

-- CreateEnum
CREATE TYPE "OrganizationStatus" AS ENUM ('ACTIVE', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "MembershipStatus" AS ENUM ('INVITED', 'ACTIVE', 'SUSPENDED', 'REMOVED');

-- CreateEnum
CREATE TYPE "MembershipScope" AS ENUM ('ORGANIZATION', 'BRANCH');

-- DropForeignKey
ALTER TABLE "RoleAssignment" DROP CONSTRAINT "RoleAssignment_branchId_fkey";

-- DropForeignKey
ALTER TABLE "RoleAssignment" DROP CONSTRAINT "RoleAssignment_userId_fkey";

-- DropForeignKey
ALTER TABLE "UserPermissionOverride" DROP CONSTRAINT "UserPermissionOverride_branchId_fkey";

-- DropForeignKey
ALTER TABLE "UserPermissionOverride" DROP CONSTRAINT "UserPermissionOverride_userId_fkey";

-- DropIndex
DROP INDEX "Role_code_key";

-- DropIndex
DROP INDEX "RoleAssignment_branchId_revokedAt_idx";

-- DropIndex
DROP INDEX "RoleAssignment_userId_revokedAt_idx";

-- DropIndex
DROP INDEX "UserPermissionOverride_branchId_permissionId_idx";

-- DropIndex
DROP INDEX "UserPermissionOverride_userId_permissionId_branchId_key";

-- AlterTable
ALTER TABLE "Branch" ADD COLUMN     "organizationId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "Role" DROP COLUMN "isSystem",
ADD COLUMN     "assignmentScope" "MembershipScope" NOT NULL DEFAULT 'BRANCH',
ADD COLUMN     "branchId" TEXT,
ADD COLUMN     "createdById" TEXT,
ADD COLUMN     "organizationId" TEXT,
ADD COLUMN     "scope" "RoleScope" NOT NULL DEFAULT 'SYSTEM';

-- AlterTable
ALTER TABLE "RoleAssignment" DROP COLUMN "branchId",
DROP COLUMN "userId",
ADD COLUMN     "branchMembershipId" TEXT,
ADD COLUMN     "organizationMembershipId" TEXT;

-- AlterTable
ALTER TABLE "UserPermissionOverride" DROP COLUMN "branchId",
DROP COLUMN "userId",
ADD COLUMN     "branchMembershipId" TEXT NOT NULL;

-- CreateTable
CREATE TABLE "Organization" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "status" "OrganizationStatus" NOT NULL DEFAULT 'ACTIVE',
    "ownerUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Organization_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrganizationMembership" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" "MembershipStatus" NOT NULL DEFAULT 'INVITED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrganizationMembership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BranchMembership" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "organizationMembershipId" TEXT NOT NULL,
    "status" "MembershipStatus" NOT NULL DEFAULT 'INVITED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BranchMembership_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Organization_slug_key" ON "Organization"("slug");

-- CreateIndex
CREATE INDEX "Organization_ownerUserId_status_idx" ON "Organization"("ownerUserId", "status");

-- CreateIndex
CREATE INDEX "OrganizationMembership_userId_status_idx" ON "OrganizationMembership"("userId", "status");

-- CreateIndex
CREATE INDEX "OrganizationMembership_organizationId_status_idx" ON "OrganizationMembership"("organizationId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "OrganizationMembership_id_organizationId_key" ON "OrganizationMembership"("id", "organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "OrganizationMembership_organizationId_userId_key" ON "OrganizationMembership"("organizationId", "userId");

-- CreateIndex
CREATE INDEX "BranchMembership_organizationMembershipId_status_idx" ON "BranchMembership"("organizationMembershipId", "status");

-- CreateIndex
CREATE INDEX "BranchMembership_branchId_status_idx" ON "BranchMembership"("branchId", "status");

-- CreateIndex
CREATE INDEX "BranchMembership_organizationId_status_idx" ON "BranchMembership"("organizationId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "BranchMembership_id_organizationId_key" ON "BranchMembership"("id", "organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "BranchMembership_branchId_organizationMembershipId_key" ON "BranchMembership"("branchId", "organizationMembershipId");

-- CreateIndex
CREATE INDEX "Branch_organizationId_status_idx" ON "Branch"("organizationId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Branch_id_organizationId_key" ON "Branch"("id", "organizationId");

-- CreateIndex
CREATE INDEX "Role_organizationId_scope_idx" ON "Role"("organizationId", "scope");

-- CreateIndex
CREATE INDEX "Role_branchId_scope_idx" ON "Role"("branchId", "scope");

-- CreateIndex
CREATE INDEX "Role_createdById_idx" ON "Role"("createdById");

-- CreateIndex
CREATE UNIQUE INDEX "Role_code_key" ON "Role"("code") WHERE ("scope" = 'SYSTEM');

-- CreateIndex
CREATE UNIQUE INDEX "Role_organizationId_code_key" ON "Role"("organizationId", "code") WHERE ("scope" = 'ORGANIZATION');

-- CreateIndex
CREATE UNIQUE INDEX "Role_branchId_code_key" ON "Role"("branchId", "code") WHERE ("scope" = 'BRANCH');

-- CreateIndex
CREATE INDEX "RoleAssignment_organizationMembershipId_revokedAt_idx" ON "RoleAssignment"("organizationMembershipId", "revokedAt");

-- CreateIndex
CREATE INDEX "RoleAssignment_branchMembershipId_revokedAt_idx" ON "RoleAssignment"("branchMembershipId", "revokedAt");

-- CreateIndex
CREATE INDEX "RoleAssignment_roleId_revokedAt_idx" ON "RoleAssignment"("roleId", "revokedAt");

-- CreateIndex
CREATE UNIQUE INDEX "RoleAssignment_organizationMembershipId_roleId_key" ON "RoleAssignment"("organizationMembershipId", "roleId") WHERE ("organizationMembershipId" IS NOT NULL AND "revokedAt" IS NULL);

-- CreateIndex
CREATE UNIQUE INDEX "RoleAssignment_branchMembershipId_roleId_key" ON "RoleAssignment"("branchMembershipId", "roleId") WHERE ("branchMembershipId" IS NOT NULL AND "revokedAt" IS NULL);

-- CreateIndex
CREATE INDEX "UserPermissionOverride_permissionId_idx" ON "UserPermissionOverride"("permissionId");

-- CreateIndex
CREATE INDEX "UserPermissionOverride_assignedById_idx" ON "UserPermissionOverride"("assignedById");

-- CreateIndex
CREATE UNIQUE INDEX "UserPermissionOverride_branchMembershipId_permissionId_key" ON "UserPermissionOverride"("branchMembershipId", "permissionId");

-- AddForeignKey
ALTER TABLE "Role" ADD CONSTRAINT "Role_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Role" ADD CONSTRAINT "Role_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Role" ADD CONSTRAINT "Role_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoleAssignment" ADD CONSTRAINT "RoleAssignment_organizationMembershipId_fkey" FOREIGN KEY ("organizationMembershipId") REFERENCES "OrganizationMembership"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoleAssignment" ADD CONSTRAINT "RoleAssignment_branchMembershipId_fkey" FOREIGN KEY ("branchMembershipId") REFERENCES "BranchMembership"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserPermissionOverride" ADD CONSTRAINT "UserPermissionOverride_branchMembershipId_fkey" FOREIGN KEY ("branchMembershipId") REFERENCES "BranchMembership"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Branch" ADD CONSTRAINT "Branch_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Organization" ADD CONSTRAINT "Organization_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrganizationMembership" ADD CONSTRAINT "OrganizationMembership_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrganizationMembership" ADD CONSTRAINT "OrganizationMembership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BranchMembership" ADD CONSTRAINT "BranchMembership_branchId_organizationId_fkey" FOREIGN KEY ("branchId", "organizationId") REFERENCES "Branch"("id", "organizationId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BranchMembership" ADD CONSTRAINT "BranchMembership_organizationMembershipId_organizationId_fkey" FOREIGN KEY ("organizationMembershipId", "organizationId") REFERENCES "OrganizationMembership"("id", "organizationId") ON DELETE CASCADE ON UPDATE CASCADE;

-- ============================================================
-- TARKHINEH_ACCESS_CONTROL_GUARDS_V1
-- Database-level multi-tenant access control invariants
-- ============================================================

-- 1. A role must have exactly one valid ownership scope.
ALTER TABLE "Role"
ADD CONSTRAINT "Role_scope_ownership_check"
CHECK (
    (
        "scope" = 'SYSTEM'
        AND "organizationId" IS NULL
        AND "branchId" IS NULL
    )
    OR
    (
        "scope" = 'ORGANIZATION'
        AND "organizationId" IS NOT NULL
        AND "branchId" IS NULL
    )
    OR
    (
        "scope" = 'BRANCH'
        AND "organizationId" IS NULL
        AND "branchId" IS NOT NULL
    )
);

-- Branch-owned roles can only be assigned at branch scope.
ALTER TABLE "Role"
ADD CONSTRAINT "Role_branch_assignment_scope_check"
CHECK (
    "scope" <> 'BRANCH'
    OR "assignmentScope" = 'BRANCH'
);

-- 2. Every role assignment must target exactly one membership.
ALTER TABLE "RoleAssignment"
ADD CONSTRAINT "RoleAssignment_exactly_one_membership_check"
CHECK (
    (
        "organizationMembershipId" IS NOT NULL
        AND "branchMembershipId" IS NULL
    )
    OR
    (
        "organizationMembershipId" IS NULL
        AND "branchMembershipId" IS NOT NULL
    )
);

-- 3. Validate role scope and tenant ownership on assignment.
CREATE OR REPLACE FUNCTION public.enforce_role_assignment_scope()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $function$
DECLARE
    v_role_scope "RoleScope";
    v_assignment_scope "MembershipScope";

    v_role_organization_id TEXT;
    v_role_branch_id TEXT;

    v_membership_organization_id TEXT;
    v_membership_branch_id TEXT;
BEGIN
    SELECT
        "scope",
        "assignmentScope",
        "organizationId",
        "branchId"
    INTO
        v_role_scope,
        v_assignment_scope,
        v_role_organization_id,
        v_role_branch_id
    FROM "Role"
    WHERE "id" = NEW."roleId"
    FOR SHARE;

    -- The foreign key will handle a missing role.
    IF NOT FOUND THEN
        RETURN NEW;
    END IF;

    IF NEW."organizationMembershipId" IS NOT NULL THEN

        IF v_assignment_scope <> 'ORGANIZATION' THEN
            RAISE EXCEPTION
                'This role cannot be assigned to an organization membership'
                USING ERRCODE = '23514';
        END IF;

        SELECT "organizationId"
        INTO v_membership_organization_id
        FROM "OrganizationMembership"
        WHERE "id" = NEW."organizationMembershipId"
        FOR SHARE;

        IF NOT FOUND THEN
            RETURN NEW;
        END IF;

        IF v_role_scope = 'BRANCH' THEN
            RAISE EXCEPTION
                'Branch roles cannot be assigned to organization memberships'
                USING ERRCODE = '23514';
        END IF;

        IF v_role_scope = 'ORGANIZATION'
           AND v_membership_organization_id IS DISTINCT FROM v_role_organization_id THEN
            RAISE EXCEPTION
                'Organization role cannot be assigned outside its organization'
                USING ERRCODE = '23514';
        END IF;

    ELSIF NEW."branchMembershipId" IS NOT NULL THEN

        IF v_assignment_scope <> 'BRANCH' THEN
            RAISE EXCEPTION
                'This role cannot be assigned to a branch membership'
                USING ERRCODE = '23514';
        END IF;

        SELECT
            "organizationId",
            "branchId"
        INTO
            v_membership_organization_id,
            v_membership_branch_id
        FROM "BranchMembership"
        WHERE "id" = NEW."branchMembershipId"
        FOR SHARE;

        IF NOT FOUND THEN
            RETURN NEW;
        END IF;

        IF v_role_scope = 'ORGANIZATION'
           AND v_membership_organization_id IS DISTINCT FROM v_role_organization_id THEN
            RAISE EXCEPTION
                'Organization role cannot be assigned outside its organization'
                USING ERRCODE = '23514';
        END IF;

        IF v_role_scope = 'BRANCH'
           AND v_membership_branch_id IS DISTINCT FROM v_role_branch_id THEN
            RAISE EXCEPTION
                'Branch role cannot be assigned outside its branch'
                USING ERRCODE = '23514';
        END IF;

    END IF;

    RETURN NEW;
END;
$function$;

CREATE TRIGGER "RoleAssignment_scope_guard"
BEFORE INSERT OR UPDATE OF
    "roleId",
    "organizationMembershipId",
    "branchMembershipId"
ON "RoleAssignment"
FOR EACH ROW
EXECUTE FUNCTION public.enforce_role_assignment_scope();

-- 4. A role's ownership and assignment scope are immutable.
-- Create a new role instead of moving an existing role between tenants.
CREATE OR REPLACE FUNCTION public.prevent_role_ownership_change()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $function$
BEGIN
    IF ROW(
        NEW."scope",
        NEW."assignmentScope",
        NEW."organizationId",
        NEW."branchId"
    ) IS DISTINCT FROM ROW(
        OLD."scope",
        OLD."assignmentScope",
        OLD."organizationId",
        OLD."branchId"
    ) THEN
        RAISE EXCEPTION
            'Role ownership and assignment scope are immutable; create a new role instead'
            USING ERRCODE = '23514';
    END IF;

    RETURN NEW;
END;
$function$;

CREATE TRIGGER "Role_ownership_immutability_guard"
BEFORE UPDATE OF
    "scope",
    "assignmentScope",
    "organizationId",
    "branchId"
ON "Role"
FOR EACH ROW
EXECUTE FUNCTION public.prevent_role_ownership_change();

-- 5. A branch cannot be moved to another organization.
CREATE OR REPLACE FUNCTION public.prevent_branch_organization_change()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $function$
BEGIN
    IF NEW."organizationId" IS DISTINCT FROM OLD."organizationId" THEN
        RAISE EXCEPTION
            'A branch cannot be moved to another organization'
            USING ERRCODE = '23514';
    END IF;

    RETURN NEW;
END;
$function$;

CREATE TRIGGER "Branch_organization_immutability_guard"
BEFORE UPDATE OF "organizationId"
ON "Branch"
FOR EACH ROW
EXECUTE FUNCTION public.prevent_branch_organization_change();

-- 6. An organization membership cannot be transferred to another
-- organization or another user.
CREATE OR REPLACE FUNCTION public.prevent_organization_membership_identity_change()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $function$
BEGIN
    IF ROW(NEW."organizationId", NEW."userId")
       IS DISTINCT FROM
       ROW(OLD."organizationId", OLD."userId") THEN
        RAISE EXCEPTION
            'Organization membership identity is immutable'
            USING ERRCODE = '23514';
    END IF;

    RETURN NEW;
END;
$function$;

CREATE TRIGGER "OrganizationMembership_identity_immutability_guard"
BEFORE UPDATE OF "organizationId", "userId"
ON "OrganizationMembership"
FOR EACH ROW
EXECUTE FUNCTION public.prevent_organization_membership_identity_change();

-- 7. A branch membership cannot be transferred to another branch
-- or another organization membership.
CREATE OR REPLACE FUNCTION public.prevent_branch_membership_identity_change()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $function$
BEGIN
    IF ROW(
        NEW."organizationId",
        NEW."branchId",
        NEW."organizationMembershipId"
    ) IS DISTINCT FROM ROW(
        OLD."organizationId",
        OLD."branchId",
        OLD."organizationMembershipId"
    ) THEN
        RAISE EXCEPTION
            'Branch membership identity is immutable'
            USING ERRCODE = '23514';
    END IF;

    RETURN NEW;
END;
$function$;

CREATE TRIGGER "BranchMembership_identity_immutability_guard"
BEFORE UPDATE OF
    "organizationId",
    "branchId",
    "organizationMembershipId"
ON "BranchMembership"
FOR EACH ROW
EXECUTE FUNCTION public.prevent_branch_membership_identity_change();

-- ============================================================
-- END TARKHINEH_ACCESS_CONTROL_GUARDS_V1
-- ============================================================
