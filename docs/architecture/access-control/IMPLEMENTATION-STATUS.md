# Tarkhineh Backend — Access Control Implementation Status

| Attribute              | Value                                                        |
| ---------------------- | ------------------------------------------------------------ |
| Project                | `tarkhineh-backend`                                          |
| Document version       | 2.8                                                          |
| Last updated           | 2026-11-02                                                   |
| Architecture reference | `MASTER-ARCHITECTURE.md` v1.15                               |
| Decision log           | `ARCHITECTURAL-DECISIONS.md` v1.13                           |
| Current phase          | PHASE 7 — Audit Logging                                      |
| Current phase status   | **IN PROGRESS — PHASE 7.1 POLICY APPROVED; PRISMA SCHEMA VALIDATION PASSED LOCALLY; ISOLATED MIGRATION APPLICATION PENDING** |

> This document records repository state and command results actually observed during the project. “Implementation complete” does not mean a phase is formally closed. Formal closure requires project-owner review and approval. Unverified work and known limitations are identified explicitly.

---

## 1. Executive checkpoint

### Phase summary

| Phase | Name                                            | Status                                              |
| ----: | ----------------------------------------------- | --------------------------------------------------- |
|     0 | Repository Audit and Baseline                   | COMPLETED                                           |
|     1 | Requirements and Architecture Design            | COMPLETED — approved by project owner               |
|     2 | Database Schema and Migration Design            | COMPLETED — approved by project owner on 2026-11-01 |
|     3 | Permission Registry and Seed                    | COMPLETED — APPROVED BY PROJECT OWNER (2026-11-01)  |
|     4 | Domain Model                                    | COMPLETED — APPROVED BY PROJECT OWNER (2026-11-01)  |
|     5 | Application Layer and Use Cases                 | COMPLETED — APPROVED BY PROJECT OWNER (2026-11-01) |
|     6 | Infrastructure and Authorization Persistence    | COMPLETED — APPROVED BY PROJECT OWNER (2026-11-02; deferred verification accepted) |
|     7 | Audit Logging                                   | IN PROGRESS — 7.1 policy approved; schema validation passed locally; isolated Migration application pending |
|     8 | Cross-Context Integration                       | NOT STARTED                                         |
|     9 | HTTP Layer                                      | NOT STARTED                                         |
|    10 | Security, Performance, and Production Readiness | NOT STARTED                                         |

### Latest implementation checkpoint

PHASE 5 — Application Layer and Use Cases was formally approved by the project owner on 2026-11-01 and is closed. PHASE 6 — Infrastructure and Authorization Persistence was implemented, its expanded PostgreSQL acceptance coverage was committed in `7e0b267`, and a GitHub source review on 2026-11-01 found no blocking defect in the inspected transaction boundary, tenant-scoped persistence paths, database guards, authorization snapshot assembly, or NestJS provider wiring. The recorded focused checkpoint contains 322 passing Access Control Unit tests and 16 passing Access Control Integration tests (338 total), with successful TypeScript, Access Control lint, Prettier, diff, and production build checks. The project owner formally approved PHASE 6 on 2026-11-02, accepting the explicitly documented deferred verification items in section 8.10. PHASE 6 is closed; this approval does not claim that the full application boot, full-project Integration suite, or production-scale benchmark has been completed.

PHASE 7 — Audit Logging started on 2026-11-02. The dedicated Prisma Audit model and forward Migration draft exist, but no Domain/Application Audit contract, transaction-bound writer, Infrastructure adapter, or reader implementation exists yet. The seven existing mutation Handlers use the transaction-owning Access Control Unit of Work; its four current adapters are bound to the same Prisma transaction client. Successful-mutation Audit writes must be integrated into this same transaction, while selected authorization-denial events require separate handling because the business transaction is rolled back on denial.

The project owner approved ADR-022 on 2026-11-02: Audit records are retained as ordinary database records indefinitely under the current policy, with no TTL, automatic deletion, scheduled purge, or cleanup. The historical reference strategy was selected and recorded in ADR-023: Actor, Organization, Branch, Membership, and Resource IDs are stored as scalar historical identifiers with no foreign keys; `organizationId` is required as the tenant scope key, and tenant ownership is enforced by Application validation and tenant-scoped reads. Selected denial events are stored only when the actor is authenticated and the Organization context is validated. The first Prisma/Migration draft is committed: the root Prisma 7 configuration, `prisma/models/access-control-audit.prisma`, and forward-only migration `20261102110000_access_control_audit_events`. The model uses scalar historical references only, the approved event vocabulary, allow-listed JSON state projections, a versioned payload contract, tenant/time indexes, database checks, and UPDATE/DELETE/TRUNCATE rejection triggers. ADR-024 records these technical choices. The project owner then approved all four PHASE 7.1 policy decisions on 2026-11-02. ADR-025 records the approved Organization Owner and Branch Manager reader scopes, selective best-effort `AUTHORIZATION_DENIED` policy, single `ROLE_CREATED` event for initial Permission links, and optional `correlationId` propagation through Application Command metadata from the trusted HTTP `request.id`. The permission codes and runtime policies are not implemented yet; they remain implementation work in the later Phase 7 substeps. A local `npx prisma validate` run with Prisma 7.10.1 reported that the schemas are valid. Migration-diff review, isolated PostgreSQL Migration application, writer/reader implementation, Integration tests, and runtime database-role privilege hardening remain unverified. No Audit Migration application or Audit data effect is claimed.

### PHASE 3 Registry implementation result

PHASE 3 introduced a source-controlled Permission Registry, explicit permission sets for the two System Roles, a transactional synchronizer, and focused Unit and PostgreSQL Integration tests.

The Registry contains **23 permissions**: all 18 previous codes are preserved and five approved codes have been added. The Seed manages only `ORGANIZATION_OWNER` and `BRANCH_MANAGER`; it does not manage Organization-owned custom roles, role assignments, or permission overrides.

PHASE 3 was formally approved by the project owner on 2026-11-01. The production CLI Seed was not run against `tarkhineh_db` or `tarkhineh_test` as part of that phase.

---

## 2. PHASE 0 — Repository Audit and Baseline

**Status: COMPLETED**
**Completion date: 2026-11-01**

### 2.1 Repository inventory

At the time of the initial audit, the Access Control module contained:

```text
src/contexts/access-control/
├── access-control.module.ts
└── domain/
    └── permissions/
        └── permission-catalog.ts
```

Observed state:

- `AccessControlModule` was an empty NestJS module and was imported by `src/app.module.ts`.
- The Permission Catalog contained 18 permission codes.
- No Access Control-specific Unit tests were present at that audit checkpoint.
- Access Control Domain entities, Application handlers/use cases, Infrastructure repositories, an authorization evaluator, and HTTP endpoints had not yet been implemented.
- The catalog was consumed by `prisma/seed.ts`.

The dependency search at that time did not identify additional direct TypeScript consumers of the old scope or localized Permission metadata beyond the files inspected. This was a targeted search, not proof that no future consumer could exist. Repeat targeted searches before removing or renaming shared contracts.

### 2.2 Prisma models inspected

The audit inspected:

- `prisma/models/access-control.prisma`
- `prisma/models/organization.prisma`
- `prisma/models/identity.prisma`

Access Control models inspected:

- `Role`
- `Permission`
- `RolePermission`
- `RoleAssignment`
- `UserPermissionOverride`

Related Organization and Identity models/relations inspected:

- `Organization`
- `OrganizationMembership`
- `BranchMembership`
- User relations for created Roles, RoleAssignments, and PermissionOverrides.

The initial schema was an intermediate design. The approved target and implemented PHASE 2 schema are documented in `MASTER-ARCHITECTURE.md` and the relevant ADRs.

### 2.3 Initial schema risks identified

The audit identified the following items for PHASE 2 design review:

1. Role ownership allowed `SYSTEM`, `ORGANIZATION`, and `BRANCH`; the v1 target required only `SYSTEM` and `ORGANIZATION` ownership.
2. Role assignment scope reused Organization Management's `MembershipScope`; Access Control needed its own `RoleAssignmentScope`.
3. Role contained branch ownership fields; branch-owned Role definitions were not required for v1.
4. `UserPermissionOverride` was tied to `BranchMembership`; the target needed to support Organization members without BranchMembership by associating an override with OrganizationMembership, Branch, and Permission.
5. Permission metadata ownership between source code and database needed to be clarified.
6. The old Owner seed used a dynamic all-catalog-permissions grant; the target required explicit, reviewed System Role permission sets.
7. Existing RoleAssignment and Role ownership guards needed review against the approved target model.

### 2.4 Existing guards and indexes inspected

The audit inspected `prisma/migrations/20261031063647_add_multi_tenant_access_control/migration.sql`, including:

- Role scope/ownership checks.
- The exactly-one-membership target check for RoleAssignment.
- `enforce_role_assignment_scope()` and `RoleAssignment_scope_guard`.
- `prevent_role_ownership_change()` and `Role_ownership_immutability_guard`.
- `prevent_branch_organization_change()` and `Branch_organization_immutability_guard`.
- Partial unique indexes for active assignments by OrganizationMembership + Role and BranchMembership + Role.
- Composite foreign keys ensuring BranchMembership's Branch and OrganizationMembership belong to the same Organization.

These protections were design inputs for PHASE 2. Their final target implementation and remaining behavior-test work are recorded below and in the architecture documents.

### 2.5 Initial Seed findings

The initial `prisma/seed.ts` was inspected. At that checkpoint it:

- Read Permission definitions from the source catalog.
- Upserted Permission rows by code.
- Created or updated `ORGANIZATION_OWNER` and `BRANCH_MANAGER`.
- Derived the Owner's permission set from the full catalog, which could silently expand Owner privileges when a new permission was added.
- Used an explicit permission list for Branch Manager.
- Replaced RolePermission links for the seeded roles.

The dynamic Owner grant and the safety boundaries around custom roles were explicitly assigned to PHASE 3.

### 2.6 Migration history and database status at audit

The repository contained 16 migration directories at the time of the initial audit.

| Database         | Observed status at audit                                                                             |
| ---------------- | ---------------------------------------------------------------------------------------------------- |
| `tarkhineh_db`   | 16 migrations found; schema up to date                                                               |
| `tarkhineh_test` | Initially four pending migrations; after `migrate deploy`, 16 migrations found and schema up to date |

The following four migrations were applied to `tarkhineh_test` during that audit activity:

- `20261024081212_remove_legacy_email_outbox`
- `20261031063647_add_multi_tenant_access_control`
- `20261031135312_add_branch_images_and_location`
- `20261031135938_expand_branch_profile_and_working_hours`

The subsequent `npx prisma migrate status` reported that `tarkhineh_test` was up to date. The main development database was not changed by that specific test-database operation.

The project owner stated that the project was in early development and that the databases contained no important data. This does not authorize an automatic reset. Preserve migration history unless a deliberate reset strategy is explicitly approved.

### 2.7 Test configuration and isolation review

The package scripts inspected at baseline included:

```json
{
  "build": "nest build",
  "lint": "oxlint --type-aware src/ test/",
  "test": "vitest run",
  "test:watch": "vitest",
  "test:cov": "vitest run --coverage",
  "test:e2e": "vitest run --config ./vitest.config.e2e.ts",
  "test:integration": "vitest run --config ./vitest.config.integration.ts"
}
```

The initial Unit, Integration, and E2E test discovery patterns were inspected. Eight Prisma-backed Integration test files were identified using `tarkhineh_test` at that time. Representative database tests used isolated identifiers rather than broad table truncation.

Redis throttler Integration tests were opt-in through `RATE_LIMIT_REDIS_INTEGRATION=true`, used a dedicated `tarkhineh:rate-limit:integration:` prefix and UUID namespaces, and did not use `FLUSHDB` or `FLUSHALL`. They were skipped during the baseline run because the opt-in variable was not enabled.

The audit sampled representative test setup and cleanup paths; it did not perform a line-by-line review of every Integration test. The Health Integration test used a mocked PrismaService and readiness dependency rather than connecting to PostgreSQL or Redis.

### 2.8 Verified baseline command results

These results were supplied from actual terminal executions during PHASE 0:

| Command                                                      | Observed result                                                               |
| ------------------------------------------------------------ | ----------------------------------------------------------------------------- |
| `npm test`                                                   | 60 files passed; 691 tests passed; 0 failed; 4.68s                            |
| `npm run build`                                              | Completed without reported errors                                             |
| `npm run lint`                                               | 0 errors; 102 warnings; 247 files and 111 rules                               |
| `npm run test:integration`                                   | 10 files passed; 3 files skipped; 79 tests passed; 6 skipped; 0 failed; 8.02s |
| `npx prisma migrate status` on `tarkhineh_db`                | 16 migrations found; schema up to date                                        |
| `npx prisma migrate status` on `tarkhineh_test` after deploy | 16 migrations found; schema up to date                                        |

The 102 baseline lint warnings included `typescript(unbound-method)` warnings in existing test files. They were recorded as baseline debt, not treated as errors.

The following Integration tests were skipped at baseline:

- `test/integration/rate-limiting/app-module-guard-order.integration.spec.ts`: 1 test.
- `test/integration/rate-limiting/redis-throttler.storage.integration.spec.ts`: 4 tests.
- `test/integration/rate-limiting/rate-limit-guard-order.integration.spec.ts`: 1 test.

E2E tests were not run during PHASE 0. A separate `npx tsc --noEmit` was also not run at that baseline checkpoint; the successful Build must not be represented as a separate no-emit TypeScript check.

### 2.9 PHASE 0 acceptance

PHASE 0 was closed after repository, schema, migration, Seed, and representative test-isolation reviews, plus observed Unit, Integration, Build, Lint, and migration-status baselines. The limitations above remain part of the historical record.

---

## 3. PHASE 1 — Requirements and Architecture Design

**Status: COMPLETED — APPROVED BY PROJECT OWNER**

The project owner approved the architecture and product rules recorded in `MASTER-ARCHITECTURE.md`.

Key approved rules:

- A User may belong to multiple Organizations.
- An Organization-assigned role may grant Branch-target permissions across active Branches in the same Organization without requiring BranchMembership for each Branch.
- A Branch-assigned role applies through the corresponding active BranchMembership.
- BranchMembership status controls assignments attached to that BranchMembership; it does not by itself revoke permissions inherited from an active Organization role.
- An explicit DENY override takes precedence over ALLOW sources.
- Organization-defined custom roles are supported; customers cannot invent Permission codes.
- Delegation is constrained by the actor's delegable effective permissions.
- Sensitive access-control mutations require audit records.
- No long-lived authorization cache, role hierarchy, wildcard permissions, ABAC engine, external general-purpose policy engine, or Event Sourcing is included in v1.

---

## 4. PHASE 2 — Database Schema and Migration Design

**Status: COMPLETED — APPROVED BY PROJECT OWNER**
**Implementation and approval date: 2026-11-01**

### 4.1 Approved schema implemented

The project-owner-approved target schema was implemented in the Prisma models.

Implemented decisions:

- Added Access Control-owned `RoleDefinitionScope` (`SYSTEM`, `ORGANIZATION`).
- Added Access Control-owned `RoleAssignmentScope` (`ORGANIZATION`, `BRANCH`).
- Added `RoleStatus` (`ACTIVE`, `ARCHIVED`).
- Removed branch ownership from Role definitions.
- Added `Role.isAssignable` and `Role.status`.
- Kept Role definition ownership and assignment scope independent.
- Simplified Permission persistence to stable code and timestamps; localized metadata is source-controlled rather than stored in Permission rows.
- Preserved RolePermission composite identity and restrictive Permission deletion behavior.
- Preserved RoleAssignment membership targeting and exactly-one-membership invariant.
- Redesigned UserPermissionOverride around OrganizationMembership + Branch + Permission with composite tenant-consistency relations.
- Updated Organization and Branch relation fields to match the target ownership model and preserved Identity reverse relations.

### 4.2 Migration applied and verified

Forward migration:

`prisma/migrations/20261101075730_access_control_schema_v2/migration.sql`

The migration was applied to both `tarkhineh_test` and `tarkhineh_db` using `npx prisma migrate deploy`.

Observed verification:

- `npx prisma migrate status` reported `Database schema is up to date!` for both databases.
- No database reset was performed.
- No historical migration was edited.
- Existing main-database Role, Permission, RolePermission, and RoleAssignment data was preserved.

### 4.3 Main development database snapshot after PHASE 2

The following counts were observed after the PHASE 2 migration and its then-current Seed run. They are a **historical PHASE 2 snapshot**, not the expected counts after PHASE 3:

| Table                  | Count at PHASE 2 checkpoint |
| ---------------------- | --------------------------: |
| Role                   |                           2 |
| Permission             |                          18 |
| RolePermission         |                          25 |
| RoleAssignment         |                           1 |
| UserPermissionOverride |                           0 |

System Roles at that checkpoint:

| Role                 | Definition Scope | Assignment Scope | Assignable | Status | Permissions |
| -------------------- | ---------------- | ---------------- | ---------: | ------ | ----------: |
| `ORGANIZATION_OWNER` | SYSTEM           | ORGANIZATION     |      false | ACTIVE |          18 |
| `BRANCH_MANAGER`     | SYSTEM           | BRANCH           |       true | ACTIVE |           7 |

The existing OrganizationMembership assignment for `ORGANIZATION_OWNER` remained present.

The Permission table was inspected and contained `id`, `code`, `createdAt`, and `updatedAt`. Role retained its own `name` and `description`; these are not Permission metadata columns.

### 4.4 PHASE 2 Seed verification

At the PHASE 2 checkpoint, `npx prisma db seed` was executed twice on each of `tarkhineh_test` and `tarkhineh_db`. Both executions succeeded on both databases, and counts remained stable after the second run.

This was verification of the **PHASE 2 Seed implementation**. It does not mean that the later PHASE 3 CLI Seed has been run against either database.

### 4.5 Database protections inspected

Inspected constraints included:

- `Role_definition_scope_ownership_check`
- `Role_reserved_owner_non_assignable_check`
- RoleAssignment exactly-one-membership check
- Active-assignment uniqueness constraints
- Composite UserPermissionOverride foreign keys for OrganizationMembership/Branch tenant consistency
- Restrictive Permission foreign keys from RolePermission and UserPermissionOverride

Inspected triggers included:

- `RoleAssignment_scope_guard`
- `Role_ownership_immutability_guard`
- `Branch_organization_immutability_guard`
- `OrganizationMembership_identity_immutability_guard`
- `BranchMembership_identity_immutability_guard`

The migration and resulting schema objects were inspected. Dedicated negative-write tests for every trigger and tenant constraint were not added in PHASE 2; that behavior-level coverage remains scheduled for PHASE 6.

### 4.6 Backup record

A custom-format backup of the main development database was created:

`~/db-backups/tarkhineh/tarkhineh_db_before_access_control_v2_20261101_115543.dump`

Observed size: 78 KB. `pg_restore --list` successfully read the archive. A full restore drill was not performed; archive-list verification is not a successful restore test.

### 4.7 PHASE 2 verification results

| Command                                         | Observed result                             |
| ----------------------------------------------- | ------------------------------------------- |
| `npx prisma format`                             | Completed successfully                      |
| `npx prisma validate`                           | Valid schema                                |
| `npx prisma generate`                           | Prisma Client 7.10.1 generated successfully |
| `npx tsc --noEmit`                              | Completed without reported errors           |
| `npm run build`                                 | Completed successfully                      |
| `npm test`                                      | 60 files passed; 691 tests passed; 0 failed |
| `npx prisma migrate deploy` on `tarkhineh_test` | Migration applied successfully              |
| `npx prisma migrate deploy` on `tarkhineh_db`   | Migration applied successfully              |
| `npx prisma migrate status` on both databases   | Schema up to date                           |
| PHASE 2 Seed twice on each database             | Both runs successful; record counts stable  |

### 4.8 Known unrelated Integration failure

The full Integration Suite after schema changes reported:

- 9 test files passed; 1 failed; 3 skipped.
- 78 tests passed; 1 failed; 6 skipped.

The failing test was:

`test/integration/outbound-email/prisma-outbound-email-dispatch.store.integration.spec.ts`

Test name:

`schedules retry and releases the current lease after an enqueue failure`

Observed behavior: the assertion expected `updated` to be `true`, but received `false`. The file passed once in isolation (8 tests passed); the failure recurred in full-suite execution, including a run using `--no-file-parallelism`.

Per project-owner direction, this unrelated Outbound Email failure was deferred. It was not fixed as part of Access Control and must not be reported as resolved.

Six Integration tests remained skipped, including opt-in Redis tests. E2E tests were not run at this checkpoint.

### 4.9 Production startup correction

The production start script was changed from `node dist/main` to `node dist/main.js`, matching the ESM build output. `npm run build && npm run start:prod` completed successfully, and NestJS logged `Nest application successfully started`. A separate live health-readiness check was not recorded.

### 4.10 PHASE 2 acceptance

The approved Prisma schema and forward migration were implemented, applied to both development and test databases, and verified. Existing main-database Access Control data was preserved. Prisma validation/generation, TypeScript, Build, Unit Tests, Seed, and migration-status checks passed.

The project owner reviewed and approved the PHASE 2 completion report on 2026-11-01. PHASE 2 is formally closed. The unrelated Outbound Email Integration failure, database guard behavior tests, and full backup restore drill remain documented limitations.

---

## 5. PHASE 3 — Permission Registry and Seed

**Status: COMPLETED — APPROVED BY PROJECT OWNER (2026-11-01)**

### 5.1 Permission Registry contract

The source-controlled Registry is the single source of Permission metadata. It defines exactly **23 stable Permission codes**:

- All 18 existing permission codes are preserved.
- Five codes were added:
  - `organization.roles.read`
  - `organization.roles.create`
  - `organization.roles.update`
  - `organization.roles.archive`
  - `organization.members.permissions.manage`
- The existing `organization.roles.assign` code remains unchanged.
- No old code was renamed or removed.

Each Registry definition includes:

- Stable `code`.
- English and Persian `name` and `description`.
- `targetScope`: `ORGANIZATION` or `BRANCH`.
- `resource`.
- `action`.
- Explicit `delegable: boolean`.

The Registry contains 16 ORGANIZATION-target and 7 BRANCH-target permissions. Its actions are `READ`, `CREATE`, `UPDATE`, `INVITE`, `SUSPEND`, `REMOVE`, `ASSIGN`, `ARCHIVE`, and `MANAGE`.

`organization.members.permissions.manage` is defined with:

- Target scope: `ORGANIZATION`.
- Resource: `organization.members.permissions`.
- Action: `MANAGE`.
- Delegable: `false`.

It represents management of permission overrides for Organization members, including branch-specific exceptions. Its target scope remains ORGANIZATION.

### 5.2 Delegability policy

Exactly 16 permissions are delegable:

- `organization.read`
- `organization.branches.read`
- `organization.branches.create`
- `organization.branches.update`
- `organization.members.read`
- `organization.members.invite`
- `organization.members.update`
- `organization.roles.read`
- `organization.roles.assign`
- `branch.dashboard.read`
- `branch.staff.read`
- `branch.staff.invite`
- `branch.staff.update`
- `branch.staff.suspend`
- `branch.staff.remove`
- `branch.roles.assign`

Exactly seven permissions are non-delegable:

- `organization.update`
- `organization.branches.suspend`
- `organization.members.remove`
- `organization.roles.create`
- `organization.roles.update`
- `organization.roles.archive`
- `organization.members.permissions.manage`

Delegability is separate from permission possession: a holder may have authority to perform an operation without having authority to delegate that permission to another principal. Enforcement of delegation rules belongs to later Domain and Application work.

### 5.3 Explicit System Role permission sets

Both System Role permission sets are explicit, static source-controlled lists. They are not derived from the complete Registry.

`ORGANIZATION_OWNER` has exactly 23 permissions:

- `organization.read`
- `organization.update`
- `organization.branches.read`
- `organization.branches.create`
- `organization.branches.update`
- `organization.branches.suspend`
- `organization.members.read`
- `organization.members.invite`
- `organization.members.update`
- `organization.members.remove`
- `organization.roles.assign`
- `organization.roles.read`
- `organization.roles.create`
- `organization.roles.update`
- `organization.roles.archive`
- `organization.members.permissions.manage`
- `branch.dashboard.read`
- `branch.staff.read`
- `branch.staff.invite`
- `branch.staff.update`
- `branch.staff.suspend`
- `branch.staff.remove`
- `branch.roles.assign`

`BRANCH_MANAGER` has exactly seven permissions:

- `branch.dashboard.read`
- `branch.staff.read`
- `branch.staff.invite`
- `branch.staff.update`
- `branch.staff.suspend`
- `branch.staff.remove`
- `branch.roles.assign`

Role configuration:

| Role                 | Assignment scope | Assignable |
| -------------------- | ---------------- | ---------: |
| `ORGANIZATION_OWNER` | ORGANIZATION     |      false |
| `BRANCH_MANAGER`     | BRANCH           |       true |

`isAssignable` is persisted role configuration; it does not itself establish that an actor has authority to assign a role. Assignment and delegation authorization are later Application responsibilities.

### 5.4 Seed synchronization and safety

The production entry point `prisma/seed.ts` invokes `synchronizeAccessControlRegistry` inside one Prisma interactive transaction.

The synchronizer in `prisma/seed/access-control-seed.ts` performs these steps:

1. Reads only the two known SYSTEM roles.
2. Validates all existing managed roles before the first write.
3. Fails if a managed role is `ARCHIVED`, has an unexpected `assignmentScope`, or unexpectedly has a non-null `organizationId`.
4. Upserts all 23 source-controlled Permission codes.
5. Creates or updates only `ORGANIZATION_OWNER` and `BRANCH_MANAGER` as SYSTEM roles.
6. Replaces RolePermission links only for the exact IDs of those two managed roles.
7. Returns the number of synchronized Permissions and the permission count for each role.

Safety properties:

- Existing System Role `status` is not overwritten during update.
- Permission rows are never deleted by this synchronizer.
- Organization-defined custom roles are not modified.
- RoleAssignments are not modified.
- UserPermissionOverrides are not modified.
- The synchronizer does not open a nested transaction; the caller owns the single transaction boundary.
- A thrown error propagates to the caller's transaction, which is responsible for rollback.

No Prisma schema change, migration, or database reset was part of PHASE 3.

### 5.5 Files changed or added

- Modified: `prisma/seed.ts`.
- Added: `prisma/seed/access-control-seed.ts`.
- Modified: `src/contexts/access-control/domain/permissions/permission-catalog.ts`.
- Added: `src/contexts/access-control/domain/permissions/permission-catalog.unit.spec.ts`.
- Added: `prisma/seed/access-control-seed.unit.spec.ts`.
- Added: `prisma/seed/access-control-seed-preconditions.unit.spec.ts`.
- Added: `test/integration/access-control/seed/permission-registry-seed.integration.spec.ts`.
- Modified: `vitest.config.ts` to include `prisma/**/*.spec.ts` Unit tests.
- Updated: `MASTER-ARCHITECTURE.md`, `IMPLEMENTATION-STATUS.md`, and `ARCHITECTURAL-DECISIONS.md`.
- Removed: temporary diagnostic file `permission-check-GAK4jO.ts` from the repository root.

### 5.6 Verification results

All results below were supplied from actual terminal executions during this PHASE 3 checkpoint:

| Command                                    | Observed result                                    |
| ------------------------------------------ | -------------------------------------------------- |
| `npx vitest run`                           | 63 files passed; 723 tests passed; 0 failed; 5.49s |
| Registry Unit tests                        | 25 passed                                          |
| System Role permission-set Unit tests      | 4 passed                                           |
| Seed precondition Unit tests               | 3 passed                                           |
| Focused Access Control Integration command | 1 file passed; 2 tests passed                      |
| `npx tsc --noEmit`                         | Completed with no reported errors                  |
| `npm run build`                            | Exit code 0                                        |
| `npm run lint`                             | Exit code 0; 0 errors; 102 warnings                |
| `git diff --check`                         | No whitespace errors                               |
| `git diff --cached --check`                | No whitespace errors at the staging checkpoint     |

The focused Integration command was:

```bash
npx vitest run \
  --config ./vitest.config.integration.ts \
  test/integration/access-control
```

It executed the Access Control Registry Seed Integration file against the guarded `tarkhineh_test` database.

### 5.7 Integration coverage and limitations

The two focused Integration tests cover:

- Repeated synchronization and idempotency.
- Exact System Role permission sets after synchronization.
- Preservation of Organization-defined custom roles and their RolePermission links.
- Preservation of archived custom roles.
- Preservation of existing RoleAssignments.
- Preservation of UserPermissionOverrides.
- Preservation of historical/legacy Permission rows.
- Rejection of an archived System Role before synchronization writes.
- Deliberate rollback of test fixtures and synchronization writes after assertions.

Additional Unit tests cover:

- Exact Owner and Branch Manager permission membership.
- Uniqueness of the static permission sets.
- Membership of every System Role permission in the Registry.
- BRANCH target scope for all Branch Manager permissions.
- Rejection of assignment-scope drift for either managed System Role before writes.
- Rejection of unexpected Organization ownership before writes.

Known limitations:

- A database failure injected midway through Seed statements was not tested. The Integration tests exercise precondition failures and deliberately roll back a transaction after successful synchronization assertions; they do not simulate a mid-write database fault.
- The full project Integration Suite was not rerun during this PHASE 3 checkpoint.
- The previously recorded unrelated Outbound Email retry/lease Integration failure remains unresolved and deferred.
- The production CLI Seed was not executed against `tarkhineh_db` or `tarkhineh_test` during PHASE 3. The focused Integration tests ran the synchronizer inside rollback transactions against `tarkhineh_test`; they made no persistent test-fixture or Seed changes.
- Lint continues to report 102 warnings and zero errors. Warnings were not suppressed or represented as errors.

### 5.8 PHASE 3 acceptance review

| Acceptance criterion                                                            | Result                                                     |
| ------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| Registry is the single source of Permission metadata                            | Implemented and Unit-tested                                |
| All 18 previous codes preserved; five approved codes added                      | Implemented and Unit-tested                                |
| Scope, resource, action, localized metadata, and delegability explicit          | Implemented and Unit-tested                                |
| System Role permission sets are explicit and static                             | Implemented and Unit-tested                                |
| New catalog permissions do not automatically expand System Role grants          | Implemented by static role sets and exact-set tests        |
| Seed synchronizes only the two managed System Roles                             | Implemented and covered by Integration test                |
| Custom roles, assignments, overrides, and historical Permission rows preserved  | Covered by focused Integration test                        |
| Unit tests, focused Integration tests, TypeScript, Build, Lint, and diff checks | Passed as recorded above                                   |
| Production CLI Seed run against development/test databases                      | Not performed in PHASE 3; operational run remains separate |
| Mid-operation database failure injection                                        | Not performed; limitation recorded                         |

**PHASE 3 implementation is ready for project-owner review. It is not formally closed until the project owner approves the Registry, delegability policy, explicit System Role grants, and this verification report.**

---

## 6. PHASE 4 — Domain Model

**Status: COMPLETED — APPROVED BY PROJECT OWNER (2026-11-01)**

### 6.1 Deliverables

Implemented under `src/contexts/access-control/domain/`:

- Role model and role lifecycle/scope invariants.
- RoleAssignment creation, dedicated Owner assignment factory, historical reconstitution, revocation, and effectiveness.
- PermissionOverride with Branch-target ALLOW/DENY effects, tenant validation, and timestamp invariants.
- Permission Registry lookup and Role-to-Permission scope compatibility rules.
- AuthorizationDecision and a pure snapshot-based PermissionEvaluator.
- Permission delegation policy for Role composition, assignment, and permission overrides.

The evaluator does not access Prisma, Redis, HTTP, NestJS, or external services. It evaluates the snapshot supplied by its caller. Snapshot construction and persistence belong to later phases.

### 6.2 Files created

- `authorization/authorization-decision.ts`
- `authorization/authorization.types.ts`
- `authorization/permission-evaluator.ts`
- `authorization/permission-evaluator.unit.spec.ts`
- `authorization/permission-delegation.policy.ts`
- `authorization/permission-delegation.policy.unit.spec.ts`
- `errors/invalid-role-data.error.ts`
- `errors/invalid-role-assignment.error.ts`
- `errors/invalid-permission-override.error.ts`
- `roles/role.types.ts`
- `roles/role.ts`
- `roles/role.unit.spec.ts`
- `role-assignments/role-assignment.ts`
- `role-assignments/role-assignment.unit.spec.ts`
- `permission-overrides/permission-override.ts`
- `permission-overrides/permission-override.unit.spec.ts`
- `rules/role-permission-scope.rule.ts`

`permissions/permission-catalog.unit.spec.ts` was reformatted by Prettier. The Registry implementation was not otherwise changed during this phase.

### 6.3 Verification results

Observed terminal results on 2026-11-01:

| Command/check                                                       | Observed result                                                         |
| ------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| `npx vitest run`                                                    | 68 files passed; 846 tests passed; 0 failed                             |
| `npx vitest run src/contexts/access-control/domain`                 | 6 files passed; 148 tests passed; 0 failed                              |
| `npx tsc --noEmit`                                                  | Completed without reported errors                                       |
| `npm run build`                                                     | Completed successfully                                                  |
| `npx oxlint --type-aware src/contexts/access-control/domain/`       | 19 files; 0 warnings; 0 errors                                          |
| `npx prettier --check 'src/contexts/access-control/domain/**/*.ts'` | All matched files use Prettier code style                               |
| `git diff --check`                                                  | No output; note that Git does not include untracked files in this check |

The full project test suite and production build were run before the formatting-only pass. After formatting, the focused Domain tests, TypeScript check, Domain lint, and Prettier check were rerun and passed.

### 6.4 Database and scope boundaries

- No Prisma schema changes.
- No migration created or applied.
- No database reset or persistent database write.
- No production Seed execution.
- No Application use case, persistence adapter, audit implementation, HTTP endpoint, or NestJS wiring.
- At the PHASE 4 checkpoint, PHASE 5 and later responsibilities had not yet been implemented.

### 6.5 PHASE 4 acceptance

- [x] Domain entities and invariants implemented.
- [x] Permission scope compatibility implemented.
- [x] Pure authorization evaluator implemented.
- [x] Delegation policy implemented.
- [x] 148 focused Domain tests passed.
- [x] Full project suite of 846 tests passed.
- [x] TypeScript and production build passed.
- [x] Domain lint and Prettier checks passed.
- [x] Project-owner review and formal approval (2026-11-01).

**PHASE 4 was formally approved by the project owner on 2026-11-01. PHASE 5 implementation is in progress; formal review and approval are pending.**

---

## 7. PHASE 5 — Application Layer and Use Cases

**Status: COMPLETED — APPROVED BY PROJECT OWNER (2026-11-01)**
**Checkpoint date: 2026-11-01**

### 7.1 Implemented deliverables

The Application Layer contains the seven mutation commands:

1. `CreateRole`
2. `UpdateRole`
3. `ArchiveRole`
4. `AssignRole`
5. `RevokeRole`
6. `SetPermissionOverride`
7. `RemovePermissionOverride`

It also contains the permission-related queries:

- `CheckPermission`
- `GetEffectivePermissions`
- `ListAvailablePermissions`

Application services, repository/read ports, error types, and handler tests are implemented. Authorization decisions and delegation rules remain in the Access Control Domain and are invoked by Application handlers.

### 7.2 Unit of Work contract

Added:

`src/contexts/access-control/application/ports/access-control-unit-of-work.port.ts`

The contract defines:

- `AccessControlUnitOfWork.execute()` as the owner of the transaction lifecycle.
- `AccessControlUnitOfWorkContext` as the source of transaction-bound Application ports.
- Shared transaction binding for `AuthorizationSnapshotReader`, `RoleRepository`, `RoleAssignmentRepository`, and `PermissionOverrideRepository`.
- Commit on successful callback completion and rollback when the callback throws.
- No independently managed or nested transactions in adapters supplied through the context.
- No external side effects inside a callback.
- A requirement for the Infrastructure implementation to protect sensitive check-then-write operations using an appropriate concurrency strategy.

All seven mutation handlers now inject `ACCESS_CONTROL_UNIT_OF_WORK`. Their authorization reads, target/repository reads, and persistence operations are performed through the context supplied to `execute()`.

`AuthorizationApplicationService` accepts an explicitly supplied snapshot reader, allowing mutation handlers to use the transaction-bound reader while existing query handlers retain the default reader.

The five relevant port files were clarified so the Unit of Work owns transaction lifecycle and supplied adapters must use its transaction-bound client:

- `access-control-unit-of-work.port.ts`
- `authorization-snapshot-reader.port.ts`
- `role.repository.ts`
- `role-assignment.repository.ts`
- `permission-override.repository.ts`

A source search across the seven command-handler files returned no matches for the legacy direct injection tokens `ROLE_REPOSITORY`, `ROLE_ASSIGNMENT_REPOSITORY`, `PERMISSION_OVERRIDE_REPOSITORY`, or `AUTHORIZATION_SNAPSHOT_READER`.

### 7.3 Verification results

Observed local terminal results on 2026-11-01:

| Command | Observed result |
| --- | --- |
| `npx vitest run src/contexts/access-control` | 15 files passed; 275 tests passed; 0 failed |
| `npx tsc --noEmit` | Completed without reported errors |
| `npx oxlint --type-aware src/contexts/access-control/` | 68 files; 0 warnings; 0 errors |
| `git diff --check` | No whitespace errors |
| Command-handler direct-injection search | No matches in the seven command handlers |

The 275 passing tests include Domain tests, Application service tests, all seven command-handler suites, and the existing query-handler suite. The final three-test increase covers metadata-only Role updates without delegation checks, Permission-set delegation checks (including clearing the set), and delegation snapshot failure behavior.

### 7.4 Changed implementation files

The checkpoint includes:

- Seven command handler implementations and their corresponding test files.
- `authorization-application.service.ts` and its test file.
- `UpdateRoleHandler` and its test file: delegation is checked only when `permissionCodes` is supplied, including an empty array; metadata-only updates retain management authorization but do not re-delegate unchanged permissions.
- New `access-control-unit-of-work.port.ts`.
- Clarified transaction-bound contracts in the authorization snapshot and three repository ports.

No Prisma schema, migration, database record, or persistent database state was changed during this PHASE 5 checkpoint.

### 7.5 Known limitations

The current verification is Application-level verification:

- The Unit of Work tests use mocks to confirm that handler operations execute inside the callback boundary.
- They do not prove actual database Commit/Rollback behavior.
- They do not prove that all adapters share a real Prisma transaction client.
- They do not prove PostgreSQL snapshot consistency, isolation, locking, or resistance to concurrent authorization changes.
- No concrete Prisma Unit of Work or Access Control repository adapters exist yet.
- Runtime NestJS dependency-injection/module composition with a concrete Unit of Work remains to be implemented and verified.
- A full production build and PostgreSQL Access Control Integration suite were not run as part of this checkpoint.

These items must remain explicit PHASE 6 work; no production transaction-safety claim is made from mocked tests.

### 7.6 PHASE 5 review checklist

- [x] Seven mutation handlers use the Unit of Work contract.
- [x] Authorization reads in mutation handlers use the supplied transaction-bound snapshot reader.
- [x] Repository reads and mutations in handlers use repositories supplied through the same context.
- [x] Existing Domain rules and delegation policies remain in use.
- [x] Focused Access Control Unit suite passes: 275 tests across 15 files.
- [x] TypeScript no-emit check passes.
- [x] Access Control Oxlint check passes with zero warnings and errors.
- [x] Diff whitespace check passes.
- [x] Project-owner review and formal PHASE 5 approval (2026-11-01).
- [ ] Concrete transaction behavior, runtime DI composition, and PostgreSQL Integration verification — PHASE 6.

**PHASE 5 was formally approved by the project owner on 2026-11-01 and is closed. Its known Infrastructure and runtime limitations are explicitly assigned to PHASE 6.**

---

## 8. PHASE 6 — Infrastructure and Authorization Persistence

**Status: PERSISTENCE ACCEPTANCE SCENARIOS VERIFIED — AWAITING PROJECT-OWNER REVIEW.**

PHASE 6 implements the Application ports introduced in PHASE 5 using Prisma 7 and PostgreSQL. Prisma and NestJS dependencies remain in Infrastructure; Domain and Application remain independent of generated Prisma models and transaction APIs.

### 8.1 Implemented infrastructure

The following concrete adapters and supporting components are present:

- `PrismaAccessControlUnitOfWork`: owns the interactive Prisma transaction lifecycle for mutation operations.
- `PrismaRoleRepository`: persists and queries Roles with Organization scoping and maps persistence records to Domain objects.
- `PrismaRoleAssignmentRepository`: resolves active Organization/Branch membership targets and persists, reads, revokes, and updates RoleAssignments through the transaction client.
- `PrismaPermissionOverrideRepository`: persists, reads, updates, and deletes Permission Overrides using OrganizationMembership, Branch, and Permission identity.
- `PrismaAuthorizationSnapshotReader`: reads transaction-bound authorization snapshots, including Organization context and Branch-scoped state.
- `PrismaDefaultAuthorizationSnapshotReader`: supplies standalone snapshot reads for Query handlers.
- `access-control-persistence.mapper.ts`: translates between persisted Prisma records and Access Control Domain models.
- `RetryableAccessControlTransactionError`: carries the original database error when the complete current transaction must be rolled back and retried.

The adapters are created by the Unit of Work for each operation. They are not registered as independent singleton repositories because their constructors require the operation's `Prisma.TransactionClient`.

### 8.2 Transaction and concurrency strategy

Mutation operations run inside one Prisma interactive transaction with:

- Isolation level: `Serializable`.
- Maximum transaction attempts: 3.
- Transaction max wait: 10 seconds.
- Transaction timeout: 30 seconds.
- Retry delay: 20 ms multiplied by the failed attempt number.

The Unit of Work constructs the AuthorizationSnapshotReader and all three repositories from the same transaction client supplied by the Prisma callback. A successful callback commits. A thrown callback error rolls the transaction back.

Retry behavior is deliberately narrow:

1. Prisma `P2034` serialization/write-conflict errors are retried by rerunning the complete callback in a new transaction, up to the configured maximum.
2. The Permission Override repository recognizes `P2002` only when the violated key is the exact composite key `(organizationMembershipId, branchId, permissionId)`. It raises the Infrastructure-only retry signal so the failed PostgreSQL transaction is abandoned and the complete Unit of Work is retried.
3. On the last attempt, the retry signal is unwrapped and the original Prisma error is passed through the existing error translator.
4. Unrelated unique violations are not classified as retryable and continue through the normal Prisma error translation path.

The database unique constraint remains authoritative. The application retry does not replace the constraint or permit duplicate rows. The retried handler operation re-reads the key; the existing same-effect behavior returns the previously created Override with `changed: false`.

The Unit of Work callback contract continues to prohibit external side effects. Retrying the callback is safe only while the callback consists of transaction-bound authorization reads and database work.

### 8.3 Authorization snapshot consistency

- Standalone snapshot reads use one Prisma interactive transaction at `RepeatableRead` isolation so the Organization snapshot and its Branch snapshots are read from one database view.
- Mutation handlers pass the Unit of Work's transaction-bound reader to `AuthorizationApplicationService`; their authorization reads therefore use the same `Serializable` transaction as the mutation.
- `loadDelegationSnapshots` loads active Branch identifiers and constructs the Organization snapshot plus each active Branch snapshot sequentially within the supplied transaction.
- The reader deliberately sequences Prisma operations on the same PostgreSQL transaction client rather than issuing parallel relation reads on that client.
- The focused Integration suite verifies read-your-writes behavior inside one Unit of Work and committed standalone snapshots.
- Multi-Branch snapshot coverage is now present: the fixture creates two active Branches in the same Organization and verifies that a Branch-scoped permission is not considered delegable until the required assignment exists across the active Branch snapshots.

This verifies the multi-Branch behavior for the tested fixture. It is not a large-Organization performance benchmark.

### 8.4 NestJS composition and error handling

`AccessControlModule` registers the concrete Unit of Work and default snapshot reader, then binds the Application tokens with `useExisting`. The module continues to export `AuthorizationApplicationService`.

A review found that `PrismaDefaultAuthorizationSnapshotReader` was missing `@Injectable()`; the decorator is now present. A dedicated Nest testing-module test resolves the reader with a mocked `PrismaService` and exercises its transaction path. This verifies the reader's constructor injection; it is not a full application boot test of every provider in the complete module graph.

Persistence adapters use the existing `normalizePrismaError` translator. Unknown errors are not intentionally relabelled as domain or application errors. The special retry signal is unwrapped at the Unit of Work boundary before the original error is normalized.

### 8.5 Main files added or changed

Infrastructure:

- `src/contexts/access-control/infrastructure/persistence/access-control-persistence.mapper.ts`
- `src/contexts/access-control/infrastructure/persistence/prisma-role.repository.ts`
- `src/contexts/access-control/infrastructure/persistence/prisma-role-assignment.repository.ts`
- `src/contexts/access-control/infrastructure/persistence/prisma-permission-override.repository.ts`
- `src/contexts/access-control/infrastructure/persistence/prisma-authorization-snapshot.reader.ts`
- `src/contexts/access-control/infrastructure/persistence/prisma-access-control.unit-of-work.ts`
- `src/contexts/access-control/infrastructure/persistence/retryable-access-control-transaction.error.ts`
- `src/contexts/access-control/access-control.module.ts`

Focused tests:

- `src/contexts/access-control/infrastructure/persistence/prisma-role.repository.spec.ts`
- `src/contexts/access-control/infrastructure/persistence/prisma-role-assignment.repository.spec.ts`
- `src/contexts/access-control/infrastructure/persistence/prisma-permission-override.repository.spec.ts`
- `src/contexts/access-control/infrastructure/persistence/prisma-authorization-snapshot.reader.spec.ts`
- `src/contexts/access-control/infrastructure/persistence/prisma-access-control.unit-of-work.spec.ts`
- `src/contexts/access-control/infrastructure/persistence/prisma-default-authorization-snapshot.reader.di.spec.ts`
- `test/integration/access-control/persistence/access-control-persistence.integration.spec.ts`

### 8.6 Observed verification

The following results were observed after the final code changes and Prettier formatting in the user's terminal:

| Command | Observed result |
| --- | --- |
| `npm run test:integration -- test/integration/access-control` | 2 files passed; 16 tests passed (14 Persistence, 2 Registry Seed) |
| `npm test -- src/contexts/access-control` | 21 files passed; 322 tests passed |
| `npx tsc --noEmit` | Passed; no TypeScript diagnostics |
| `npx oxlint src/contexts/access-control test/integration/access-control` | 83 files; 0 warnings; 0 errors |
| `npx prettier --check test/integration/access-control/persistence/access-control-persistence.integration.spec.ts` | Passed |
| `git diff --check` | Passed; no whitespace errors |
| `npm run build` | Completed successfully |

The Access Control-focused validation therefore covers 338 passing tests across 23 test files (322 Unit + 16 Integration). The commands above were run in the guarded development/test setup. The Integration fixture rewrites the configured development database URL to `tarkhineh_test` and refuses an unexpected source database name.

This is not evidence that the full-project Integration suite passed; that suite was not rerun during this focused verification.

### 8.7 Integration coverage actually present

The 14 Persistence Integration tests now cover the following acceptance areas:

1. **Transaction behavior:** commit, rollback, transaction-bound read-your-writes, and committed snapshot behavior.
2. **Tenant isolation:** separate Organizations and Branches prove that Role, RoleAssignment, and authorization snapshot reads do not leak across tenant boundaries.
3. **Database guards:** negative writes assert PostgreSQL `23514` check/trigger violations for Branch/Organization mismatch, cross-tenant Organization-owned Role assignment, and immutable Role ownership/assignment scope; a cross-tenant Branch reference for a Permission Override asserts `23503`.
4. **Real Handler concurrency:** two concurrent calls to `SetPermissionOverrideHandler.execute()` use the real PostgreSQL Unit of Work; one reports a change, the other reports no change, and exactly one Override remains persisted.
5. **Assignment and Role races:** concurrent duplicate `AssignRoleHandler` calls produce one active assignment and one duplicate-assignment error; concurrent same-code Role creation produces one Role and one duplicate-code error.
6. **Role permission-set race:** concurrent `UpdateRoleHandler` calls replacing the complete permission set both complete under the Serializable/retry strategy; the persisted set equals one complete submitted set rather than a partial mixture.
7. **Multi-Branch snapshots:** delegation snapshots include both active Branches and only treat a Branch-scoped permission as delegable when the required assignment exists across those active Branches.
8. **Permission Override persistence race:** concurrent creation of the same composite key results in one persisted row and idempotent results.

The two Registry Seed Integration tests bring the focused Access Control Integration total to 16; they are not counted as new PHASE 6 Persistence tests.

### 8.8 Query-plan review and remaining limitations

A PostgreSQL 18.6 `EXPLAIN` review was performed for representative Branch, Membership, RoleAssignment, RolePermission, and PermissionOverride access paths. The inspected schema includes `Branch_organizationId_status_idx`; OrganizationMembership's unique `(organizationId, userId)` key and user/status lookup index; RoleAssignment's membership/revocation and role/revocation indexes plus partial active-assignment unique keys; BranchMembership's unique `(branchId, organizationMembershipId)` key and Branch/status, membership/status, and Organization/status indexes; UserPermissionOverride's `(organizationMembershipId, organizationId)` and `(branchId, organizationId)` indexes plus its unique `(organizationMembershipId, branchId, permissionId)` key; and RolePermission's `(roleId, permissionId)` primary key and Permission lookup index. Based on the inspected plans and current schema, no additional index or migration is recommended at this checkpoint.

The plans were collected against a small test dataset using synthetic/probe identifiers. PostgreSQL selected sequential scans for several low-cardinality or empty-table probes, with observed execution times around 0.017–0.077 ms. Those plans are expected for tiny relations and do **not** establish a missing-index defect or demonstrate production-scale performance. A representative data-volume benchmark with `EXPLAIN (ANALYZE, BUFFERS)` remains a production-readiness activity.

The following verification items were explicitly accepted by the project owner as deferred work at PHASE 6 closure; they are not represented as completed:

- **Full module/application DI verification:** the default snapshot reader has a focused Nest testing-module test, but a full application boot/complete `AccessControlModule` dependency-graph test has not been recorded.
- **Full-project Integration suite:** it was not rerun as part of the final focused PHASE 6 validation. A previously isolated, unrelated Outbound Email retry/lease Integration test remains failing and deferred: `schedules retry and releases the current lease after an enqueue failure`. It must be investigated separately and must not be masked by Access Control changes.
- **Production-scale query benchmark:** repeat query-plan inspection with representative row counts and real fixture distributions before making production capacity claims.

No Prisma schema change or migration was created in PHASE 6. The Integration tests ran against `tarkhineh_test`; no production CLI Seed run or intentional schema change was part of this phase.

### 8.9 PHASE 6 review checklist

- [x] Concrete Prisma Unit of Work implemented.
- [x] Transaction-bound Role, RoleAssignment, PermissionOverride, and AuthorizationSnapshot adapters implemented.
- [x] Mutation reads and writes share one Serializable Prisma transaction client.
- [x] Standalone authorization snapshots use RepeatableRead.
- [x] Bounded P2034 retry implemented.
- [x] Targeted Permission Override composite-key P2002 retry implemented; unrelated unique violations are not retried.
- [x] Nest provider/token wiring added; reader constructor injection tested.
- [x] Dedicated cross-tenant isolation and database-guard negative-write Integration tests.
- [x] Concurrent duplicate RoleAssignment and same-code Role creation tests.
- [x] Role permission-set mutation race under the Serializable Unit of Work.
- [x] `SetPermissionOverrideHandler.execute()` concurrency test using the real Unit of Work and PostgreSQL.
- [x] Multi-Branch delegation snapshot coverage.
- [x] Query-plan/index review completed; small/synthetic-data limitations documented and no index change justified by current evidence.
- [x] Focused Unit and PostgreSQL Integration tests pass.
- [x] TypeScript, Access Control lint, Prettier, diff check, and production build have passed in the recorded runs.
- [ ] Full application boot/complete AccessControlModule dependency-graph verification (accepted deferred verification; not claimed complete).
- [ ] Full-project Integration suite review; the known unrelated Outbound Email retry/lease failure remains deferred (accepted deferred verification; not claimed complete).
- [x] Project-owner review and formal PHASE 6 approval (2026-11-02; deferred verification explicitly accepted).

**PHASE 6 was formally approved and closed by the project owner on 2026-11-02. The persistence acceptance scenarios listed above are implemented and verified. The unchecked runtime/full-suite items remain accepted deferred verification, not completed work or claims of production readiness.**

### 8.10 GitHub technical review — 2026-11-01

**Review outcome: PASS — no blocking Phase 6 Infrastructure/Persistence defect identified in the inspected GitHub source. This is a technical code review, not a claim that unexecuted runtime or full-suite checks passed.**

Review scope:

- Reviewed the concrete Unit of Work, all three transaction-bound repositories, the authorization snapshot reader, persistence mappers, Application ports, AccessControlModule, PrismaModule, SharedModule, AppModule, Prisma schema, and the PHASE 2 Access Control migration.
- Confirmed the Unit of Work supplies one transaction client to all persistence adapters, uses PostgreSQL `Serializable` isolation for mutations, retries bounded `P2034` conflicts, and only treats the exact Permission Override composite unique-key `P2002` as retryable. Other unique violations and application errors are not intentionally retried.
- Confirmed standalone authorization reads use one `RepeatableRead` transaction, including the organization and all active-Branch delegation snapshots. The evaluator filters inactive BranchMemberships and inactive/revoked Roles/Assignments according to the Domain rules.
- Reviewed tenant filters on membership, Role, Assignment, and Permission Override access paths, plus database-level Role ownership/scope guards and composite tenant foreign keys.
- Statically traced the NestJS provider graph: `ACCESS_CONTROL_UNIT_OF_WORK` and `AUTHORIZATION_SNAPSHOT_READER` resolve to their concrete adapters; `PrismaService` is exported by `PrismaModule`; `CLOCK` is exported by `SharedModule`; and `AppModule` registers global `ConfigModule` before importing `AccessControlModule`.
- Matched the Persistence Integration file's 14 test cases to the tenant-isolation, PostgreSQL guard, Handler concurrency, duplicate Role/Assignment, permission-set race, and Multi-Branch acceptance scenarios recorded above.

Repository and CI observations:

- At review time, `main` pointed to `b073d3b`, while `access-control` pointed to `fbb1103`; GitHub compare reported `access-control` **27 commits ahead and 0 behind**.
- No open pull request exists for `access-control`; the Access Control code and its updated documentation are therefore not yet present on `main`.
- The repository tree contains no `.github/workflows` directory. GitHub reported no commit status checks for the implementation commit `7e0b267` or the latest documentation commit. The passing test/build results above are the user's observed local terminal results, not GitHub Actions results.

Deferred verification and risk boundaries:

- A full Nest application boot / complete module-graph runtime test was not present. The provider graph was statically traced and no missing Phase 6 dependency was identified, but static review is not a substitute for running the application.
- The full-project Integration suite was not rerun for this review. The previously reported Outbound Email retry/lease failure is outside Access Control and must remain tracked separately rather than treated as a Phase 6 regression.
- The PostgreSQL `EXPLAIN` review used a small test dataset and synthetic/probe identifiers. It supports the conclusion that current schema indexes are reasonable for the inspected paths; it does not provide production-scale performance evidence. A representative `EXPLAIN (ANALYZE, BUFFERS)` exercise belongs in the later production-readiness work.
- The focused Access Control test and build results are recorded from actual terminal output supplied during the development session; this GitHub review did not execute code in a runner.

**Outcome:** The project owner formally approved and closed PHASE 6 on 2026-11-02, accepting the full-app boot test, full-project Integration investigation, and production-scale query benchmark as explicit deferred verification. This approval does not claim those checks passed or that the feature is merged into `main`. The review-time repository comparison found no open Access Control pull request; creating a PR from `access-control` to `main` remains a separate release/integration step.

## 9. PHASE 7 — Audit Logging

**Status: IN PROGRESS — 7.1 policy design approved; Prisma schema validation passed locally; Migration review/application and runtime implementation remain pending.**

### 9.1 Approved PHASE 7.1 policy decisions

All four owner decisions were approved on 2026-11-02 and recorded in ADR-025:

1. **Audit readers:** `organization.audit.read` is ORGANIZATION-scoped, non-delegable, and assigned only to `ORGANIZATION_OWNER`; it grants access to all Audit events for the exact Organization, across all its Branches. `branch.audit.read.own` is BRANCH-scoped, non-delegable, and assigned to `BRANCH_MANAGER`; the reader sees only their own successful permission-changing events in the exact authorized Branch and Organization. The Application query must enforce the actor-self predicate and tenant/branch filters.
2. **Denial events:** record `AUTHORIZATION_DENIED` only for actual authorization/delegation denials represented by `AccessControlForbiddenError`, and only with a trusted authenticated Actor and validated Organization context. Persistence is best-effort and must never mask the original denial. Input/validation errors, not-found results, conflicts, and missing Actor cases are excluded.
3. **Role creation cardinality:** a Role created with initial Permission links emits one `ROLE_CREATED` event whose after-state contains the initial Permission codes. It does not emit an additional `ROLE_PERMISSION_ADDED` event for each initial link. Later Role Permission-set changes are represented by actual added/removed differences.
4. **Correlation propagation:** optional `correlationId` is carried in Application Command metadata, populated by the HTTP adapter from the trusted `request.id`, and copied to Audit events. Non-HTTP commands may omit it. It is not business input.

For Branch Manager visibility, `ROLE_ASSIGNED` after-state must preserve the Permission codes present in the assigned Role at the time of assignment. The Branch Manager reader is restricted to `ROLE_ASSIGNED`, `ROLE_REVOKED`, and `PERMISSION_OVERRIDE_*` events where `actorUserId` equals the authenticated Manager and `branchId`/`organizationId` match the authorized scope. Historical Actor and Subject IDs may be visible; credentials, tokens, email addresses, and unrelated personal data are not exposed.

### 9.2 Repository and verification checkpoint

- Prisma schema validation was run locally with Prisma CLI 7.10.1 and returned: `The schemas at prisma are valid`.
- The Audit Prisma model and forward Migration draft are committed, but the Audit Migration has not been applied to a database as part of this checkpoint.
- Schema-to-Migration diff review, isolated PostgreSQL Migration application, and Audit Persistence/immutability Integration tests remain pending.
- The Domain/Application Audit contract, transaction-bound append-only writer, selected-denial writer, Audit reader authorization/query, Permission Registry additions, and explicit System Role Seed updates are not implemented yet.
- The seven successful-mutation paths must append Audit events inside the same transaction-bound Unit of Work. Selected denial events use their separately approved best-effort boundary.
- Runtime database-role privilege restrictions and production-scale query/index review remain unverified.

**No Audit database effects or runtime feature behavior are claimed by this design checkpoint.**

### 9.3 Next implementation step

Proceed to PHASE 7.2 — Domain and Application contracts. Define the typed Audit event contract and append-only Application port, then add the transaction-bound writer to the existing Unit of Work context. Keep Prisma and NestJS dependencies out of Domain and Application. Do not apply the Audit Migration to a database until the schema-to-Migration review and isolated-database target are confirmed.

---

## 10. Open items and deferred work

The following items are later-phase work, accepted deferred verification, or separate operational follow-ups. They do not reopen the formally approved PHASE 6 scope. Deferred verification is not represented as completed.

1. **User account status — PHASE 8:** Identity Access owns `User.status`. Confirm how account status is enforced in authenticated and non-HTTP application operations without duplicating Identity lifecycle ownership.
2. **Accepted PHASE 6 verification deferrals:** full application boot/complete module-graph runtime verification and a production-scale query benchmark remain open; see section 8.10. The small/synthetic-data query-plan review already recorded in PHASE 6 is not production-scale evidence.
3. **Backup recovery drill:** restore the recorded database backup into an isolated database before claiming a full recovery test.
4. **Deferred Outbound Email Integration failure:** investigate `schedules retry and releases the current lease after an enqueue failure` separately. Do not change Access Control code to mask this unrelated failure.
5. **Production Seed execution:** perform only after an explicit operational decision, with the target database confirmed and the resulting data reviewed.
6. **Mid-operation Seed failure test:** consider a safe, isolated integration strategy to prove rollback after a database statement fails partway through synchronization.

---

## 11. Session handoff protocol

At the end of each meaningful development session:

1. Update this document with the exact implementation status and observed command results.
2. Update `MASTER-ARCHITECTURE.md` when the approved architecture or roadmap changes.
3. Update `ARCHITECTURAL-DECISIONS.md` when a decision is added, changed, or superseded.
4. Record changed files, database effects, tests, and known limitations.
5. Record one exact next step.
6. Do not mark a phase formally complete until its acceptance criteria have been reviewed and approved by the project owner.

For a new assistant or development-tool session, provide these three documents first:

- `MASTER-ARCHITECTURE.md`
- `IMPLEMENTATION-STATUS.md`
- `ARCHITECTURAL-DECISIONS.md`

The repository documents and Git history are the project source of truth. Conversation history is supplementary only.

---

## 12. Exact next step

PHASES 0–6 are formally closed. PHASE 6 was approved by the project owner on 2026-11-02, with the full application boot, full-project Integration suite review, and production-scale query benchmark explicitly accepted as deferred verification rather than completed checks. PHASE 7 — Audit Logging is active on the dedicated `access-control-phase-7-audit` branch. ADR-022 records the owner-approved no-automatic-deletion policy, ADR-023 records historical scalar references without operational foreign keys, ADR-024 records the initial append-only Prisma schema design, and ADR-025 records all approved PHASE 7.1 event, reader, denial, and correlation policies. Local Prisma schema validation has passed. Immediate next step: begin PHASE 7.2 — Domain and Application contracts; keep migration review/application to an isolated, explicitly confirmed PostgreSQL test database as a separate later verification step. Do not run the Audit Migration against an unconfirmed development or production database. The production CLI Seed run remains a separate operational decision recorded in the PHASE 3 limitations.
