BEGIN;

-- Remove triggers that depend on the old assignment scope column/function.
DROP TRIGGER IF EXISTS "RoleAssignment_scope_guard" ON "RoleAssignment";
DROP FUNCTION IF EXISTS public.enforce_role_assignment_scope();

DROP TRIGGER IF EXISTS "Role_ownership_immutability_guard" ON "Role";

-- Rename the enum type and the Role column.
ALTER TYPE "RoleAssignmentScope" RENAME TO "RoleAssignmentTarget";

ALTER TABLE "Role"
RENAME COLUMN "assignmentScope" TO "assignmentTarget";

-- Enforce that a Role can only be assigned to its configured target.
CREATE OR REPLACE FUNCTION public.enforce_role_assignment_target()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $function$
DECLARE
    v_role_definition_scope "RoleDefinitionScope";
    v_assignment_target "RoleAssignmentTarget";
    v_role_organization_id TEXT;
    v_membership_organization_id TEXT;
BEGIN
    SELECT
        "definitionScope",
        "assignmentTarget",
        "organizationId"
    INTO
        v_role_definition_scope,
        v_assignment_target,
        v_role_organization_id
    FROM "Role"
    WHERE "id" = NEW."roleId"
    FOR SHARE;

    IF NOT FOUND THEN
        RETURN NEW;
    END IF;

    IF NEW."organizationMembershipId" IS NOT NULL THEN
        IF v_assignment_target <> 'ORGANIZATION' THEN
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
        IF v_assignment_target <> 'BRANCH' THEN
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

CREATE TRIGGER "RoleAssignment_target_guard"
BEFORE INSERT OR UPDATE OF
    "roleId",
    "organizationMembershipId",
    "branchMembershipId"
ON "RoleAssignment"
FOR EACH ROW
EXECUTE FUNCTION public.enforce_role_assignment_target();

-- Keep Role ownership and assignment target immutable.
CREATE OR REPLACE FUNCTION public.prevent_role_ownership_change()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $function$
BEGIN
    IF ROW(
        NEW."definitionScope",
        NEW."assignmentTarget",
        NEW."organizationId"
    ) IS DISTINCT FROM ROW(
        OLD."definitionScope",
        OLD."assignmentTarget",
        OLD."organizationId"
    ) THEN
        RAISE EXCEPTION
            'Role ownership and assignment target are immutable; create a new role instead'
            USING ERRCODE = '23514';
    END IF;

    RETURN NEW;
END;
$function$;

CREATE TRIGGER "Role_ownership_immutability_guard"
BEFORE UPDATE OF
    "definitionScope",
    "assignmentTarget",
    "organizationId"
ON "Role"
FOR EACH ROW
EXECUTE FUNCTION public.prevent_role_ownership_change();

COMMIT;
