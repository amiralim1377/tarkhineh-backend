BEGIN;

CREATE TYPE "AccessControlAuditEventType" AS ENUM (
    'ROLE_CREATED',
    'ROLE_UPDATED',
    'ROLE_ARCHIVED',
    'ROLE_PERMISSION_ADDED',
    'ROLE_PERMISSION_REMOVED',
    'ROLE_ASSIGNED',
    'ROLE_REVOKED',
    'PERMISSION_OVERRIDE_CREATED',
    'PERMISSION_OVERRIDE_UPDATED',
    'PERMISSION_OVERRIDE_REMOVED',
    'AUTHORIZATION_DENIED'
);

CREATE TYPE "AccessControlAuditResourceType" AS ENUM (
    'ROLE',
    'ROLE_ASSIGNMENT',
    'PERMISSION_OVERRIDE',
    'PERMISSION',
    'AUTHORIZATION'
);

CREATE TYPE "AccessControlAuditSubjectType" AS ENUM (
    'USER',
    'ORGANIZATION_MEMBERSHIP',
    'BRANCH_MEMBERSHIP'
);

CREATE TABLE "AccessControlAuditEvent" (
    "id" TEXT NOT NULL,
    "eventType" "AccessControlAuditEventType" NOT NULL,
    "organizationId" TEXT NOT NULL,
    "branchId" TEXT,
    "actorUserId" TEXT NOT NULL,
    "subjectType" "AccessControlAuditSubjectType",
    "subjectId" TEXT,
    "resourceType" "AccessControlAuditResourceType" NOT NULL,
    "resourceId" TEXT,
    "correlationId" VARCHAR(128),
    "payloadVersion" INTEGER NOT NULL DEFAULT 1,
    "beforeState" JSONB,
    "afterState" JSONB,
    "occurredAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AccessControlAuditEvent_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "AccessControlAuditEvent_subject_pair_check"
        CHECK (
            ("subjectType" IS NULL AND "subjectId" IS NULL)
            OR
            ("subjectType" IS NOT NULL AND "subjectId" IS NOT NULL)
        ),
    CONSTRAINT "AccessControlAuditEvent_resource_id_check"
        CHECK (
            "eventType" = 'AUTHORIZATION_DENIED'
            OR "resourceId" IS NOT NULL
        ),
    CONSTRAINT "AccessControlAuditEvent_payload_version_check"
        CHECK ("payloadVersion" >= 1),
    CONSTRAINT "AccessControlAuditEvent_correlation_id_check"
        CHECK (
            "correlationId" IS NULL
            OR length(btrim("correlationId")) > 0
        ),
    CONSTRAINT "AccessControlAuditEvent_tenant_id_check"
        CHECK (length(btrim("organizationId")) > 0),
    CONSTRAINT "AccessControlAuditEvent_actor_id_check"
        CHECK (length(btrim("actorUserId")) > 0),
    CONSTRAINT "AccessControlAuditEvent_subject_id_check"
        CHECK ("subjectId" IS NULL OR length(btrim("subjectId")) > 0),
    CONSTRAINT "AccessControlAuditEvent_branch_id_check"
        CHECK ("branchId" IS NULL OR length(btrim("branchId")) > 0),
    CONSTRAINT "AccessControlAuditEvent_resource_id_nonempty_check"
        CHECK ("resourceId" IS NULL OR length(btrim("resourceId")) > 0)
);

CREATE INDEX "AccessControlAuditEvent_org_time_idx"
    ON "AccessControlAuditEvent"("organizationId", "occurredAt" DESC);

CREATE INDEX "AccessControlAuditEvent_org_branch_time_idx"
    ON "AccessControlAuditEvent"("organizationId", "branchId", "occurredAt" DESC);

CREATE OR REPLACE FUNCTION public.prevent_access_control_audit_event_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $function$
BEGIN
    RAISE EXCEPTION
        'AccessControlAuditEvent is append-only; operation % is not permitted',
        TG_OP
        USING ERRCODE = '55000';

    RETURN NULL;
END;
$function$;

CREATE TRIGGER "AccessControlAuditEvent_reject_update_delete"
BEFORE UPDATE OR DELETE
ON "AccessControlAuditEvent"
FOR EACH ROW
EXECUTE FUNCTION public.prevent_access_control_audit_event_mutation();

CREATE TRIGGER "AccessControlAuditEvent_reject_truncate"
BEFORE TRUNCATE
ON "AccessControlAuditEvent"
FOR EACH STATEMENT
EXECUTE FUNCTION public.prevent_access_control_audit_event_mutation();

COMMENT ON TABLE "AccessControlAuditEvent" IS
    'Append-only historical security audit events for the Access Control bounded context.';

COMMENT ON COLUMN "AccessControlAuditEvent"."organizationId" IS
    'Required tenant scope identifier; intentionally has no foreign key.';

COMMENT ON COLUMN "AccessControlAuditEvent"."payloadVersion" IS
    'Version of the allow-listed beforeState/afterState payload contract.';

COMMIT;
