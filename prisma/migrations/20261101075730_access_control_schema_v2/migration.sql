BEGIN;

DROP TRIGGER IF EXISTS "RoleAssignment_scope_guard" ON "RoleAssignment";
DROP FUNCTION IF EXISTS public.enforce_role_assignment_scope();

DROP TRIGGER IF EXISTS "Role_ownership_immutability_guard" ON "Role";
DROP FUNCTION IF EXISTS public.prevent_role_ownership_change();

DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM "Role"
        WHERE "scope" = 'BRANCH'
    ) THEN
        RAISE EXCEPTION 'Migration blocked: branch-owned roles exist and require an explicit conversion plan.';
    END IF;
END
$$;

ALTER TABLE "Role" DROP CONSTRAINT IF EXISTS "Role_scope_ownership_check";
ALTER TABLE "Role" DROP CONSTRAINT IF EXISTS "Role_branch_assignment_scope_check";

CREATE TYPE "RoleDefinitionScope" AS ENUM ('SYSTEM', 'ORGANIZATION');
CREATE TYPE "RoleAssignmentScope" AS ENUM ('ORGANIZATION', 'BRANCH');
CREATE TYPE "RoleStatus" AS ENUM ('ACTIVE', 'ARCHIVED');

ALTER TABLE "Role" DROP CONSTRAINT "Role_branchId_fkey";
ALTER TABLE "RolePermission" DROP CONSTRAINT "RolePermission_permissionId_fkey";
ALTER TABLE "UserPermissionOverride" DROP CONSTRAINT "UserPermissionOverride_branchMembershipId_fkey";
ALTER TABLE "UserPermissionOverride" DROP CONSTRAINT "UserPermissionOverride_permissionId_fkey";

DROP INDEX "Role_branchId_code_key";
DROP INDEX "Role_branchId_scope_idx";
DROP INDEX "Role_code_key";
DROP INDEX "Role_organizationId_code_key";
DROP INDEX "Role_organizationId_scope_idx";
DROP INDEX "UserPermissionOverride_branchMembershipId_permissionId_key";

ALTER TABLE "Permission"
DROP COLUMN "description",
DROP COLUMN "name";

ALTER TABLE "Role"
ADD COLUMN "definitionScope" "RoleDefinitionScope",
ADD COLUMN "isAssignable" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "status" "RoleStatus" NOT NULL DEFAULT 'ACTIVE';

UPDATE "Role"
SET "definitionScope" = "scope"::text::"RoleDefinitionScope";

ALTER TABLE "Role"
ALTER COLUMN "definitionScope" SET NOT NULL;

ALTER TABLE "Role"
ALTER COLUMN "assignmentScope" DROP DEFAULT;

ALTER TABLE "Role"
ALTER COLUMN "assignmentScope" TYPE "RoleAssignmentScope"
USING ("assignmentScope"::text::"RoleAssignmentScope");

ALTER TABLE "Role"
DROP COLUMN "branchId",
DROP COLUMN "scope";

UPDATE "Role"
SET "isAssignable" = false
WHERE "definitionScope" = 'SYSTEM'
AND "code" = 'ORGANIZATION_OWNER';

ALTER TABLE "Role"
ADD CONSTRAINT "Role_definition_scope_ownership_check"
CHECK (
    (
        "definitionScope" = 'SYSTEM'
        AND "organizationId" IS NULL
    )
    OR
    (
        "definitionScope" = 'ORGANIZATION'
        AND "organizationId" IS NOT NULL
    )
);

ALTER TABLE "Role"
ADD CONSTRAINT "Role_reserved_owner_non_assignable_check"
CHECK (
    "definitionScope" <> 'SYSTEM'
    OR "code" <> 'ORGANIZATION_OWNER'
    OR "isAssignable" = false
);

ALTER TABLE "UserPermissionOverride"
ADD COLUMN "branchId" TEXT,
ADD COLUMN "organizationId" TEXT,
ADD COLUMN "organizationMembershipId" TEXT;

UPDATE "UserPermissionOverride" AS upo
SET
    "branchId" = bm."branchId",
    "organizationId" = bm."organizationId",
    "organizationMembershipId" = bm."organizationMembershipId"
FROM "BranchMembership" AS bm
WHERE upo."branchMembershipId" = bm."id";

DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM "UserPermissionOverride"
        WHERE "branchId" IS NULL
           OR "organizationId" IS NULL
           OR "organizationMembershipId" IS NULL
    ) THEN
        RAISE EXCEPTION 'Migration blocked: some permission overrides could not be migrated from BranchMembership.';
    END IF;
END
$$;

ALTER TABLE "UserPermissionOverride"
ALTER COLUMN "branchId" SET NOT NULL,
ALTER COLUMN "organizationId" SET NOT NULL,
ALTER COLUMN "organizationMembershipId" SET NOT NULL;

ALTER TABLE "UserPermissionOverride"
DROP COLUMN "branchMembershipId";

CREATE INDEX "Role_organizationId_status_idx"
ON "Role"("organizationId", "status");

CREATE UNIQUE INDEX "Role_code_key"
ON "Role"("code")
WHERE ("definitionScope" = 'SYSTEM');

CREATE UNIQUE INDEX "Role_organizationId_code_key"
ON "Role"("organizationId", "code")
WHERE ("definitionScope" = 'ORGANIZATION');

CREATE INDEX "UserPermissionOverride_organizationMembershipId_organizatio_idx"
ON "UserPermissionOverride"("organizationMembershipId", "organizationId");

CREATE INDEX "UserPermissionOverride_branchId_organizationId_idx"
ON "UserPermissionOverride"("branchId", "organizationId");

CREATE UNIQUE INDEX "UserPermissionOverride_organizationMembershipId_branchId_pe_key"
ON "UserPermissionOverride"("organizationMembershipId", "branchId", "permissionId");

ALTER TABLE "RolePermission"
ADD CONSTRAINT "RolePermission_permissionId_fkey"
FOREIGN KEY ("permissionId") REFERENCES "Permission"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "UserPermissionOverride"
ADD CONSTRAINT "UserPermissionOverride_organizationMembershipId_organizati_fkey"
FOREIGN KEY ("organizationMembershipId", "organizationId")
REFERENCES "OrganizationMembership"("id", "organizationId")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "UserPermissionOverride"
ADD CONSTRAINT "UserPermissionOverride_branchId_organizationId_fkey"
FOREIGN KEY ("branchId", "organizationId")
REFERENCES "Branch"("id", "organizationId")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "UserPermissionOverride"
ADD CONSTRAINT "UserPermissionOverride_permissionId_fkey"
FOREIGN KEY ("permissionId") REFERENCES "Permission"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE OR REPLACE FUNCTION public.enforce_role_assignment_scope()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $function$
DECLARE
    v_role_definition_scope "RoleDefinitionScope";
    v_assignment_scope "RoleAssignmentScope";
    v_role_organization_id TEXT;
    v_membership_organization_id TEXT;
BEGIN
    SELECT
        "definitionScope",
        "assignmentScope",
        "organizationId"
    INTO
        v_role_definition_scope,
        v_assignment_scope,
        v_role_organization_id
    FROM "Role"
    WHERE "id" = NEW."roleId"
    FOR SHARE;

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

        IF v_role_definition_scope = 'ORGANIZATION'
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

        SELECT "organizationId"
        INTO v_membership_organization_id
        FROM "BranchMembership"
        WHERE "id" = NEW."branchMembershipId"
        FOR SHARE;

        IF NOT FOUND THEN
            RETURN NEW;
        END IF;

        IF v_role_definition_scope = 'ORGANIZATION'
           AND v_membership_organization_id IS DISTINCT FROM v_role_organization_id THEN
            RAISE EXCEPTION
                'Organization role cannot be assigned outside its organization'
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

CREATE OR REPLACE FUNCTION public.prevent_role_ownership_change()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $function$
BEGIN
    IF ROW(
        NEW."definitionScope",
        NEW."assignmentScope",
        NEW."organizationId"
    ) IS DISTINCT FROM ROW(
        OLD."definitionScope",
        OLD."assignmentScope",
        OLD."organizationId"
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
    "definitionScope",
    "assignmentScope",
    "organizationId"
ON "Role"
FOR EACH ROW
EXECUTE FUNCTION public.prevent_role_ownership_change();

DROP TYPE "MembershipScope";
DROP TYPE "RoleScope";

COMMIT;
