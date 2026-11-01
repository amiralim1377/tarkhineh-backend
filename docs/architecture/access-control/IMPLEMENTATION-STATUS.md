# Tarkhineh Backend — Access Control Implementation Status

| Attribute              | Value                                                  |
| ---------------------- | ------------------------------------------------------ |
| Project                | `tarkhineh-backend`                                    |
| Document version       | 1.8                                                    |
| Last updated           | 2026-11-01                                             |
| Architecture reference | `MASTER-ARCHITECTURE.md` v1.5                          |
| Decision log           | `ARCHITECTURAL-DECISIONS.md` v1.7                      |
| Current phase          | PHASE 5 — Application Layer and Use Cases              |
| Current phase status   | **IN PROGRESS — IMPLEMENTATION VERIFIED; OWNER REVIEW PENDING** |

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
|     5 | Application Layer and Use Cases                 | IN PROGRESS — implementation verified; review pending |
|     6 | Infrastructure and Authorization Persistence    | NOT STARTED                                         |
|     7 | Audit Logging                                   | NOT STARTED                                         |
|     8 | Cross-Context Integration                       | NOT STARTED                                         |
|     9 | HTTP Layer                                      | NOT STARTED                                         |
|    10 | Security, Performance, and Production Readiness | NOT STARTED                                         |

### Latest implementation checkpoint

PHASE 5 — Application Layer and Use Cases is the current phase. All seven mutation handlers use the Unit of Work Application contract. The latest observed checkpoint is 272 passing Access Control tests across 15 files, a successful TypeScript no-emit check, zero Access Control Oxlint warnings/errors, and a clean diff check. Formal PHASE 5 review and approval remain pending. See section 7 for deliverables and limitations.

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

**Status: IN PROGRESS — IMPLEMENTATION AND UNIT VERIFICATION RECORDED; PROJECT-OWNER REVIEW PENDING**
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
| `npx vitest run src/contexts/access-control` | 15 files passed; 272 tests passed; 0 failed |
| `npx tsc --noEmit` | Completed without reported errors |
| `npx oxlint --type-aware src/contexts/access-control/` | 68 files; 0 warnings; 0 errors |
| `git diff --check` | No whitespace errors |
| Command-handler direct-injection search | No matches in the seven command handlers |

The 272 passing tests include Domain tests, Application service tests, all seven command-handler suites, and the existing query-handler suite.

### 7.4 Changed implementation files

The checkpoint includes:

- Seven command handler implementations and their corresponding test files.
- `authorization-application.service.ts` and its test file.
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
- [x] Focused Access Control Unit suite passes: 272 tests across 15 files.
- [x] TypeScript no-emit check passes.
- [x] Access Control Oxlint check passes with zero warnings and errors.
- [x] Diff whitespace check passes.
- [ ] Project-owner review and formal PHASE 5 approval.
- [ ] Concrete transaction behavior, runtime DI composition, and PostgreSQL Integration verification — PHASE 6.

**PHASE 5 is not formally closed. Implementation and the recorded Unit verification are ready for project-owner review.**

---

## 8. Open items and deferred work

The following items belong to later phases or separate operational work. They must not be treated as PHASE 3 failures or as completed work.

1. **User account status — PHASE 8:** Identity Access owns `User.status`. Confirm how account status is enforced in authenticated and non-HTTP application operations without duplicating Identity lifecycle ownership.
2. **Audit retention and access — PHASE 7:** define retention, access authorization, and operational handling for audit records.
3. **PostgreSQL concurrency semantics — PHASE 6:** choose and implement isolation/locking and safe retry behavior for assignment, delegation validation, Role/Permission updates, and other sensitive check-then-write operations. PHASE 5 now defines the Unit of Work application contract but does not claim a concrete concurrency guarantee.
4. **Database guard behavior tests — PHASE 6:** add negative-write Integration tests for cross-scope/cross-tenant constraints and immutable Role ownership.
5. **Backup recovery drill:** restore the recorded database backup into an isolated database before claiming a full recovery test.
6. **Deferred Outbound Email Integration failure:** investigate `schedules retry and releases the current lease after an enqueue failure` separately. Do not change Access Control code to mask this unrelated failure.
7. **Production Seed execution:** perform only after an explicit operational decision, with the target database confirmed and the resulting data reviewed.
8. **Mid-operation Seed failure test:** consider a safe, isolated integration strategy to prove rollback after a database statement fails partway through synchronization.

---

## 9. Session handoff protocol

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

## 10. Exact next step

1. Review the PHASE 5 Application handlers, Unit of Work contract, test coverage, and documented limitations.
2. Obtain project-owner approval before formally closing PHASE 5.
3. Begin PHASE 6 by implementing the Prisma-backed Unit of Work and transaction-bound adapters for the four ports in `AccessControlUnitOfWorkContext`.
4. Define and test PostgreSQL isolation/locking, real commit/rollback, snapshot consistency, duplicate-write handling, and concurrent authorization changes.
5. Complete runtime NestJS provider/module composition with the concrete adapters and verify application startup.
6. Keep Prisma and infrastructure dependencies outside Domain and Application.

The production CLI Seed run remains a separate operational decision recorded in the PHASE 3 limitations.
