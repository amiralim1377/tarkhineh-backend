# PHASE 7 — Audit Logging Implementation Plan

**Status:** IN PROGRESS — 7.1 Audit contract and policy design  
**Branch:** `access-control-phase-7-audit`  
**Architecture baseline:** `MASTER-ARCHITECTURE.md` v1.10  
**Accepted decision:** ADR-014  
**Plan date:** 2026-11-02

## 1. Purpose and authority

This document turns the already-approved Phase 7 requirements into an executable work sequence. It does not replace or silently amend the approved architecture.

The binding requirements come from:

- `MASTER-ARCHITECTURE.md`, section 4.11 (Audit logging) and the Phase 7 roadmap entry.
- `ARCHITECTURAL-DECISIONS.md`, ADR-014 (append-only audit records for sensitive Access Control mutations).
- `IMPLEMENTATION-STATUS.md`, current phase and verified repository state.

Any decision not already fixed by those sources is marked **OPEN — OWNER DECISION REQUIRED** below. No retention duration, reader permission, database deletion rule, or event-selection policy is to be invented during implementation.

## 2. Approved scope

Phase 7 must provide dedicated Access Control audit records for sensitive mutations to Role, RolePermission, RoleAssignment, and PermissionOverride.

The initial event vocabulary from Master Architecture section 4.11 is:

- `ROLE_CREATED`
- `ROLE_UPDATED`
- `ROLE_ARCHIVED`
- `ROLE_PERMISSION_ADDED`
- `ROLE_PERMISSION_REMOVED`
- `ROLE_ASSIGNED`
- `ROLE_REVOKED`
- `PERMISSION_OVERRIDE_CREATED`
- `PERMISSION_OVERRIDE_UPDATED`
- `PERMISSION_OVERRIDE_REMOVED`
- Selected sensitive `AUTHORIZATION_DENIED` events

Audit data must capture, where applicable:

- Actor ID.
- Subject/target user or membership.
- Organization ID and Branch ID.
- Event/action and resource identity.
- Timestamp.
- Before/after state where useful.
- Request/correlation ID.

The implementation must also enforce these approved constraints:

1. Audit records are append-only.
2. A successful sensitive business mutation and its audit write commit or roll back together.
3. Credentials, tokens, passwords, secrets, and unnecessary sensitive data are never recorded.
4. Successful permission checks are not persisted by default.
5. Audit retention and audit-reader authorization must be finalized in Phase 7.

## 3. Repository baseline inspected

The following facts were confirmed on the Phase 7 branch before implementation:

- No Audit model, Audit repository, or Audit adapter currently exists in the Access Control context.
- `AccessControlUnitOfWorkContext` currently exposes four transaction-bound ports: authorization snapshot reader, Role repository, RoleAssignment repository, and PermissionOverride repository.
- `PrismaAccessControlUnitOfWork` creates all four adapters with the same `Prisma.TransactionClient`, runs mutations at PostgreSQL Serializable isolation, and may retry the complete callback up to three attempts for the specifically classified conflicts.
- Therefore, a successful mutation's Audit write must use the same transaction-bound context. It must not open an independent transaction or perform an external side effect inside the retryable callback.
- The seven existing mutation handlers are CreateRole, UpdateRole, ArchiveRole, AssignRole, RevokeRole, SetPermissionOverride, and RemovePermissionOverride. They already use the Unit of Work.
- Existing handlers contain idempotent paths. A repeated Archive, Revoke, unchanged Override, or removal of a missing Override must not create a state-change event.
- UpdateRole can modify Role details and replace the complete Permission set. The implementation must compare the actual before/after values rather than infer a change merely because a field was supplied.
- The application currently generates a request ID in `src/app.module.ts` using `pino-http`, writes it to `X-Request-Id`, and includes it in request logs. The current Access Control command constructors do not yet carry that ID. The correlation-ID handoff into commands must be explicitly designed; Phase 9 HTTP integration must not be assumed to exist today.
- Command comments require `actorUserId` to come from trusted authentication context, not an untrusted HTTP request body. Phase 7 must preserve that boundary.
- Existing User, Organization, Membership, and Branch data are owned by their respective bounded contexts. Audit design must not take over their lifecycle.

## 4. Proposed implementation sequence

### 7.1 — Audit contract and policy design

- Define the typed event catalog and the minimum allow-listed payload for each event.
- Define resource and subject identity conventions for Organization-scoped and Branch-scoped operations.
- Define before/after snapshot shapes. Never serialize complete Domain aggregates or arbitrary command input.
- Define whether Role creation with an initial Permission set produces only `ROLE_CREATED` with the initial set in its after-state, or also emits per-permission events. This is an event-cardinality decision, not an implicit implementation detail.
- Define the correlation-ID Application contract and how the existing request ID will be passed through the future HTTP adapter.
- Select the sensitive denial scenarios that are worth persisting; do not persist every failed permission check.
- Resolve retention, audit-reader authorization, and reference/deletion behavior (see section 5).

**Exit criteria:** event payloads and owner decisions are recorded without changing accepted ADRs silently.

### 7.2 — Domain and Application contracts

- Add a small, explicitly typed Audit event contract appropriate to the Access Control context.
- Add an Application write port with append-only semantics; do not expose update/delete operations.
- Add the transaction-bound Audit writer to `AccessControlUnitOfWorkContext`.
- Preserve the rule that every context adapter uses the same transaction client.
- Add focused Unit tests for allowed event shapes and prohibited/no-op behavior.

**Exit criteria:** Application depends only on its own types and ports; no Prisma or NestJS dependency leaks into Domain/Application.

### 7.3 — Prisma persistence and database protection

- Add the approved Audit schema and a forward-only Prisma migration.
- Implement the transaction-bound Prisma writer and explicit event/payload mapping.
- Add indexes for the actual tenant-scoped read patterns chosen by the approved reader policy.
- Enforce append-only behavior below the Application layer. Evaluate database triggers and runtime database-role privileges together; a write-only repository alone is not sufficient proof.
- Do not use cascading deletion that silently removes audit history.
- Validate tenant ownership for polymorphic targets in Application; a `targetType + targetId` pair alone cannot enforce tenant ownership with a foreign key.

**Exit criteria:** migration is applied in an isolated test database; persistence, rollback, tenant-scope, and immutability behavior have Integration coverage.

### 7.4 — Atomic audit integration for successful mutations

Integrate the approved event mapping into the seven existing mutation handlers. The business write and Audit append must run within the same Unit of Work callback and transaction.

Expected state-transition rules:

| Handler operation | Event behavior |
| --- | --- |
| Create Role | Record `ROLE_CREATED`; capture the resulting Role identity and approved initial-state fields. |
| Update Role | Record `ROLE_UPDATED` for actual detail changes and permission add/remove events for actual set differences. No event for a no-op. |
| Archive Role | Record `ROLE_ARCHIVED` only for ACTIVE → ARCHIVED. |
| Assign Role | Record `ROLE_ASSIGNED` with the target membership and scope. |
| Revoke Role | Record `ROLE_REVOKED` only for an actual active → revoked transition. |
| Set Permission Override | Record CREATED or UPDATED with the actual previous and new effect. No event for the same effect. |
| Remove Permission Override | Record REMOVED only when an existing Override is actually deleted. |

The precise payload fields and the Role-creation Permission event cardinality remain subject to 7.1.

**Exit criteria:** tests prove mutation + Audit atomicity, rollback on Audit failure, correct before/after data, and absence of duplicate events for idempotent calls.

### 7.5 — Selected authorization-denial events

- Define the precise sensitive denial cases and safe reason codes.
- A denial thrown inside the mutation Unit of Work rolls that transaction back. If the approved policy requires persisting a denial, its persistence strategy must therefore be independent of the failed business transaction.
- Any best-effort denial writer must never replace, hide, or mutate the original authorization exception if Audit persistence fails.
- Do not include raw request bodies, secrets, arbitrary exception messages, or unvalidated target identifiers.

**Exit criteria:** tests prove that the original denial is preserved even when denial-event persistence fails, and only approved denial cases are recorded.

### 7.6 — Audit reading, authorization, and retention

- Implement tenant-scoped Audit queries only after the reader permission and scope policy are approved.
- Authorization must be checked for the specific requested Organization; do not assume that a user has one global/default Organization.
- Define whether read access is Organization-wide or additionally Branch-scoped.
- Implement the approved retention and operational purge/archive rules without making normal application records mutable.
- Record retention and reader authorization in the architecture decisions/status documents.

**Exit criteria:** cross-tenant read tests, authorization tests, pagination/order tests, and retention-policy tests pass.

### 7.7 — Hardening and Phase acceptance

- Verify append-only behavior for UPDATE, DELETE, and TRUNCATE paths supported by the database privilege model.
- Verify all event types and payload allow-lists.
- Verify no credential or secret fields are captured.
- Run focused Access Control Unit and PostgreSQL Integration suites, TypeScript, lint, Prettier, diff checks, and production build.
- Record exact command output and known limitations in `IMPLEMENTATION-STATUS.md`.
- Obtain project-owner review before closing Phase 7.

## 5. Open decisions — owner approval required

These items are explicitly unresolved by ADR-014 and must be decided during Phase 7. Until then, implementation must not assume values.

1. **Retention:** required retention duration, archive/purge schedule, legal-hold needs, and which operational process may purge expired records. No arbitrary 12-month, 7-year, or indefinite period is approved by current documents.
2. **Audit-reader authorization:** permission code (including whether a dedicated `organization.audit.read` permission is required), which roles receive it, delegability, Organization/Branch scope, and whether readers may inspect actor/subject identifiers.
3. **Reference lifecycle:** whether actor/Organization/Branch/subject IDs use foreign keys with `RESTRICT` or `SET NULL`, or are retained as historical scalar identifiers. `CASCADE` must not silently erase audit history.
4. **Denial event selection:** which high-signal Access Control denials are persisted, and whether writes are best-effort.
5. **Role creation event cardinality:** whether initial RolePermission links are represented in the `ROLE_CREATED` after-state only or also as individual `ROLE_PERMISSION_ADDED` events.
6. **Correlation propagation:** exact Application command metadata contract and later HTTP adapter handoff from the existing `request.id`.

## 6. Explicit non-goals

Unless a separate requirement and accepted ADR justify otherwise, Phase 7 will not introduce:

- Event Sourcing or a generic event bus.
- A generalized policy or audit framework for every bounded context.
- Permanent records for every successful authorization check.
- Generic serialization of whole entities or command payloads.
- A Redis queue or external side effect for atomic mutation Audit writes.
- A retention duration or audit-reader permission chosen without project-owner approval.

## 7. Immediate next step

Complete 7.1 by reviewing the event payload matrix and resolving the owner decisions needed before schema/migration work. Then add the Domain/Application Audit contract and transaction-bound writer before wiring the seven mutation handlers.
