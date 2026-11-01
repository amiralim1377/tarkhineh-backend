# Access Control — Implementation Status

| Attribute              | Value                                          |
| ---------------------- | ---------------------------------------------- |
| Project                | `tarkhineh-backend`                            |
| Document version       | 1.1                                            |
| Last updated           | 2026-11-01                                     |
| Architecture reference | `MASTER-ARCHITECTURE.md` v1.1                  |
| Decision log           | `ARCHITECTURAL-DECISIONS.md`                   |
| Current phase          | PHASE 2 — Database Schema and Migration Design |
| Current phase status   | NOT STARTED — NEXT                             |

> This file records observed repository state and actual command results. A phase is not complete merely because its plan is written. Only mark it complete after its acceptance criteria, verification, and project-owner review are satisfied.

---

## 1. Current Project Checkpoint

### Completed phases

- [x] **PHASE 0 — Repository Audit and Baseline** — COMPLETED.
- [x] **PHASE 1 — Requirements and Architecture Design** — COMPLETED and approved by project owner.

### Active/next phase

- [ ] **PHASE 2 — Database Schema and Migration Design** — NOT STARTED. This is the next phase.

### Remaining phases

- [ ] PHASE 3 — Permission Registry and Seed.
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

**Status: NOT STARTED — NEXT PHASE**

### Goal

Finalize target Prisma schema, database invariants, constraints, indexes, trigger strategy, and migration plan before implementing Access Control Domain or Application code.

### Checklist

- [ ] Inspect current full Prisma model files before editing.
- [ ] Reconfirm all relation fields in `identity.prisma`, `organization.prisma`, and `access-control.prisma`.
- [ ] Define Access Control-owned `RoleDefinitionScope` (`SYSTEM`, `ORGANIZATION`).
- [ ] Define Access Control-owned `RoleAssignmentScope` (`ORGANIZATION`, `BRANCH`).
- [ ] Confirm Permission target scope remains source-code registry metadata rather than an unnecessary database enum.
- [ ] Redesign Role without branch ownership.
- [ ] Define Role lifecycle status (`ACTIVE`, `ARCHIVED`).
- [ ] Decide final reserved-role/non-assignable representation (`isAssignable` or an equivalent explicit policy).
- [ ] Define Role ownership/scope immutability constraints.
- [ ] Preserve RoleAssignment exactly-one-membership invariant.
- [ ] Preserve active-assignment partial unique constraints.
- [ ] Rework RoleAssignment guard for new Role scope model.
- [ ] Redesign UserPermissionOverride around OrganizationMembership + Branch + Permission.
- [ ] Define composite relations ensuring membership and branch are in the same Organization.
- [ ] Review Permission table metadata simplification and all consumers.
- [ ] Review RolePermission and Role indexes against target queries.
- [ ] Review existing triggers; do not duplicate/delete without reason.
- [ ] Produce final Prisma schema proposal.
- [ ] Produce migration SQL/strategy proposal.
- [ ] Obtain project-owner approval before applying schema/migration changes.

### Files expected to be inspected/considered

- `prisma/models/access-control.prisma`
- `prisma/models/organization.prisma`
- `prisma/models/identity.prisma`
- `prisma/seed.ts` (consumer audit; actual seed changes belong to PHASE 3)
- `prisma/migrations/20261031063647_add_multi_tenant_access_control/migration.sql`
- all current migration directories and any relevant generated Prisma config

### Acceptance criteria

- Exact Prisma model and relation design approved.
- No accidental cross-context ownership or circular relation introduced.
- Tenant ownership invariants have explicit database/application enforcement.
- Trigger/constraint strategy is understood and tested.
- Migration plan is explicit and appropriate for the early-development database state.
- `prisma format`, `prisma validate`, `prisma generate`, and test-database migration checks pass when implementation begins.
- No Domain or Application implementation begins before PHASE 2 is approved and complete.

---

## 5. Subsequent Phases

| Phase | Name                                         | Status      | Notes                                                                   |
| ----- | -------------------------------------------- | ----------- | ----------------------------------------------------------------------- |
| 3     | Permission Registry and Seed                 | NOT STARTED | Explicit system-role permission sets; no implicit all-permissions grant |
| 4     | Domain Model                                 | NOT STARTED | Pure Domain and unit tests                                              |
| 5     | Application Layer and Use Cases              | NOT STARTED | Role management, assignment, delegation, overrides, permission queries  |
| 6     | Infrastructure and Authorization Persistence | NOT STARTED | Prisma adapters and read queries                                        |
| 7     | Audit Logging                                | NOT STARTED | Append-only and transactional                                           |
| 8     | Cross-Context Integration                    | NOT STARTED | Explicit ports/adapters; no circular dependencies                       |
| 9     | HTTP Layer                                   | NOT STARTED | DTOs, controllers, guards, response mapping                             |
| 10    | Security and Production Readiness            | NOT STARTED | Full security matrix, performance, final verification                   |

---

## 6. Open Questions / Items Requiring Explicit Resolution

These are not reasons to reopen the approved architecture; they are implementation details to resolve in the appropriate phase.

1. **Role `isAssignable`:** decide whether a persisted boolean is sufficient or a small explicit assignment policy is clearer. Reserved owner role must remain protected regardless.
2. **Permission database metadata:** confirm whether any API/admin consumer needs localized metadata from the database before removing `name`/`description` columns.
3. **System role permission sets:** define exact explicit permissions for `ORGANIZATION_OWNER` and `BRANCH_MANAGER`; never use a dynamic all-permissions grant.
4. **User account status:** Identity Access owns `User.status`. Confirm at PHASE 8 how active/suspended account enforcement is guaranteed for authenticated and non-HTTP use cases; do not duplicate lifecycle ownership.
5. **Migration approach:** owner reports no important data in development databases. Choose whether to add a forward migration or reset/recreate a development database only after considering migration history and test reproducibility. No reset has been authorized.
6. **Audit retention/access:** define operational retention and who can read audit data when the audit implementation is designed.
7. **Concurrency semantics:** specify transaction/locking requirements for assignment, delegation validation, and role permission updates before implementation.

---

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

Start **PHASE 2 — Database Schema and Migration Design**.

First inspect the current complete Prisma model files and relevant migration SQL. Present a proposed target schema and explain the role of each relation/constraint/index. Do not edit files or run migrations until the project owner has reviewed and approved the schema design.
