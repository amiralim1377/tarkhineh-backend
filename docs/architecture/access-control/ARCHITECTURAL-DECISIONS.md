# Access Control — Architectural Decision Records

| Attribute              | Value                         |
| ---------------------- | ----------------------------- |
| Project                | `tarkhineh-backend`           |
| Document version       | 1.3 |
| Last updated           | 2026-11-01                    |
| Architecture reference | `MASTER-ARCHITECTURE.md` v1.3 |
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
- `isAssignable` is the persisted representation. `ORGANIZATION_OWNER` is seeded with `isAssignable = false`, and `Role_reserved_owner_non_assignable_check` prevents it from being made assignable.
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

**Status:** ACCEPTED — SCHEMA IMPLEMENTED IN PHASE 2  
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
- The `UserPermissionOverride` relation was redesigned in PHASE 2 around OrganizationMembership + Branch + Permission and applied through the approved migration.

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
- PHASE 2 audited repository consumers and removed the Permission `name` and `description` columns through the approved migration; localized metadata remains source-controlled.
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

## ADR-019 — Explicit Permission Registry metadata and System Role grants

**Status:** IMPLEMENTED — AWAITING PROJECT-OWNER APPROVAL IN PHASE 3
**Decision owner:** Project owner
**Date:** 2026-11-01

### Context

The architecture requires stable source-controlled Permission semantics, explicit delegation authority, and predictable built-in role grants. Dynamically granting every catalog Permission to `ORGANIZATION_OWNER` would silently expand privileges when new permissions are added.

### Decision implemented

- Preserve all 18 existing Permission codes and add exactly five: `organization.roles.read`, `organization.roles.create`, `organization.roles.update`, `organization.roles.archive`, and `organization.members.permissions.manage`.
- Define every entry with localized English/Persian name and description, `targetScope`, `resource`, `action`, and explicit `delegable`.
- Use 16 ORGANIZATION-target and 7 BRANCH-target permissions.
- Mark exactly 16 permissions delegable: `organization.read`, `organization.branches.read`, `organization.branches.create`, `organization.branches.update`, `organization.members.read`, `organization.members.invite`, `organization.members.update`, `organization.roles.read`, `organization.roles.assign`, `branch.dashboard.read`, `branch.staff.read`, `branch.staff.invite`, `branch.staff.update`, `branch.staff.suspend`, `branch.staff.remove`, and `branch.roles.assign`.
- Mark the remaining seven non-delegable: `organization.update`, `organization.branches.suspend`, `organization.members.remove`, `organization.roles.create`, `organization.roles.update`, `organization.roles.archive`, and `organization.members.permissions.manage`.
- Set `organization.members.permissions.manage` to ORGANIZATION target scope, resource `organization.members.permissions`, action `MANAGE`, and `delegable = false`.
- Give `ORGANIZATION_OWNER` an explicit static set of all 23 codes; it remains ORGANIZATION-assigned and non-assignable.
- Give `BRANCH_MANAGER` an explicit static set of the seven Branch permissions; it remains BRANCH-assigned and assignable. Assignability does not replace later application-level authority/delegation checks.
- Synchronize the Registry and two managed System Roles inside one caller-owned Prisma interactive transaction. Validate existing managed roles before the first write; fail for archived roles, assignment-scope drift, or unexpected Organization ownership.
- Never delete Permission rows or mutate Organization-defined custom roles, RoleAssignments, or UserPermissionOverrides. Replace RolePermission links only for the two managed System Role IDs.

### Consequences

- Adding a Permission cannot silently expand either System Role.
- Delegation policy is explicit for later Application use cases.
- Historical Permission rows are retained; retirement requires a separate compatibility/data-retirement plan.
- The Seed caller supplies one transaction; the synchronizer intentionally does not create a nested transaction.
- Verification and limitations are recorded in `IMPLEMENTATION-STATUS.md` and `MASTER-ARCHITECTURE.md`. Formal phase closure remains subject to project-owner approval.

## Resolved implementation decisions

The following implementation decisions were resolved during PHASE 2 and verified on 2026-11-01:

1. **Reserved Role representation:** persist `Role.isAssignable`. `ORGANIZATION_OWNER` is seeded with `isAssignable = false` and protected by the database constraint `Role_reserved_owner_non_assignable_check`.
2. **Permission metadata persistence:** the targeted repository consumer audit found no additional consumers beyond the catalog and Seed in `src`, `prisma`, and `test`. Permission `name` and `description` columns were removed; the source-code catalog remains the metadata source.
3. **Migration strategy:** use a forward migration, not a database reset. Migration `20261101075730_access_control_schema_v2` was successfully applied and verified on both `tarkhineh_test` and `tarkhineh_db`.

## Open implementation decisions (do not silently assume)

The PHASE 3 Registry contract, explicit System Role permission sets, delegability matrix, and override-management permission scope are implemented and recorded in ADR-019. Formal PHASE 3 closure awaits project-owner approval.

The following details remain for their relevant later phases:

1. **Identity status integration — PHASE 8:** verify how `User.status` is enforced for non-HTTP and application-level operations without transferring Identity lifecycle ownership.
2. **Audit retention/access — PHASE 7:** define operational retention and who may read audit records.
3. **Concurrency semantics — PHASES 5–6:** define exact transaction and locking behavior for delegation checks and sensitive assignment changes.
