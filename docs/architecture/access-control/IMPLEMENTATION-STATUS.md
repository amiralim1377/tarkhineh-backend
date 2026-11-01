# Access Control — Implementation Status

| Attribute              | Value                                          |
| ---------------------- | ---------------------------------------------- |
| Project                | `tarkhineh-backend`                            |
| Document version       | 1.3                                            |
| Last updated           | 2026-11-01                                     |
| Architecture reference | `MASTER-ARCHITECTURE.md` v1.1                  |
| Decision log           | `ARCHITECTURAL-DECISIONS.md`                   |
| Current phase          | PHASE 3 — Permission Registry and Seed |
| Current phase status   | IN PROGRESS — REGISTRY AND SEED DESIGN REVIEW |

> This file records observed repository state and actual command results. A phase is not complete merely because its plan is written. Only mark it complete after its acceptance criteria, verification, and project-owner review are satisfied.

---

## 1. Current Project Checkpoint

### Completed phases

- [x] **PHASE 0 — Repository Audit and Baseline** — COMPLETED.
- [x] **PHASE 1 — Requirements and Architecture Design** — COMPLETED and approved by project owner.
- [x] **PHASE 2 — Database Schema and Migration Design** — COMPLETED and approved by project owner on 2026-11-01.

### Active/next phase

- [ ] **PHASE 3 — Permission Registry and Seed** — IN PROGRESS; initial design review.

### Remaining phases

- [ ] PHASE 4 — Domain Model.
- [ ] PHASE 5 — Application Layer and Use Cases.
- [ ] PHASE 6 — Infrastructure and Authorization Persistence.
- [ ] PHASE 7 — Audit Logging.
- [ ] PHASE 8 — Cross-Context Integration.
- [ ] PHASE 9 — HTTP Layer.
- [ ] PHASE 10 — Security, Performance, and Production Readiness.

---

## 2. PHASE 0 — Repository Audit and Baseline

**Status: COMPLETED**  
**Completion date: 2026-11-01**

### 2.1 Repository inventory observed

At audit time, Access Control contained:

```text
src/contexts/access-control/
├── access-control.module.ts
└── domain/
    └── permissions/
        └── permission-catalog.ts
```

Observed facts:

- `AccessControlModule` was an empty NestJS module.
- The existing Permission Catalog defined 18 permissions.
- No Access Control-specific `*.spec.ts` or `*.test.ts` files were found.
- No Access Control Domain entities, Application handlers/use cases, Infrastructure repositories, authorization evaluator, or HTTP endpoints were present.
- `AccessControlModule` was imported by `src/app.module.ts`.
- The current catalog was imported by `prisma/seed.ts`.

The dependency search did not find other direct TypeScript consumers of `RoleScope` or Permission name/description beyond the catalog/seed evidence shown during the audit. This is an audit search result, not proof that future consumers do not exist; repeat targeted searches before removing or renaming schema fields.

### 2.2 Existing Prisma models inspected

Files inspected:

- `prisma/models/access-control.prisma`
- `prisma/models/organization.prisma`
- `prisma/models/identity.prisma`

Existing Access Control models:

- `Role`
- `Permission`
- `RolePermission`
- `RoleAssignment`
- `UserPermissionOverride`

Existing Organization/Identity relations inspected:

- `Organization`
- `OrganizationMembership`
- `BranchMembership`
- `User` relations for created Roles, RoleAssignments, and PermissionOverrides.

Current schema is an intermediate design and is not the approved target model. See `MASTER-ARCHITECTURE.md` and ADR entries for the target decisions.

### 2.3 Existing schema risks and required follow-up

1. Current Role definition scope has `SYSTEM`, `ORGANIZATION`, and `BRANCH`; target v1 supports only SYSTEM and ORGANIZATION-owned Roles.
2. Current `Role.assignmentScope` reuses Organization Management's `MembershipScope`; target Access Control must own a distinct `RoleAssignmentScope`.
3. Current Role includes `branchId` and a Branch ownership relation; target v1 removes branch-owned Role definitions.
4. Current `UserPermissionOverride` is tied to `BranchMembership`; target must support Organization members without BranchMembership by associating override with OrganizationMembership + Branch + Permission.
5. Current Permission database row duplicates localized metadata already defined in the source catalog; target catalog is the metadata source of truth, subject to checking every consumer before schema simplification.
6. Existing system-role seed dynamically grants all catalog permissions to `ORGANIZATION_OWNER`; target seed must explicitly list role permissions.
7. Existing RoleAssignment and Role ownership triggers must be reviewed and redesigned for the target schema, not blindly deleted or duplicated.

### 2.4 Existing database guards and indexes inspected

The multi-tenant migration inspected was:

`prisma/migrations/20261031063647_add_multi_tenant_access_control/migration.sql`

The migration includes:

- Role scope/ownership check constraint.
- Role assignment exactly-one-membership check constraint.
- `enforce_role_assignment_scope()` trigger and `RoleAssignment_scope_guard`.
- `prevent_role_ownership_change()` trigger and `Role_ownership_immutability_guard`.
- `prevent_branch_organization_change()` trigger and `Branch_organization_immutability_guard`.
- Partial unique indexes preventing duplicate active assignments for OrganizationMembership + Role and BranchMembership + Role.
- Composite foreign keys ensuring BranchMembership's Branch and OrganizationMembership belong to the same Organization.

These are existing protections. PHASE 2 must inspect their exact SQL, decide which to retain, and adapt those affected by the new model.

### 2.5 Seed findings

`prisma/seed.ts` was inspected.

Observed behavior:

- Reads `PERMISSION_DEFINITIONS` from `permission-catalog.ts`.
- Upserts Permission rows and writes `name.fa` and `description.fa` to the database.
- Seeds `ORGANIZATION_OWNER` and `BRANCH_MANAGER` as system roles.
- `ORGANIZATION_OWNER` currently receives `PERMISSION_DEFINITIONS.map(...)`, i.e. all current catalog permissions.
- `BRANCH_MANAGER` receives an explicit list of branch permissions.
- RolePermission rows for system roles are synchronized via `deleteMany` + `createMany` inside a transaction.

Follow-up in PHASE 3: explicitly enumerate system-role permissions; ensure new permissions do not silently expand privileges; avoid deleting or overwriting organization-defined custom roles; make catalog/database metadata ownership unambiguous.

### 2.6 Migration history and database state

The repository contained 16 migration directories at audit time.

Observed database status:

| Database         | Observed status                                                                                   |
| ---------------- | ------------------------------------------------------------------------------------------------- |
| `tarkhineh_db`   | 16 migrations found; schema up to date                                                            |
| `tarkhineh_test` | Initially 4 pending migrations; after `migrate deploy`, 16 migrations found and schema up to date |

The four pending migrations were applied to **`tarkhineh_test` only**:

- `20261024081212_remove_legacy_email_outbox`
- `20261031063647_add_multi_tenant_access_control`
- `20261031135312_add_branch_images_and_location`
- `20261031135938_expand_branch_profile_and_working_hours`

A subsequent `npx prisma migrate status` against `tarkhineh_test` reported `Database schema is up to date!`.

The main development database was not changed by this test-database migration operation.

The project owner stated that the project is in early development and there is no important data in the databases. This permits considering a development reset if justified, but no reset has been approved or performed. Preserve migration history unless a deliberate strategy is approved.

### 2.7 Test configuration inspected

Package scripts observed:

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

Vitest configuration:

- Unit tests: `src/**/*.spec.ts`.
- Integration tests: `test/integration/**/*.integration.spec.ts`, `fileParallelism: false`.
- E2E tests: `test/app.e2e-spec.ts` and `test/e2e/**/*.e2e-spec.ts`, `fileParallelism: false`.

Integration test inspection found eight Prisma-backed integration files using `tarkhineh_test`. Representative tests build a test database URL by validating the configured database name `tarkhineh_db` and replacing the pathname with `/tarkhineh_test`.

Inspected cleanup examples used test-specific IDs/emails/idempotency keys rather than broad table truncation. The health integration test uses a mocked PrismaService and mocked rate-limit readiness dependency; it does not connect to PostgreSQL or Redis.

Redis throttler integration tests:

- Are opt-in via `RATE_LIMIT_REDIS_INTEGRATION=true`.
- Use a dedicated prefix `tarkhineh:rate-limit:integration:` and UUID namespaces.
- Clean only matching keys under the test namespace, not `FLUSHDB`/`FLUSHALL`.
- Were skipped in the baseline run because the opt-in variable was not enabled.

The safety review sampled representative database tests and the Redis test file. It did not individually inspect every test's full setup/cleanup code. Do not overstate this as a complete line-by-line audit of all integration tests.

### 2.8 Verified baseline command results

All results below were supplied from actual terminal executions during PHASE 0.

| Command                                                      | Observed result                                                                                          |
| ------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------- |
| `npm test`                                                   | 60 test files passed; 691 tests passed; 0 failed; duration 4.68s                                         |
| `npm run build`                                              | Completed without reported errors                                                                        |
| `npm run lint`                                               | 0 errors; 102 warnings; completed on 247 files with 111 rules                                            |
| `npm run test:integration`                                   | 10 test files passed; 3 test files skipped; 79 tests passed; 6 tests skipped; 0 failures; duration 8.02s |
| `npx prisma migrate status` on `tarkhineh_db`                | 16 migrations found; schema up to date                                                                   |
| `npx prisma migrate status` on `tarkhineh_test` after deploy | 16 migrations found; schema up to date                                                                   |

Lint warning example observed: `typescript(unbound-method)` in `src/contexts/outbound-email/infrastructure/queue/outbound-email-reconciler.spec.ts`. There were 102 warnings in total. They are pre-existing baseline debt and are outside the initial Access Control scope unless touched by later work.

Integration test skips:

- `test/integration/rate-limiting/app-module-guard-order.integration.spec.ts`: 1 skipped.
- `test/integration/rate-limiting/redis-throttler.storage.integration.spec.ts`: 4 skipped.
- `test/integration/rate-limiting/rate-limit-guard-order.integration.spec.ts`: 1 skipped.

E2E tests were not run during PHASE 0.

`npx tsc --noEmit` was not run as a separate baseline command. `npm run build` passed, but do not report a separate TypeScript no-emit check as passed.

### 2.9 PHASE 0 acceptance result

PHASE 0 is marked COMPLETED because the repository/schema/seed/migration review was performed, relevant dependencies were searched, both development and test database migration statuses were verified, representative test isolation was reviewed, and Unit/Integration/Build/Lint baselines were observed. Outstanding limitations are explicitly documented above (E2E and separate no-emit TypeScript not run; six Integration tests skipped; Lint warnings remain).

---

## 3. PHASE 1 — Architecture Design

**Status: COMPLETED — APPROVED BY PROJECT OWNER**

The project owner approved the architecture and product rules recorded in `MASTER-ARCHITECTURE.md`.

Key approvals:

- A User can belong to multiple organizations.
- Organization roles may grant Branch permissions across all active branches in that organization without BranchMembership.
- Branch roles apply only through the corresponding active BranchMembership.
- BranchMembership status controls its own branch assignments; it does not alone revoke inherited organization-level permissions.
- Explicit DENY overrides ALLOW.
- Organization-defined custom roles are supported; customer-defined permission codes are not.
- Delegation is constrained by the actor's delegable effective permissions.
- Sensitive changes are audited.
- No long-lived authorization cache in v1.
- No role hierarchy, wildcard permissions, ABAC engine, external/general policy engine, or Event Sourcing in v1.

---

## 4. PHASE 2 — Database Schema and Migration Design

**Status: COMPLETED — APPROVED BY PROJECT OWNER**
**Implementation date: 2026-11-01**

### 4.1 Approved target schema implemented

The project-owner-approved target schema was implemented in the Prisma models.

Implemented decisions:

- Added Access Control-owned `RoleDefinitionScope` (`SYSTEM`, `ORGANIZATION`).
- Added Access Control-owned `RoleAssignmentScope` (`ORGANIZATION`, `BRANCH`).
- Added `RoleStatus` (`ACTIVE`, `ARCHIVED`).
- Removed branch ownership from Role definitions.
- Added `Role.isAssignable` and `Role.status`.
- Kept Role definition scope and assignment scope independent.
- Simplified Permission persistence to its stable code and timestamps; localized metadata is no longer stored in the database. The existing source catalog remains its current source pending formalization as the Permission Registry in PHASE 3.
- Preserved RolePermission's composite identity and restrictive Permission deletion behavior.
- Preserved RoleAssignment membership targeting and its exactly-one-membership invariant.
- Redesigned UserPermissionOverride around OrganizationMembership + Branch + Permission, with composite tenant-consistency relations.
- Updated Organization and Branch relation fields to match the new ownership model.
- Preserved Identity reverse relations.

### 4.2 Migration created and applied

Forward migration:

`prisma/migrations/20261101075730_access_control_schema_v2/migration.sql`

The migration was applied successfully to both databases:

- `tarkhineh_test`
- `tarkhineh_db`

Observed verification:

- `npx prisma migrate status` reported `Database schema is up to date!` for both databases.
- The migration was applied using `npx prisma migrate deploy`.
- No database reset was performed.
- No historical migration was edited.
- The main development database's existing Role, Permission, RolePermission, and RoleAssignment records were preserved.

### 4.3 Main database state after migration and seed

Verified counts in `tarkhineh_db`:

| Table | Count |
| ----- | -----: |
| Role | 2 |
| Permission | 18 |
| RolePermission | 25 |
| RoleAssignment | 1 |
| UserPermissionOverride | 0 |

Verified system roles:

| Role | Definition Scope | Assignment Scope | Assignable | Status | Permissions |
| ---- | ---------------- | ---------------- | ---------- | ------ | ----------: |
| `ORGANIZATION_OWNER` | SYSTEM | ORGANIZATION | false | ACTIVE | 18 |
| `BRANCH_MANAGER` | SYSTEM | BRANCH | true | ACTIVE | 7 |

The existing OrganizationMembership assignment for `ORGANIZATION_OWNER` remained present.

The Permission table was inspected after migration and contains only:

- `id`
- `code`
- `createdAt`
- `updatedAt`

The Role table retains its own `name` and `description`; these are not Permission metadata columns.

### 4.4 Seed verification

`npx prisma db seed` was executed twice on each of:

- `tarkhineh_test`
- `tarkhineh_db`

Both executions succeeded on each database. Counts remained stable after the second execution.

This verifies the observed Seed idempotency for the current system roles and permissions. Explicit system-role permission lists and the prohibition on dynamic all-permissions grants remain PHASE 3 work.

### 4.5 Database protections inspected

The applied schema includes the redesigned Role ownership and assignment protections.

Inspected constraints include:

- `Role_definition_scope_ownership_check`
- `Role_reserved_owner_non_assignable_check`
- RoleAssignment exactly-one-membership check
- Existing active-assignment uniqueness constraints
- Composite UserPermissionOverride foreign keys for OrganizationMembership and Branch tenant consistency and Branch ownership
- Restrictive Permission foreign keys from RolePermission and UserPermissionOverride

Inspected triggers include:

- `RoleAssignment_scope_guard`
- `Role_ownership_immutability_guard`
- `Branch_organization_immutability_guard`
- `OrganizationMembership_identity_immutability_guard`
- `BranchMembership_identity_immutability_guard`

The migration was successfully applied and the resulting schema objects were inspected. Dedicated negative-write tests for each trigger and tenant constraint have not yet been added; cover those cases in the Access Control persistence/integration test work in PHASE 6.

### 4.6 Backup

A custom-format backup of the main development database was created:

`~/db-backups/tarkhineh/tarkhineh_db_before_access_control_v2_20261101_115543.dump`

Observed size: 78 KB.

`pg_restore --list` successfully read the archive. A full restore drill has not been performed; archive-list verification must not be described as a successful restore test.

### 4.7 Verified command results

| Command | Observed result |
| ------- | --------------- |
| `npx prisma format` | Completed successfully |
| `npx prisma validate` | Valid schema |
| `npx prisma generate` | Prisma Client 7.10.1 generated successfully |
| `npx tsc --noEmit` | Completed without reported errors |
| `npm run build` | Completed successfully |
| `npm test` | 60 files passed; 691 tests passed; 0 failed |
| `npx prisma migrate deploy` on `tarkhineh_test` | Migration applied successfully |
| `npx prisma migrate deploy` on `tarkhineh_db` | Migration applied successfully |
| `npx prisma migrate status` on both databases | Schema up to date |
| Seed twice on each database | Both runs successful; record counts stable |

### 4.8 Integration test limitation

The Integration Suite was run after the schema changes.

Observed full-suite result:

- 9 test files passed; 1 failed; 3 skipped.
- 78 tests passed; 1 failed; 6 skipped.

The failing test is:

`test/integration/outbound-email/prisma-outbound-email-dispatch.store.integration.spec.ts`

Test:

`schedules retry and releases the current lease after an enqueue failure`

Observed behavior:

- The file passed once when executed in isolation (8 tests passed).
- The full Integration Suite failed at the same assertion.
- A subsequent full run with `--no-file-parallelism` also failed at the same assertion.
- The assertion expected `updated` to be `true`, but received `false`.

Per project-owner direction, this unrelated Outbound Email test is deferred and must not be represented as resolved or as a passing Integration Suite. No Production code change was made for it.

Six Integration tests remained skipped, including the opt-in Redis rate-limiting tests. E2E tests and a new Access Control-specific integration suite have not yet been run/created.

### 4.9 Operational startup correction

The production start script was corrected from `node dist/main` to `node dist/main.js`, matching the actual ESM build output.

`npm run build && npm run start:prod` completed successfully, and NestJS logged `Nest application successfully started`. This verifies startup; a separate live health-readiness check was not recorded in this phase.

### 4.10 PHASE 2 implementation result

The approved Prisma schema and forward migration have been implemented, applied to both development and test databases, and verified. Existing main-database Access Control data was preserved. Prisma validation/generation, TypeScript check, Build, Unit Tests, Seed, and migration status checks passed.

The known Outbound Email Integration failure is explicitly deferred. Behavior-level negative tests for database guards and a full backup restore drill remain documented limitations, not claimed successes.

The project owner reviewed and approved this completion report on 2026-11-01. PHASE 2 is formally closed.

## 5. Subsequent Phases

| Phase | Name                                         | Status      | Notes                                                                   |
| ----- | -------------------------------------------- | ----------- | ----------------------------------------------------------------------- |
| 3     | Permission Registry and Seed                 | IN PROGRESS | Inspect the existing catalog and seed; design explicit system-role permission sets. No code changes until the proposal is approved. |
| 4     | Domain Model                                 | NOT STARTED | Pure Domain and unit tests                                              |
| 5     | Application Layer and Use Cases              | NOT STARTED | Role management, assignment, delegation, overrides, permission queries  |
| 6     | Infrastructure and Authorization Persistence | NOT STARTED | Prisma adapters and read queries                                        |
| 7     | Audit Logging                                | NOT STARTED | Append-only and transactional                                           |
| 8     | Cross-Context Integration                    | NOT STARTED | Explicit ports/adapters; no circular dependencies                       |
| 9     | HTTP Layer                                   | NOT STARTED | DTOs, controllers, guards, response mapping                             |
| 10    | Security and Production Readiness            | NOT STARTED | Full security matrix, performance, final verification                   |

---

## 6. Open Questions / Items Requiring Explicit Resolution

Resolved during PHASE 2:

- **Role assignability:** `isAssignable` is persisted; the reserved `ORGANIZATION_OWNER` system role is non-assignable and protected by a database check.
- **Permission metadata:** localized Permission metadata columns were removed after the consumer audit. The source-code Permission Registry is the metadata source of truth.
- **Migration approach:** a forward migration was selected and applied to both development and test databases. No reset was performed.

Deferred to later phases:

1. **System role permission sets — PHASE 3:** replace dynamic all-permissions grants with explicit, reviewed lists for `ORGANIZATION_OWNER` and `BRANCH_MANAGER`.
2. **User account status — PHASE 8:** Identity Access owns `User.status`. Confirm enforcement for authenticated and non-HTTP use cases without duplicating lifecycle ownership.
3. **Audit retention/access — PHASE 7:** define operational retention and who may read audit records.
4. **Concurrency semantics — PHASES 5–6:** specify transaction and locking requirements for assignment, delegation validation, and role permission updates.
5. **Database guard behavior tests — PHASE 6:** add integration coverage for rejected cross-scope/cross-tenant writes and immutable Role ownership.
6. **Backup recovery drill:** perform a restore test in an isolated database before treating the backup process as fully recovery-tested.
7. **Deferred unrelated Integration failure:** investigate the Outbound Email retry/lease test separately; do not change Access Control implementation to mask it.

## 7. Session Handoff Protocol

At the end of every meaningful development session:

1. Update this file with exact status and verified results.
2. Update `ARCHITECTURAL-DECISIONS.md` if a decision is added, changed, or superseded.
3. Record changed/created files and database effects.
4. Record tests with exact commands and observed outputs.
5. Write one exact next step.
6. Do not mark a phase complete until the project owner reviews and approves its completion report.

For a new ChatGPT or Claude Code session, provide these three documents first:

- `MASTER-ARCHITECTURE.md`
- `IMPLEMENTATION-STATUS.md`
- `ARCHITECTURAL-DECISIONS.md`

Then request a status summary and the next step. The repository documents are the source of truth; conversational memory is only auxiliary.

---

## 8. Exact Next Step

Continue **PHASE 3 — Permission Registry and Seed**.

First inspect:

- `src/contexts/access-control/domain/permissions/permission-catalog.ts`
- `prisma/seed.ts`
- `docs/architecture/access-control/MASTER-ARCHITECTURE.md`
- `docs/architecture/access-control/ARCHITECTURAL-DECISIONS.md`

Review the current permission codes, metadata, target scopes, and existing role grants. Then present:

1. A proposed Permission Registry contract and metadata structure.
2. An explicit permission set for `ORGANIZATION_OWNER`.
3. An explicit permission set for `BRANCH_MANAGER`.
4. Seed synchronization and safety rules, including protection of organization-defined custom roles.

Obtain project-owner approval of the proposal before changing implementation code. Do not begin PHASE 4 Domain or PHASE 5 Application work prematurely.
