# Access Control — Architectural Decision Records

| Attribute              | Value                         |
| ---------------------- | ----------------------------- |
| Project                | `tarkhineh-backend`           |
| Document version       | 1.4                           |
| Last updated           | 2026-11-01                    |
| Architecture reference | `MASTER-ARCHITECTURE.md` v1.3 |
| Implementation status  | `IMPLEMENTATION-STATUS.md`    |

This document is the decision log for the Access Control bounded context. Each ADR records the context, the decision, and its consequences. Accepted decisions are binding implementation constraints. They must not be silently changed. If later evidence or a product requirement requires a change, add a new ADR that explicitly supersedes the affected decision and obtain project-owner approval before implementing the change.

**Status conventions**

- **ACCEPTED** — approved architectural decision.
- **ACCEPTED — SCHEMA IMPLEMENTED** — approved decision implemented in the PHASE 2 database schema and migration.
- **IMPLEMENTED — AWAITING PROJECT-OWNER APPROVAL** — PHASE 3 implementation and verification are recorded, but formal phase approval has not yet been granted.

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

**Status:** IMPLEMENTED — AWAITING PROJECT-OWNER APPROVAL IN PHASE 3
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
- Formal PHASE 3 closure remains subject to project-owner approval.

---

## Implementation notes and outstanding decisions

This section summarizes implementation facts without changing the decision status of the ADRs above.

### PHASE 2 implementation notes

The following items were implemented and verified during PHASE 2:

1. `Role.isAssignable` is persisted. `ORGANIZATION_OWNER` is configured with `isAssignable = false` and protected by `Role_reserved_owner_non_assignable_check`.
2. Permission `name` and `description` columns were removed after a targeted consumer audit. Localized metadata is source-controlled in the Permission Registry rather than persisted in the Permission table.
3. A forward migration was used instead of a database reset. Migration `20261101075730_access_control_schema_v2` was applied and verified on both `tarkhineh_test` and `tarkhineh_db`.

### Decisions deferred to later phases

The following topics remain open and must be resolved in their relevant implementation phases:

1. **Identity status integration — PHASE 8:** determine how `User.status` is enforced for authenticated and non-HTTP operations without transferring Identity lifecycle ownership to Access Control.
2. **Audit retention and access — PHASE 7:** define retention requirements and which principals may read audit records.
3. **Concurrency semantics — PHASES 5–6:** define transaction and locking behavior for delegation validation, Role assignment, and sensitive access mutations.
4. **Database guard behavior tests — PHASE 6:** add integration tests for rejected cross-scope/cross-tenant writes and immutable Role ownership.
5. **Backup recovery drill:** restore the development database backup into an isolated database before treating the backup process as recovery-tested.
6. **Deferred unrelated Integration failure:** investigate the Outbound Email retry/lease Integration failure separately. It is not an Access Control defect and must not be masked by changes in this context.

For the current phase status, exact verification results, and known limitations, see `IMPLEMENTATION-STATUS.md`.
