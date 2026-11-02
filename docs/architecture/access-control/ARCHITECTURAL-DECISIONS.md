# Access Control — Architectural Decision Records

| Attribute              | Value                         |
| ---------------------- | ----------------------------- |
| Project                | `tarkhineh-backend`           |
| Document version       | 1.11                          |
| Last updated           | 2026-11-02                    |
| Architecture reference | `MASTER-ARCHITECTURE.md` v1.13 |

This document is the decision log for the Access Control bounded context. Each ADR records the context, the decision, and its consequences. Accepted decisions are binding implementation constraints. They must not be silently changed. If later evidence or a product requirement requires a change, add a new ADR that explicitly supersedes the affected decision and obtain project-owner approval before implementing the change.

**Status conventions**

- **ACCEPTED** — approved architectural decision.
- **ACCEPTED — SCHEMA IMPLEMENTED** — approved decision implemented in the PHASE 2 database schema and migration.
- **IMPLEMENTED — AWAITING PROJECT-OWNER APPROVAL** — a phase's implementation and verification are recorded, but formal phase approval has not yet been granted.
- **ACCEPTED — IMPLEMENTED** — implementation is verified and the corresponding phase has received project-owner approval.

---

## ADR-001 — Use Scoped RBAC as the v1 authorization model

**Status:** ACCEPTED
**Decision owner:** Project owner
**Date:** 2026-11-01

### Context

The product is a multi-organization, multi-branch application. It needs role-based permission composition, explicit authorization scope, targeted exceptions, and controlled delegation. A general-purpose policy engine would add complexity that is not required by the v1 use cases.

### Decision

Use **Scoped Role-Based Access Control (Scoped RBAC) with Permission Overrides and Controlled Delegation**.

### Consequences

- Roles and their Permission links are the primary mechanism for composing grants.
- Organization, Branch, membership, and Permission target scope must be explicit in authorization decisions.
- Permission Overrides provide targeted exceptions to role-derived grants.
- Delegation rules constrain which permissions an actor may grant to another principal.
- V1 does not include ABAC, wildcard permissions, role hierarchy, Event Sourcing, or an external/general-purpose policy engine.

---

## ADR-002 — A User may belong to multiple Organizations

**Status:** ACCEPTED
**Decision owner:** Project owner
**Date:** 2026-11-01

### Context

A person may work with more than one Organization and may hold different roles in each Organization.

### Decision

Support multiple `OrganizationMembership` records for one `User`. Every authorization operation must be evaluated in an explicit target Organization context.

### Consequences

- Effective permissions are calculated through the membership relevant to the requested Organization.
- Data-access queries must preserve the relationship between the User, membership, and target tenant.
- Cross-tenant Role or Permission leakage is a security defect.
- Tenant-isolation tests must include distinct Organizations and memberships.

---

## ADR-003 — Keep the three scope concepts independent

**Status:** ACCEPTED
**Decision owner:** Project owner
**Date:** 2026-11-01

### Context

The earlier design reused Organization Management's `MembershipScope` for Role assignment and used a separate Role scope to represent ownership. Permission definitions also had a scope. These concepts describe different things and must not share one enum or meaning.

### Decision

Maintain three independent scope concepts:

1. `RoleDefinitionScope`: `SYSTEM` or `ORGANIZATION` — who owns/defines a Role.
2. `RoleAssignmentScope`: `ORGANIZATION` or `BRANCH` — which membership type can receive a Role.
3. `PermissionTargetScope`: `ORGANIZATION` or `BRANCH` — the context in which a Permission applies.

### Consequences

- Access Control owns its `RoleAssignmentScope` and does not depend on Organization Management's `MembershipScope` enum for Role assignment semantics.
- Role ownership is independent from the membership receiving the Role.
- Permission target scope is independent from both Role ownership and Role assignment scope.
- Scope compatibility is an authorization invariant. It must be enforced by Domain/Application rules and supported by database constraints where appropriate.

---

## ADR-004 — Do not support Branch-owned Role definitions in v1

**Status:** ACCEPTED
**Decision owner:** Project owner
**Date:** 2026-11-01

### Context

The previous schema allowed Roles to be owned by `SYSTEM`, `ORGANIZATION`, or `BRANCH`. The product needs Organization-defined custom Roles that can be assigned at Branch scope, but it does not currently need each Branch to own its own Role definitions.

### Decision

Role definition ownership is limited to `SYSTEM` and `ORGANIZATION`. An Organization-owned custom Role may have either `ORGANIZATION` or `BRANCH` assignment scope.

### Consequences

- `Role` does not have a Branch ownership field in the target v1 model.
- Branch-scoped assignments are represented through `BranchMembership`.
- An Organization-owned custom Role assigned at Branch scope may only be used in Branches owned by that same Organization.
- Introducing Branch-owned Role definitions later requires a new ADR and a review of scope, ownership, and tenant-isolation rules.

---

## ADR-005 — System Roles and custom Roles have different ownership rules

**Status:** ACCEPTED
**Decision owner:** Project owner
**Date:** 2026-11-01

### Context

The application needs stable built-in Roles as well as tenant-specific Role composition. These categories have different ownership and lifecycle rules.

### Decision

- System Roles are defined by application code and synchronized by the system Seed.
- Each Organization may define custom Roles owned by that Organization.
- An Organization-owned Role cannot be assigned or used in another Organization.
- Customers may compose Roles from known Registry permissions, but cannot invent Permission codes.

Initial System Roles:

| Role                 | Definition scope | Assignment scope |
| -------------------- | ---------------- | ---------------- |
| `ORGANIZATION_OWNER` | `SYSTEM`         | `ORGANIZATION`   |
| `BRANCH_MANAGER`     | `SYSTEM`         | `BRANCH`         |

### Consequences

- System Roles are not customer-owned records.
- Custom Role operations must enforce Organization ownership.
- The system Seed must not delete or overwrite Organization-defined custom Roles.
- System Role Permission sets must be explicit, reviewed, and source-controlled.

---

## ADR-006 — `ORGANIZATION_OWNER` is a reserved Role

**Status:** ACCEPTED
**Decision owner:** Project owner
**Date:** 2026-11-01

### Context

Organization ownership is represented by `Organization.ownerUserId`, while the owner also needs a corresponding privileged Role. Generic Role Assignment must not be able to create an inconsistent or unauthorized ownership state.

### Decision

`ORGANIZATION_OWNER` cannot be assigned through the generic public Role Assignment workflow. Initial owner creation and ownership transfer must use dedicated use cases. The Organization owner reference and the corresponding Role assignment must be updated atomically by the appropriate workflow.

### Consequences

- Generic Role Assignment must reject `ORGANIZATION_OWNER`, even if the actor has ordinary Role assignment authority.
- `Role.isAssignable` is the persisted representation. The System Role is configured with `isAssignable = false`.
- The database constraint `Role_reserved_owner_non_assignable_check` prevents this reserved Role from being made assignable.
- Owner transfer requires dedicated authorization, audit records, and transaction design.

---

## ADR-007 — Organization Roles may grant Branch permissions across the Organization

**Status:** ACCEPTED
**Decision owner:** Project owner
**Date:** 2026-11-01

### Context

Central Organization administrators need to operate across the Organization's Branches without requiring a separate `BranchMembership` for every Branch.

### Decision

An active `OrganizationMembership` with an Organization-assigned Role may receive Branch-target permissions across all active Branches belonging to that same Organization.

A Branch-assigned Role remains limited to the corresponding active `BranchMembership` and its Branch.

### Consequences

- `BranchMembership` is not required for Branch access inherited from an active Organization-level Role.
- The status of a `BranchMembership` controls assignments attached to that membership; it does not by itself revoke permissions inherited from an active Organization Role.
- A Branch-specific `DENY` override is used when an Organization member must be denied access to one Branch despite an inherited Organization-level grant.
- Branch-target authorization must validate Branch ownership and active Branch status.

---

## ADR-008 — Explicit `DENY` overrides `ALLOW`

**Status:** ACCEPTED
**Decision owner:** Project owner
**Date:** 2026-11-01

### Context

An Organization may grant broad permissions through Roles and still need to create a specific exception for one member and one Branch.

### Decision

A matching explicit `DENY` override takes precedence over all matching `ALLOW` sources, including Organization Role grants, Branch Role grants, and `ALLOW` overrides.

Global context validation must happen before override evaluation. An `ALLOW` override cannot bypass an inactive Organization, inactive Organization membership, inactive Branch, unknown Permission, or invalid scope.

### Consequences

- Permission evaluation order must be deterministic.
- `DENY` is a restrictive exception and cannot grant access.
- Creating an `ALLOW` override requires valid delegation authority for the Permission and target context.
- Tests must cover `DENY` precedence against each supported grant source.

---

## ADR-009 — Scope Permission Overrides by OrganizationMembership, Branch, and Permission

**Status:** ACCEPTED — SCHEMA IMPLEMENTED IN PHASE 2
**Decision owner:** Project owner
**Date:** 2026-11-01

### Context

The previous `UserPermissionOverride` model was tied to `BranchMembership`. An Organization administrator may inherit Branch permissions without having a `BranchMembership`, but may still need a Branch-specific exception.

### Decision

A Permission Override is associated with:

- `OrganizationMembership`;
- `Branch`;
- `Permission`;
- the actor recorded as `assignedBy`;
- an effect of `ALLOW` or `DENY`.

The logical uniqueness key is `(organizationMembershipId, branchId, permissionId)`. The membership and Branch must belong to the same Organization.

### Consequences

- An Organization member without a `BranchMembership` may receive a Branch-specific `DENY` or `ALLOW` override.
- Composite foreign keys and relations enforce shared Organization ownership where supported by the schema.
- Target-scope validation and delegation remain application responsibilities.
- PHASE 2 implemented this relation model around `OrganizationMembership + Branch + Permission` through the approved forward migration.

---

## ADR-010 — Permission codes are source-controlled; Organizations compose but do not invent permissions

**Status:** ACCEPTED
**Decision owner:** Project owner
**Date:** 2026-11-01

### Context

Permission behavior must be known and enforceable by backend code. Allowing tenants to invent arbitrary Permission strings would create authorization semantics that the application cannot reliably validate.

### Decision

Permission codes and their metadata are defined in the application Permission Registry. Organization administrators may compose custom Roles from known Registry permissions, subject to scope and delegation rules, but may not create new Permission codes.

The source-controlled Registry is the metadata source of truth. The database stores stable Permission identity/code and relation data.

### Consequences

- Permission codes are stable application contracts.
- Renaming or retiring a code requires a deliberate compatibility and data-retirement plan.
- PHASE 2 removed Permission `name` and `description` columns through the approved forward migration after a targeted consumer audit.
- PHASE 3 formalized the source-code catalog as the Registry, including localized metadata.
- Seed synchronizes known Permission codes but must not delete historical or referenced Permission rows as part of ordinary synchronization.

---

## ADR-011 — Permission metadata includes explicit delegability

**Status:** ACCEPTED
**Decision owner:** Project owner
**Date:** 2026-11-01

### Context

Having permission to perform an operation does not automatically mean having authority to grant that permission to another principal.

### Decision

Every Permission definition includes an explicit `delegable` boolean. Missing or unspecified delegability must never be interpreted as permission to delegate.

### Consequences

- Custom Role creation and update must validate every attached Permission against the actor's delegation authority.
- Role assignment must validate the complete Permission set of the target Role.
- Creating an `ALLOW` override must validate delegation authority.
- A generic Role-management Permission alone does not authorize granting arbitrary privileges.
- The PHASE 3 Registry explicitly marks all 23 definitions as delegable or non-delegable; the exact policy is recorded in ADR-019.

---

## ADR-012 — Controlled delegation is required to prevent privilege escalation

**Status:** ACCEPTED
**Decision owner:** Project owner
**Date:** 2026-11-01

### Context

An administrator must not be able to grant permissions beyond the authority they are allowed to delegate.

### Decision

For Role assignment, validate both the operation authority and the actor's authority to delegate every Permission in the target Role.

Conceptually:

```text
Permissions(Role being assigned)
    ⊆
Actor's Delegable Effective Permissions
```

The same delegation principle applies to Role creation, Role Permission changes, and `ALLOW` overrides. A `DENY` override is restrictive: it requires authority to manage overrides in the relevant scope and must not grant access.

### Consequences

- Delegation is enforced by Application use cases and supported by Domain rules.
- Assignment and Permission modification must use appropriate transaction/concurrency controls when authority could change between validation and write.
- Reserved Roles have additional protections.
- PHASE 3 defines Permission-level delegability metadata; actual actor-specific delegation evaluation is implemented in later phases.

---

## ADR-013 — Role lifecycle uses `ACTIVE` and `ARCHIVED`

**Status:** ACCEPTED
**Decision owner:** Project owner
**Date:** 2026-11-01

### Context

Hard-deleting Roles would damage assignment history and audit context.

### Decision

Roles have `ACTIVE` and `ARCHIVED` lifecycle states. Archived Roles cannot be newly assigned and do not contribute permissions to subsequent authorization decisions. Historical records remain persisted.

### Consequences

- Archiving is a lifecycle operation, not physical deletion.
- Permission evaluation must exclude archived Roles.
- Existing assignment history is retained.
- The PHASE 3 system Seed refuses to synchronize an already archived managed System Role and requires manual intervention instead of silently changing its lifecycle state.

---

## ADR-014 — Sensitive Access Control mutations require append-only audit records

**Status:** ACCEPTED
**Decision owner:** Project owner
**Date:** 2026-11-01

### Context

The product must be able to determine who changed access, for whom, in which Organization or Branch context, and when.

### Decision

Maintain dedicated append-only Access Control audit records for sensitive Role, RolePermission, RoleAssignment, and PermissionOverride mutations. The business mutation and its audit write must be atomic.

### Consequences

- Audit is a dedicated Access Control responsibility, implemented in PHASE 7.
- Credentials and unnecessary secrets must not be logged.
- Successful permission checks are not permanently recorded by default.
- Retention policy and audit-reader authorization are finalized in PHASE 7.

---

## ADR-015 — Do not introduce long-lived authorization caching in v1

**Status:** ACCEPTED
**Decision owner:** Project owner
**Date:** 2026-11-01

### Context

Role revocation, membership suspension, and `DENY` changes must affect subsequent requests reliably.

### Decision

Do not introduce long-lived authorization caching in v1. Optimize targeted PostgreSQL queries and indexes first.

### Consequences

- Subsequent authorization decisions use current authoritative state.
- Caching may be reconsidered only when reliable invalidation exists for all relevant Role, assignment, membership, and override changes.
- Sensitive check-then-write operations still require transaction/concurrency design.

---

## ADR-016 — Keep bounded-context ownership and Clean Architecture boundaries explicit

**Status:** ACCEPTED
**Decision owner:** Project owner
**Date:** 2026-11-01

### Context

Identity, Organization Management, and Access Control are separate bounded contexts with distinct lifecycle and business responsibilities.

### Decision

- Identity Access owns `User` and authentication lifecycle.
- Organization Management owns `Organization`, `Branch`, and membership lifecycles.
- Access Control owns Roles, Permissions, assignments, overrides, authorization decisions, and Access Control audit records.
- Domain code must not depend on NestJS, Prisma, Redis, or HTTP.
- Application code depends on ports/contracts, not Prisma models.
- Infrastructure implements the required ports.
- HTTP transport must not own business rules or delegation policy.
- Circular bounded-context dependencies are not permitted.

### Consequences

- Cross-context facts are consumed through explicit ports or read adapters.
- The modular monolith may use carefully bounded Prisma read adapters against shared tables where justified.
- The exact Identity/Organization integration strategy is completed in PHASE 8.

---

## ADR-017 — Avoid overengineering in v1

**Status:** ACCEPTED
**Decision owner:** Project owner
**Date:** 2026-11-01

### Context

The system must support the approved product capabilities without introducing a generalized framework that is difficult to understand, maintain, or operate.

### Decision

Do not implement role hierarchy, wildcard permissions, ABAC, a general-purpose policy engine, a distributed authorization service, Event Sourcing, or long-lived authorization caching in v1 unless a concrete product requirement is approved.

### Consequences

- Prefer direct, readable models and focused use cases.
- Introduce abstractions only where there is a clear invariant, responsibility, and consumer.
- Revisit these exclusions only through a documented ADR when product requirements change.

---

## ADR-018 — Use repository documents as the project source of truth

**Status:** ACCEPTED
**Decision owner:** Project owner
**Date:** 2026-11-01

### Context

Long-running development may span multiple tools, sessions, and contributors. Conversational context alone is not a durable record of architecture or implementation state.

### Decision

The following repository documents are the durable source of truth:

- `MASTER-ARCHITECTURE.md` — approved architecture, constraints, and roadmap.
- `IMPLEMENTATION-STATUS.md` — verified repository state, phase status, command results, limitations, and exact next step.
- `ARCHITECTURAL-DECISIONS.md` — decision history, rationale, and supersession relationships.

Git records code and documentation changes. Chat history and assistant memory are auxiliary only.

### Consequences

- Update implementation status after each meaningful development checkpoint.
- Record accepted architectural changes as ADRs.
- New development sessions should begin by reviewing all three documents.
- Do not use conversational memory as the only record of project decisions or verification results.

---

## ADR-019 — Explicit Permission Registry metadata and System Role grants

**Status:** ACCEPTED — IMPLEMENTED (PHASE 3 APPROVED 2026-11-01)
**Decision owner:** Project owner
**Date:** 2026-11-01

### Context

The architecture requires stable source-controlled Permission semantics, explicit delegation authority, and predictable built-in Role grants. Dynamically granting every catalog Permission to `ORGANIZATION_OWNER` would silently expand its privileges whenever a new Permission was added to the catalog.

### Decision implemented

#### Permission Registry

- Preserve all 18 existing Permission codes and add exactly five:
  - `organization.roles.read`
  - `organization.roles.create`
  - `organization.roles.update`
  - `organization.roles.archive`
  - `organization.members.permissions.manage`
- Keep `organization.roles.assign` as an existing code; do not rename or recreate it under a new code.
- Define every Registry entry with localized English and Persian name/description, `targetScope`, `resource`, `action`, and explicit `delegable` metadata.
- Define 16 ORGANIZATION-target permissions and 7 BRANCH-target permissions.
- Define 16 delegable permissions:
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
- Define the remaining seven permissions as non-delegable:
  - `organization.update`
  - `organization.branches.suspend`
  - `organization.members.remove`
  - `organization.roles.create`
  - `organization.roles.update`
  - `organization.roles.archive`
  - `organization.members.permissions.manage`
- Define `organization.members.permissions.manage` with ORGANIZATION target scope, resource `organization.members.permissions`, action `MANAGE`, and `delegable = false`.

#### Explicit System Role permission sets

- Give `ORGANIZATION_OWNER` an explicit static set of all 23 approved Permission codes. It remains ORGANIZATION-assigned and non-assignable.
- Give `BRANCH_MANAGER` an explicit static set of the seven Branch-target permissions. It remains BRANCH-assigned and assignable.
- Do not derive either System Role permission set dynamically from the full Permission Registry.
- `isAssignable` describes whether a Role may be assigned; it does not replace operation authority, target-scope validation, or delegation checks in later Application use cases.

#### Seed synchronization and safety

- Synchronize the Permission Registry and the two managed System Roles inside one caller-owned Prisma interactive transaction.
- Validate all existing managed System Roles before the first write. Fail if either managed Role is archived, has unexpected `assignmentScope`, or unexpectedly belongs to an Organization.
- Upsert source-controlled Permission codes.
- Create or update only the two known `SYSTEM` Roles.
- Replace `RolePermission` links only for the exact IDs of those two managed System Roles.
- Preserve existing System Role lifecycle status; the Seed does not silently reactivate an archived Role.
- Never delete Permission rows or modify Organization-defined custom Roles, `RoleAssignment` records, or `UserPermissionOverride` records.
- Keep the synchronizer transaction-agnostic: its caller must provide the interactive transaction and own commit/rollback.

### Consequences

- Adding a Permission does not silently expand either System Role.
- Permission metadata has one source-controlled definition; Seed reads `PERMISSION_DEFINITIONS` from the Registry.
- Delegability metadata is available for the later Application use cases; actor-specific delegation evaluation is not implemented by this ADR or by the PHASE 3 Seed.
- Historical Permission rows are retained. Permission retirement requires a separate compatibility and data-retirement plan.
- The synchronizer intentionally does not open a nested transaction.
- PHASE 3 implementation results and limitations are recorded in `IMPLEMENTATION-STATUS.md` and the PHASE 3 section of `MASTER-ARCHITECTURE.md`.
- PHASE 3 was formally approved by the project owner on 2026-11-01.

---

## ADR-020 — Application mutations use a transaction-owning Access Control Unit of Work

**Status:** ACCEPTED — IMPLEMENTED (PHASE 5 APPROVED BY PROJECT OWNER 2026-11-01)
**Decision owner:** Project owner
**Date:** 2026-11-01

### Context

Access Control mutation use cases combine authorization evaluation, tenant/target reads, delegation checks, and persistence writes.

Performing authorization and mutation through independently acquired persistence paths creates a check-then-write window. It can also allow a future adapter to manage its own transaction, making it unclear whether authorization reads and writes share a transaction.

The Application layer must define a transaction boundary without depending on Prisma or another Infrastructure implementation.

### Decision implemented in PHASE 5

Introduce the Application port `AccessControlUnitOfWork`.

- `AccessControlUnitOfWork` owns the lifecycle of one operation's transaction: begin, commit on successful callback completion, and rollback when the callback throws.
- The Unit of Work supplies an `AccessControlUnitOfWorkContext` containing transaction-bound instances of:
  - `AuthorizationSnapshotReader`
  - `RoleRepository`
  - `RoleAssignmentRepository`
  - `PermissionOverrideRepository`
- Every supplied port must use the same underlying transaction client.
- A repository supplied through the context must not open, commit, or roll back an independent or nested transaction.
- Mutation handlers perform authorization reads, target reads, and persistence through the supplied context.
- The callback must not perform external side effects.
- Application remains independent of Prisma; Infrastructure provides the concrete implementation.

### Concurrency and transaction guarantees

This ADR establishes the Application contract; it does not itself select a PostgreSQL isolation level or locking strategy. PHASE 6 subsequently selected and implemented the concrete Infrastructure strategy recorded in ADR-021. A transaction boundary by itself is not sufficient evidence of race-condition safety; the specific isolation and retry behavior must be verified against PostgreSQL.

Database uniqueness constraints remain authoritative for duplicate writes. Safe retry behavior is implemented in Infrastructure and reruns the complete transaction callback only for the classified conflict types. The callback remains subject to the no-external-side-effects rule.

### Consequences

- All seven PHASE 5 mutation handlers use the Unit of Work port.
- `AuthorizationApplicationService` accepts an explicitly supplied snapshot reader so command authorization can use the transaction-bound reader; query handlers may continue using the default reader.
- `UpdateRoleHandler` performs delegation validation only when `permissionCodes` is supplied, including an empty array. Metadata-only Role updates require management authority but do not re-delegate an unchanged Permission set.
- The project owner approved PHASE 5 on 2026-11-01; the Application Unit of Work contract is accepted and implemented.
- Mock-based PHASE 5 Unit tests verify the Application callback boundary only; they do not prove real database commit, rollback, transaction-client sharing, isolation, or race-condition protection.
- Concrete Prisma transaction binding, transaction-bound adapters, the initial PostgreSQL Integration tests, and NestJS provider bindings were implemented in PHASE 6. The selected transaction and retry strategy is recorded in ADR-021.
- The PHASE 6 database-guard, tenant-isolation, concurrent RoleAssignment/Role/Permission mutation, Handler-level Override, and Multi-Branch snapshot acceptance scenarios were subsequently implemented and verified. Query-plan review was completed against a small/synthetic dataset; production-scale benchmarking remains deferred as recorded in IMPLEMENTATION-STATUS.md section 8.

## ADR-021 — Use Serializable Prisma transactions and bounded retry for Access Control mutations

**Status:** IMPLEMENTED — ACCEPTED BY PROJECT OWNER (PHASE 6 CLOSED 2026-11-02)
**Decision owner:** Project owner
**Date:** 2026-11-01

### Context

PHASE 5 introduced an Application-owned Unit of Work contract so authorization reads, delegation checks, target reads, and persistence writes for a mutation could share one transaction boundary. The Infrastructure implementation needed a concrete PostgreSQL strategy for sensitive check-then-write operations without leaking Prisma dependencies into Application or Domain.

The repository also has a database-enforced unique key for Permission Overrides. Two concurrent requests can both observe that the logical key is absent before either attempts an insert. A transaction and a pre-insert lookup alone do not remove this race.

### Decision implemented in PHASE 6

1. Each Access Control mutation is executed by one Prisma interactive transaction at `Serializable` isolation. The concrete Role, RoleAssignment, PermissionOverride, and transaction-bound AuthorizationSnapshotReader adapters are constructed with the same `Prisma.TransactionClient`.
2. Standalone authorization snapshot reads use one interactive transaction at `RepeatableRead`, so the Organization and Branch snapshots for that read share one database view.
3. The Unit of Work retries a Prisma `P2034` serialization/write-conflict error by rerunning the complete callback in a new transaction. The maximum is three attempts, with a short increasing delay between failed attempts.
4. The Permission Override repository classifies `P2002` as retryable only when its reported target exactly matches the composite key `(organizationMembershipId, branchId, permissionId)`. It raises an Infrastructure-only retry signal; the failed transaction is allowed to roll back, then the complete callback is retried.
5. On the final attempt, the retry signal is unwrapped and its original Prisma error is sent through the existing error translator. Other unique violations are not retried.
6. Database unique constraints remain the final authority. The retry allows the second callback to re-read the winning row and apply the existing idempotent behavior; it does not replace or weaken the constraint.

### Consequences

- Mutation authorization reads and writes execute under one Serializable Prisma transaction client.
- Serialization conflicts and the one explicitly classified Permission Override unique-key race can restart the full operation.
- The transaction callback must not send email, publish messages, or perform other external side effects because a retry may execute it more than once.
- A retry always starts a new transaction; the failed PostgreSQL transaction is never reused after a unique violation.
- Unrelated P2002 errors continue through normal error translation and are not silently treated as idempotent success.
- The project owner formally approved PHASE 6 on 2026-11-02. The duplicate RoleAssignment, Role/Permission mutation, cross-tenant guard, Handler-level concurrency, and Multi-Branch acceptance scenarios are recorded as implemented and verified in IMPLEMENTATION-STATUS.md section 8.
- Full application boot, the full-project Integration suite review, and production-scale query benchmarking remain explicitly accepted deferred verification items; Phase 6 approval does not claim those checks were completed.

## ADR-022 — Retain Access Control audit records without automatic deletion

**Status:** ACCEPTED  
**Decision owner:** Project owner  
**Date:** 2026-11-02

### Context

ADR-014 requires dedicated append-only Audit records for sensitive Access Control mutations and assigns retention policy to PHASE 7. The project owner has decided that these records must remain available as database history and must not be automatically deleted under the initial implementation policy.

### Decision

For the initial Access Control Audit implementation:

1. Store Audit events as ordinary persistent records in the database.
2. Retain created Audit records indefinitely under the current policy; do not assign an automatic expiry date.
3. Do not implement TTL, scheduled deletion, retention purge, or automatic cleanup of Audit records.
4. Do not expose Audit record update/delete operations through the Access Control Application ports or normal application workflows. This is consistent with ADR-014's append-only requirement.
5. Any future change that permits deletion or purge, or introduces an archival/tiering policy, must be proposed as a new explicit project-owner decision and documented before implementation. This ADR does not authorize an operator or application job to remove existing records.
6. This decision does not claim that database administrators are technically incapable of altering storage outside the application. Database-level immutability protections and operational controls remain part of Phase 7 implementation and verification.

### Consequences

- Audit records remain available as historical database records rather than expiring diagnostic logs.
- No retention duration, TTL column, cleanup scheduler, or purge process is required by the initial schema. No archival/tiering policy is established by this ADR; it remains outside the current decision.
- Audit write paths remain append-only. Read access is a separate authorization concern and is not granted by this ADR.
- The owner may revisit the policy later through a documented decision; until then, no automatic or routine deletion is permitted.
- This decision resolves the retention item from ADR-014 for the initial implementation. Audit-reader authorization, denial-event selection, reference lifecycle, Role creation event cardinality, and correlation-ID propagation remain separate PHASE 7 design decisions.

---

## ADR-023 — Preserve Audit references as immutable historical identifiers

**Status:** ACCEPTED  
**Decision owner:** Project owner (delegated technical decision)  
**Date:** 2026-11-02

### Context

Access Control Audit records must remain available as historical evidence independently of the lifecycle of User, Organization, Branch, Membership, Role, and Permission records owned by the existing bounded contexts or operational tables.

The current Prisma schema uses lifecycle-dependent foreign-key actions in several places:

- `CASCADE` removes dependent records when a parent is deleted.
- `SET NULL` changes the referencing row when its parent is deleted.
- `RESTRICT` prevents deletion while dependent rows exist.

Those behaviors are useful for ordinary relational aggregates, but are not appropriate as direct lifecycle coupling for an append-only Audit record. Audit must neither disappear with an operational record nor be silently rewritten by referential actions. It must also avoid taking ownership of the lifecycle of Identity and Organization Management records.

### Decision

For the initial Access Control Audit model, all references to lifecycle-owned operational records are stored as **historical scalar identifiers, not relational foreign keys**.

This applies to:

- `actorUserId`
- `organizationId`
- `branchId`
- Subject/target identifiers such as OrganizationMembership and BranchMembership IDs.
- Resource identifiers such as Role, RoleAssignment, PermissionOverride, and Permission IDs/codes.

The initial data contract follows these rules:

1. Successful Access Control mutation Audit events must contain a trusted Actor ID and the exact Organization ID taken from the already-authorized operation. Branch ID is present when the operation is Branch-scoped.
2. `organizationId` is a required tenant partition/scope key for stored Access Control Audit events. It is not a foreign key.
3. `branchId` and subject identifiers are nullable when they do not apply to the event. They are not foreign keys.
4. `resourceType` and `resourceId` identify the affected resource. They are historical identifiers, not polymorphic foreign keys.
5. The initial Phase 7 policy records only the identifiers and allow-listed event snapshots needed to explain the security-relevant change. It does not copy User email, display name, credentials, or unrelated personal attributes into Audit payloads by default.
6. A selected `AUTHORIZATION_DENIED` event may be persisted only when the actor is authenticated and the Organization context is validated. Denials without a trusted Actor or validated tenant context are not written to this tenant-scoped Audit table; they remain subject to the application's separate operational/security logging policy.
7. The Application layer validates tenant ownership and target consistency before appending an event. For successful mutation events, the event is constructed from the same transaction-bound, already-validated entities used by the mutation.
8. Every Audit read is scoped by the requested `organizationId`; Branch-scoped reads also apply the approved Branch scope. Cross-tenant read isolation must be tested.
9. No direct Prisma relations or inverse collection fields are added to User, Organization, Branch, or Membership models merely for Audit references.

### Rationale

- Historical identifiers remain present if their original operational rows are later removed.
- No foreign-key action can cascade-delete or mutate an Audit row.
- Audit does not block normal lifecycle operations in Identity or Organization Management.
- Audit can preserve a stable reference to a historical target even when the live target no longer exists.
- Tenant safety is explicit in the Application write/read contracts and PostgreSQL Integration tests rather than being implied by a cross-context relation.

The PostgreSQL documentation defines the semantics of `CASCADE`, `RESTRICT`, and `SET NULL`: these actions respectively delete referencing rows, block deletion, or update referencing columns. The selected scalar-reference design avoids applying those lifecycle actions to immutable historical records. The absence of a foreign key is intentional and must be compensated by the validation and tenant-isolation rules above.

### Consequences

- The Audit Prisma model must not declare relations to User, Organization, Branch, OrganizationMembership, BranchMembership, Role, RoleAssignment, PermissionOverride, or Permission.
- The schema must use scalar string ID columns and explicit tenant/resource indexes selected from the approved query patterns.
- Application writers must not accept arbitrary target IDs from untrusted input; they must use IDs from trusted command context and validated transaction-bound reads.
- Audit readers must always filter by Organization ID and, where applicable, Branch ID. A missing or mismatched tenant scope must never fall back to a global read.
- Integration tests must demonstrate that deleting or changing a referenced operational row cannot remove or rewrite the Audit record, and that a user in one Organization cannot read another Organization's Audit events.
- The design intentionally trades database-enforced referential integrity to operational rows for historical independence. Application validation and explicit tests are mandatory, not optional.
- This ADR resolves the historical reference lifecycle decision for Phase 7. Audit-reader authorization, denial-event selection, Role creation event cardinality, and correlation-ID propagation remain separate open decisions.

---

## Implementation notes and outstanding decisions

This section summarizes implementation facts without changing the decision status of the ADRs above.

### PHASE 2 implementation notes

The following items were implemented and verified during PHASE 2:

1. `Role.isAssignable` is persisted. `ORGANIZATION_OWNER` is configured with `isAssignable = false` and protected by `Role_reserved_owner_non_assignable_check`.
2. Permission `name` and `description` columns were removed after a targeted consumer audit. Localized metadata is source-controlled in the Permission Registry rather than persisted in the Permission table.
3. A forward migration was used instead of a database reset. Migration `20261101075730_access_control_schema_v2` was applied and verified on both `tarkhineh_test` and `tarkhineh_db`.

### PHASE 4 implementation notes

PHASE 4 implemented the Domain model using the previously accepted architecture and decisions. No new architectural decision was introduced and no accepted ADR was superseded.

The implementation includes:

1. Role, RoleAssignment, and PermissionOverride Domain models and invariants.
2. Permission Registry lookup and Role permission-scope compatibility.
3. AuthorizationDecision and a pure snapshot-based PermissionEvaluator.
4. A Domain delegation policy for Role composition, Role assignment, and ALLOW/DENY overrides.

Observed verification on 2026-11-01:

- Access Control Domain: 148 tests passed across 6 files.
- Full Unit suite: 846 tests passed across 68 files.
- TypeScript and production build completed successfully.
- Domain lint reported zero warnings and zero errors.
- Prettier check passed for the Domain TypeScript files.

No Prisma schema, migration, database, Application, Infrastructure, or HTTP changes were part of PHASE 4. The project owner formally approved PHASE 4 on 2026-11-01.

### Decisions deferred to later phases

The following topics remain open and must be resolved in their relevant implementation phases:

1. **Identity status integration — PHASE 8:** determine how `User.status` is enforced for authenticated and non-HTTP operations without transferring Identity lifecycle ownership to Access Control.
2. **Audit-reader authorization — PHASE 7:** define which principals may read Audit records, the dedicated permission/scope behavior, delegability, and visibility of actor/subject identifiers. Retention is resolved by ADR-022; historical reference lifecycle is resolved by ADR-023.
3. **Selected denial-event policy — PHASE 7:** determine which high-signal authorization denials are persisted and whether recording is best-effort without masking the original denial.
4. **Role creation event cardinality — PHASE 7:** determine whether initial RolePermission links are represented only in ROLE_CREATED after-state or also as individual ROLE_PERMISSION_ADDED events.
5. **Correlation-ID propagation — PHASE 7 / PHASE 9:** define the Application Command metadata contract and later HTTP adapter handoff from the existing request ID.
6. **Backup recovery drill:** restore the development database backup into an isolated database before treating the backup process as recovery-tested.
7. **Deferred unrelated Integration failure:** investigate the Outbound Email retry/lease Integration failure separately. It is not an Access Control defect and must not be masked by changes in this context.
8. **Accepted PHASE 6 deferrals:** full application boot, full-project Integration-suite review, and production-scale query benchmarking remain deferred as documented in IMPLEMENTATION-STATUS.md section 8.10.

For the current phase status, exact verification results, and known limitations, see `IMPLEMENTATION-STATUS.md`.
