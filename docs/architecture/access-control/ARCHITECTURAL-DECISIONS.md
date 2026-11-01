# Access Control — Architectural Decision Records

| Attribute              | Value                         |
| ---------------------- | ----------------------------- |
| Project                | `tarkhineh-backend`           |
| Document version       | 1.1                           |
| Last updated           | 2026-11-01                    |
| Architecture reference | `MASTER-ARCHITECTURE.md` v1.1 |
| Status reference       | `IMPLEMENTATION-STATUS.md`    |

This log records decisions and their rationale. An accepted decision must not be silently changed during implementation. If new evidence requires a change, add a new ADR that supersedes the old one and obtain project-owner approval.

---

## ADR-001 — Use Scoped RBAC as the v1 authorization model

**Status:** ACCEPTED  
**Decision owner:** Project owner  
**Date:** 2026-11-01

### Context

The application is a multi-organization, multi-branch product. It needs role-based permissions, explicit scope, targeted exceptions, and delegation without the burden of a general policy engine.

### Decision

Use **Scoped RBAC + Permission Overrides + Controlled Delegation**.

### Consequences

- Role-to-permission composition is the primary grant mechanism.
- Scope and tenant context are explicit in authorization decisions.
- Overrides handle branch-specific exceptions.
- Delegation rules prevent privilege escalation.
- No ABAC, wildcard permissions, role hierarchy, or external policy engine in v1.

---

## ADR-002 — A user may belong to multiple organizations

**Status:** ACCEPTED  
**Date:** 2026-11-01

### Context

A user may operate in more than one Organization, potentially with different roles in each.

### Decision

Support multiple OrganizationMembership records per User. Every authorization request must include the target Organization context.

### Consequences

- Effective permissions are calculated within the requested tenant.
- Queries must join through the relevant membership and tenant identity.
- Cross-tenant role or permission leakage is a security defect.
- Tenant-isolation tests must use at least two distinct organizations.

---

## ADR-003 — Keep three scope concepts independent

**Status:** ACCEPTED  
**Date:** 2026-11-01

### Context

The previous schema reused Organization Management's `MembershipScope` as a Role assignment scope and also used a `RoleScope` enum to represent Role ownership. Permission Catalog separately had a scope field. The concepts are not interchangeable.

### Decision

Use three distinct concepts:

1. `RoleDefinitionScope`: SYSTEM or ORGANIZATION.
2. `RoleAssignmentScope`: ORGANIZATION or BRANCH; owned by Access Control.
3. `PermissionTargetScope`: ORGANIZATION or BRANCH; defined by the Permission Registry.

### Consequences

- Access Control does not depend on Organization Management's MembershipScope enum.
- Role ownership is separate from the membership target receiving a role.
- Permission target is separate from both Role ownership and assignment target.
- Scope compatibility must be validated in application/domain rules and protected by database invariants where possible.

---

## ADR-004 — Do not support branch-owned Role definitions in v1

**Status:** ACCEPTED  
**Date:** 2026-11-01

### Context

The previous schema allowed SYSTEM, ORGANIZATION, and BRANCH-owned Roles. The product needs organization-defined custom roles, including roles assignable at branch scope, but does not currently require each branch to own its own role definitions.

### Decision

Role definition ownership is limited to SYSTEM and ORGANIZATION. Organization-owned roles may be assignable at ORGANIZATION or BRANCH scope.

### Consequences

- Remove `branchId` as a Role ownership field in the target schema.
- Keep branch-scoped RoleAssignment through BranchMembership.
- An Organization custom role assigned at Branch scope is usable only in branches belonging to its owning Organization.
- Adding branch-owned roles later requires a new decision and scope/tenant design review.

---

## ADR-005 — System roles and custom roles have different ownership rules

**Status:** ACCEPTED  
**Date:** 2026-11-01

### Context

The product needs stable built-in roles and tenant-specific role composition.

### Decision

- System roles are defined by application code and seeded by the system.
- Each Organization may define custom roles owned by that Organization.
- Organization A's role cannot be assigned or used in Organization B.
- Customers cannot define arbitrary new Permission codes.

Initial system roles:

| Role                 | Definition scope | Assignment scope |
| -------------------- | ---------------- | ---------------- |
| `ORGANIZATION_OWNER` | SYSTEM           | ORGANIZATION     |
| `BRANCH_MANAGER`     | SYSTEM           | BRANCH           |

### Consequences

- System roles are not managed as customer-owned rows.
- Custom Role CRUD must enforce organization ownership.
- Seed must not delete or overwrite customer-defined roles.
- System role permission sets must be explicit and reviewed.

---

## ADR-006 — ORGANIZATION_OWNER is a reserved role

**Status:** ACCEPTED  
**Date:** 2026-11-01

### Context

The organization owner has privileged authority, and ownership is also represented by `Organization.ownerUserId`.

### Decision

`ORGANIZATION_OWNER` cannot be assigned through the generic public Role Assignment workflow. Initial owner creation and ownership transfer must use dedicated use cases. The owner reference and corresponding role assignment must be kept consistent atomically by the appropriate workflow.

### Consequences

- Generic assignment must reject this role even if an ordinary assignment permission exists.
- The final database representation (`isAssignable` or an equivalent explicit policy) remains to be finalized in PHASE 2.
- Owner transfer requires explicit authorization, audit, and transaction design.

---

## ADR-007 — Organization roles may grant branch permissions across the organization

**Status:** ACCEPTED  
**Date:** 2026-11-01

### Context

Central organization administrators need to operate across branches without requiring a separate BranchMembership for every branch.

### Decision

An active OrganizationMembership with an Organization-assigned role may receive Branch-target permissions across all active branches belonging to that same Organization.

Branch-assigned roles remain limited to the corresponding active BranchMembership and branch.

### Consequences

- BranchMembership is not required for inherited organization-level access.
- BranchMembership status controls assignments attached to that BranchMembership; it does not alone revoke permissions inherited from an active Organization role.
- A branch-specific DENY override is used when an organization member must be denied access to one branch despite inherited permission.
- Branch-target authorization must validate branch ownership and active branch status.

---

## ADR-008 — Explicit DENY overrides ALLOW

**Status:** ACCEPTED  
**Date:** 2026-11-01

### Context

An organization needs to grant broad permissions through roles but make specific user/branch exceptions.

### Decision

A matching explicit DENY override takes precedence over all ALLOW sources, including Organization role grants, Branch role grants, and ALLOW overrides.

Global context validation occurs before override evaluation; an ALLOW override cannot bypass inactive organization, inactive organization membership, inactive branch, unknown permission, or invalid scope.

### Consequences

- Evaluation order is deterministic.
- DENY is a restrictive exception.
- ALLOW can grant a specific branch permission only when actor delegation authority is valid.
- Tests must cover DENY against every grant source.

---

## ADR-009 — Scope Permission Overrides by OrganizationMembership, Branch, and Permission

**Status:** ACCEPTED — SCHEMA IMPLEMENTATION PENDING  
**Date:** 2026-11-01

### Context

The current `UserPermissionOverride` is tied to `BranchMembership`. However, an Organization administrator may have inherited branch permissions without having a BranchMembership.

### Decision

The target override is associated with:

- OrganizationMembership.
- Branch.
- Permission.
- Actor/assignedBy.
- Effect (ALLOW or DENY).

Logical uniqueness is `(organizationMembershipId, branchId, permissionId)`. The membership and branch must belong to the same Organization.

### Consequences

- An Organization member without BranchMembership can receive a branch-specific DENY or ALLOW override.
- Use composite foreign keys/relation design to enforce the shared Organization where feasible.
- Target-scope validation and delegation remain application responsibilities.
- Existing `BranchMembership.permissionOverrides` relation must be redesigned in PHASE 2.

---

## ADR-010 — Permission codes are source-controlled; organizations compose but do not invent permissions

**Status:** ACCEPTED  
**Date:** 2026-11-01

### Context

Permission behavior must be understood and enforced by backend code. Allowing tenants to invent unknown permission strings would create unbounded and unverifiable authorization semantics.

### Decision

Permission codes and metadata are defined in an application Permission Registry. Organization administrators may assign known registry permissions to custom roles, subject to scope and delegation rules, but cannot create new Permission codes.

The Registry is the source of truth for metadata. The database retains stable Permission identity/code and relation data.

### Consequences

- Permission codes are stable contracts.
- Renaming or retiring a code requires a deliberate compatibility/migration plan.
- Database `name` and `description` columns may be removed only after all consumers are audited.
- Seed synchronizes known permissions but must not silently destroy referenced or historical permissions.

---

## ADR-011 — Permission metadata includes explicit delegability

**Status:** ACCEPTED  
**Date:** 2026-11-01

### Context

Having a permission to perform an operation is not necessarily the same as having authority to grant that permission to someone else.

### Decision

Each Permission definition includes an explicit `delegable` attribute. Missing or unspecified delegability is not permission to delegate.

### Consequences

- Custom Role creation/update must validate every attached permission.
- Role assignment must validate the complete permission set of the target role.
- ALLOW override creation must validate delegation.
- A generic role-management permission alone does not authorize granting arbitrary privileges.

---

## ADR-012 — Controlled delegation is required to prevent privilege escalation

**Status:** ACCEPTED  
**Date:** 2026-11-01

### Context

An administrator must not be able to grant permissions beyond the authority they are allowed to delegate.

### Decision

For role assignment, validate both operation authority and the actor's authority to delegate all permissions in the target role.

Conceptual rule:

```text
Permissions(Role being assigned)
    ⊆
Actor's Delegable Effective Permissions
```

The same delegation principle applies to role creation/permission changes and ALLOW overrides. DENY override requires permission to manage overrides in the relevant scope and cannot grant access.

### Consequences

- Delegation is implemented in Application use cases, supported by domain rules.
- Assignment and permission modification must be transactional where race conditions could invalidate the checked authority.
- Reserved roles have additional protections.

---

## ADR-013 — Role lifecycle uses ACTIVE and ARCHIVED

**Status:** ACCEPTED  
**Date:** 2026-11-01

### Context

Hard-deleting roles would damage historical assignment and audit context.

### Decision

Roles have `ACTIVE` and `ARCHIVED` lifecycle states. Archived roles cannot be newly assigned and do not contribute permissions to subsequent authorization decisions. Historical records remain persisted.

### Consequences

- Role archival is a lifecycle operation, not physical deletion.
- Permission evaluation must exclude archived roles.
- Existing assignment history is retained.

---

## ADR-014 — Sensitive access-control mutations require append-only audit records

**Status:** ACCEPTED  
**Date:** 2026-11-01

### Context

The product must be able to identify who changed access, for whom, in which organization/branch, and when.

### Decision

Maintain dedicated append-only access-control audit records for sensitive Role, RolePermission, RoleAssignment, and PermissionOverride changes. Mutations and their audit writes must be atomic.

### Consequences

- Audit is a dedicated responsibility, implemented in PHASE 7.
- Do not log credentials or unnecessary secrets.
- Do not permanently record every successful permission check by default.
- Retention and audit-reader authorization remain implementation details to settle in PHASE 7.

---

## ADR-015 — Do not introduce long-lived authorization caching in v1

**Status:** ACCEPTED  
**Date:** 2026-11-01

### Context

Role revocation, membership suspension, or DENY changes must affect subsequent requests reliably.

### Decision

Do not add a long-lived authorization cache in the first version. Optimize targeted PostgreSQL read queries and indexes first.

### Consequences

- Authorization decisions use current authoritative state for subsequent requests.
- Cache may be considered later only with reliable invalidation for all relevant access-control and membership changes.
- Sensitive check-then-write operations still require transaction/concurrency design.

---

## ADR-016 — Keep Context ownership and Clean Architecture boundaries explicit

**Status:** ACCEPTED  
**Date:** 2026-11-01

### Context

Identity, Organization, Branch, and Access Control are separate bounded contexts with distinct lifecycle responsibilities.

### Decision

- Identity Access owns User and Authentication.
- Organization Management owns Organization, Branch, and Membership lifecycles.
- Access Control owns roles, permissions, assignments, overrides, authorization, and access-control audit.
- Domain does not import NestJS/Prisma/Redis/HTTP.
- Application depends on ports, not Prisma models.
- Infrastructure implements ports.
- HTTP does not own business/delegation rules.
- No circular module dependencies.

### Consequences

- Cross-context facts are consumed through explicit ports/read adapters.
- The current modular monolith may use carefully bounded Prisma read adapters against shared tables.
- The exact Identity/Organization integration strategy is completed in PHASE 8.

---

## ADR-017 — No overengineering in v1

**Status:** ACCEPTED  
**Date:** 2026-11-01

### Context

The system must scale in product capabilities without creating a generalized framework that is difficult to operate and maintain.

### Decision

Do not implement role hierarchy, wildcard permission, ABAC, a general-purpose policy engine, distributed authorization service, event sourcing, or long-lived permission cache in v1 without a concrete approved requirement.

### Consequences

- Prefer direct, readable models and focused use cases.
- Introduce abstractions only where there is an invariant, a responsibility, and a real consumer.
- Revisit only through a documented ADR when product requirements change.

---

## ADR-018 — Use repository documents as the project source of truth

**Status:** ACCEPTED  
**Date:** 2026-11-01

### Context

Long development projects may outlive a single ChatGPT conversation or available conversational memory.

### Decision

The repository documents are the durable source of truth:

- `MASTER-ARCHITECTURE.md`: approved architecture and roadmap.
- `IMPLEMENTATION-STATUS.md`: verified current phase, completed work, test results, and exact next step.
- `ARCHITECTURAL-DECISIONS.md`: decision history and rationale.

Git is the source of code/document change history. ChatGPT memory and conversation history are auxiliary only.

### Consequences

- Update status at the end of every meaningful session.
- Record every accepted architecture change as an ADR.
- New assistant/tool sessions should begin by reading all three documents.
- Do not rely on conversational memory as the only record of project state.

---

## Open implementation decisions (do not silently assume)

The approved architectural direction is stable, but the following details must be finalized in the relevant implementation phase:

1. Exact persisted representation for reserved/non-assignable roles: `isAssignable` or a small equivalent policy.
2. Whether Permission database `name`/`description` have any API/admin consumers before removing them.
3. Explicit permission sets for `ORGANIZATION_OWNER` and `BRANCH_MANAGER`.
4. At PHASE 8, verify how `User.status` from Identity Access is enforced for non-HTTP and application-level operations without transferring Identity lifecycle ownership.
5. PHASE 2 migration strategy: forward migration versus development-only reset/recreation. Project owner reports no important development data, but no reset is approved yet.
6. Audit retention and who may read audit records (PHASE 7).
7. Exact transaction/locking semantics for delegation checks and sensitive assignment changes (PHASE 5/6).

When any item is resolved, add the decision and rationale here or in a new ADR, and update `IMPLEMENTATION-STATUS.md`.
