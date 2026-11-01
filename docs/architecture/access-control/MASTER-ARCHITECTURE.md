# Master Architecture — Access Control System

## Tarkhineh Backend

| Attribute                    | Value                                                                                         |
| ---------------------------- | --------------------------------------------------------------------------------------------- |
| Document                     | Master Architecture & Implementation Specification                                            |
| Version                      | 1.7                                                                                           |
| Last updated                 | 2026-11-01                                                                                    |
| Architecture                 | Clean Architecture + DDD + Scoped RBAC                                                        |
| Architecture status          | Approved by project owner                                                                     |
| Repository audit             | PHASE 0 completed                                                                             |
| Current implementation phase | PHASE 6 — Infrastructure and Authorization Persistence (core implemented; acceptance open)   |
| Source of truth               | This document, `IMPLEMENTATION-STATUS.md`, and `ARCHITECTURAL-DECISIONS.md` |

> This document defines the approved target architecture and implementation constraints. It does not claim that the target system has already been implemented. Current implementation facts and verified test results are recorded separately in `IMPLEMENTATION-STATUS.md`.

---

# 1. Mission and Engineering Principles

Build a secure, scalable, maintainable Access Control capability for `tarkhineh-backend` using Clean Architecture, Domain-Driven Design, and Scoped Role-Based Access Control (RBAC).

The system must support a multi-organization, multi-branch product while remaining understandable and proportionate to the product's current needs.

The system must:

1. Enforce tenant isolation and least privilege.
2. Define deterministic, testable authorization rules.
3. Separate Domain, Application, Infrastructure, and Presentation responsibilities.
4. Keep Identity and Organization lifecycle ownership in their existing bounded contexts.
5. Support system-defined roles and organization-defined custom roles.
6. Support organization-to-branch permission inheritance.
7. Support branch-specific permission overrides with explicit DENY precedence.
8. Enforce controlled delegation and prevent privilege escalation.
9. Keep an auditable history of sensitive access-control changes.
10. Avoid unnecessary frameworks, abstractions, caches, and policy complexity.

**Core design:** Scoped RBAC + Permission Overrides + Controlled Delegation.

Do not turn this context into a generic authorization framework or implement ABAC, role hierarchies, wildcard permissions, or an external policy engine unless a concrete product requirement justifies a separately reviewed architecture decision.

## 1.1 Non-negotiable engineering principles

- Deny by default.
- Least privilege.
- Explicit tenant context for every authorization decision.
- Permission codes are stable application contracts.
- Authorization is enforced in Application use cases, not only in HTTP guards.
- Domain has no framework or infrastructure dependencies.
- Database constraints protect invariants that can be enforced safely at the database layer.
- Application rules protect cross-aggregate and cross-context invariants.
- Sensitive mutations and their audit records are atomic.
- A revoked permission must not remain effective for subsequent requests because of a stale long-lived cache.
- Do not claim a phase, test, migration, or build is complete without observed evidence and owner review.

---

# 2. Project Context and Technical Constraints

## 2.1 Technology stack

Verified project context at the time of this document:

- Ubuntu 26.04 development environment.
- Node.js 24.21.0.
- npm 11.19.0.
- NestJS 12.
- TypeScript with ESM.
- Prisma 7.
- PostgreSQL.
- Redis and BullMQ are already used elsewhere in the application.
- `ioredis` is the existing Redis client.
- Logging uses `nestjs-pino` and `pino-http`.
- Tests use Vitest.
- Architecture is feature-oriented modules + Clean Architecture + DDD.

The exact installed versions must be rechecked from the repository before changing tooling.

## 2.2 Repository conventions

- TypeScript ESM imports use `.js` extensions.
- Use `import type` for type-only imports.
- Generated Prisma Client path: `src/generated/prisma/client.js`.
- Prisma service path: `src/prisma/prisma.service.ts`.
- Existing Prisma error translator: `src/prisma/errors/prisma-error-translator.ts`.
- `normalizePrismaError` converts known database connectivity failures into the shared `DependencyUnavailableError` and preserves other errors unless explicitly mapped.
- NestJS CQRS is used for command and query handlers.
- Use Vitest for tests.
- Use explicit DI tokens and Port/Adapter boundaries where appropriate.
- Do not introduce a new library or infrastructure technology without a clear requirement.

## 2.3 Existing bounded contexts and ownership

### Identity Access

Owns:

- User identity and account lifecycle.
- Authentication and credential verification.
- Password management.
- JWT issuance and validation.
- Authentication sessions and refresh tokens.
- Login and logout.

Access Control must not own User identity or authentication.

### Organization Management

Owns:

- Organization lifecycle.
- Branch lifecycle.
- OrganizationMembership lifecycle.
- BranchMembership lifecycle.

Access Control must not own or mutate the lifecycle of Organization, Branch, or Membership entities.

### Access Control

Owns:

- Permission registry and permission semantics.
- Role definitions and lifecycle.
- Role-to-permission assignments.
- Role assignments to memberships.
- Per-user, per-branch permission overrides.
- Authorization evaluation.
- Controlled delegation rules.
- Access-control audit records.

### Outbound Email

Owns outbound email creation, dispatch, delivery, and reconciliation. Access Control must not depend on Outbound Email.

## 2.4 Cross-context boundary

Access Control may need current facts owned by Identity Access and Organization Management, such as user status, organization status, branch status, and membership status.

It must consume those facts through explicit application/infrastructure boundaries or narrowly scoped read adapters. It must not import or use another context's internal Domain entities as its own model. In the current modular monolith, a Prisma-backed read adapter may query the shared database, provided ownership and module boundaries remain explicit.

The exact integration mechanism is implemented in PHASE 8. Avoid circular NestJS module dependencies.

---

# 3. Current Repository State at Audit Completion

This section is a snapshot, not the target architecture. For verified details and command outputs, see `IMPLEMENTATION-STATUS.md`.

At PHASE 0 completion, the Access Control context contained only:

```text
src/contexts/access-control/
├── access-control.module.ts
└── domain/
    └── permissions/
        └── permission-catalog.ts
```

`AccessControlModule` was empty. No Access Control-specific unit or integration tests existed. No Access Control Domain entities, Application handlers, repositories, authorization evaluator, or HTTP endpoints had been implemented.

The existing Permission Catalog defined 18 permission codes and included localized names and descriptions, scope, resource, and action metadata.

Existing Prisma models were defined in:

- `prisma/models/access-control.prisma`
- `prisma/models/organization.prisma`
- User-side relations in `prisma/models/identity.prisma`

The existing schema included `Role`, `Permission`, `RolePermission`, `RoleAssignment`, and `UserPermissionOverride`, together with Organization and Membership models. The current schema is a legacy/intermediate model and must not be treated as the final approved target model.

The current Seed:

- Imports permission definitions from the Access Control catalog.
- Upserts Permission rows and stores Persian name/description in the database.
- Seeds `ORGANIZATION_OWNER` and `BRANCH_MANAGER`.
- Currently assigns all catalog permissions to `ORGANIZATION_OWNER` dynamically.
- Synchronizes system-role permissions by deleting and recreating `RolePermission` rows in a transaction.

The dynamic grant of every catalog permission to `ORGANIZATION_OWNER` is not approved for the target design. The target Seed must define each system role's permission set explicitly so that adding a new permission cannot silently expand privileges.

---

# 4. Approved Product and Authorization Decisions

The following requirements were explicitly approved by the project owner. They are the baseline for implementation and must not be casually reopened.

## 4.1 Multi-organization users

A User may be an active member of multiple Organizations simultaneously.

All authorization decisions must include and enforce the specific `organizationId` being accessed. A role or permission from one Organization must never leak into another Organization.

## 4.2 Authorization model

The chosen model is:

**Scoped RBAC + Permission Overrides + Controlled Delegation.**

Included in the first implementation:

- Three independent scope concepts.
- System-defined roles.
- Organization-defined custom roles.
- Organization-to-branch permission inheritance.
- Branch-level ALLOW and DENY overrides.
- Controlled delegation.
- Audit logging for sensitive access-control changes.
- Deny by default.
- No long-lived authorization cache.

Not included in the first implementation unless separately approved:

- Role hierarchy or role inheritance.
- Wildcard permissions.
- Customer-defined permission codes.
- ABAC engine.
- General-purpose policy engine.
- External authorization service.
- Arbitrary permission conditions or rules builder.
- Event sourcing.

## 4.3 Three independent scope concepts

These three scopes have different meanings and must not share an enum merely because their string values overlap.

### Role Definition Scope

Describes who owns/defines a Role.

```ts
export const ROLE_DEFINITION_SCOPE = {
  SYSTEM: 'SYSTEM',
  ORGANIZATION: 'ORGANIZATION',
} as const;
```

- `SYSTEM`: defined and governed by the application.
- `ORGANIZATION`: defined and owned by one Organization.
- Branch-owned custom Roles are not supported in the first version.

### Role Assignment Scope

Describes which kind of membership can receive a Role.

```ts
export const ROLE_ASSIGNMENT_SCOPE = {
  ORGANIZATION: 'ORGANIZATION',
  BRANCH: 'BRANCH',
} as const;
```

This enum belongs to Access Control. It must not reuse or depend on Organization Management's `MembershipScope` enum.

### Permission Target Scope

Describes the kind of resource against which a Permission is evaluated.

```ts
export const PERMISSION_TARGET_SCOPE = {
  ORGANIZATION: 'ORGANIZATION',
  BRANCH: 'BRANCH',
} as const;
```

Examples:

| Permission                     | Target scope |
| ------------------------------ | ------------ |
| `organization.read`            | ORGANIZATION |
| `organization.branches.create` | ORGANIZATION |
| `branch.dashboard.read`        | BRANCH       |
| `branch.staff.invite`          | BRANCH       |

## 4.4 System roles

The initial system roles are:

| Role code            | Definition scope | Assignment scope |
| -------------------- | ---------------- | ---------------- |
| `ORGANIZATION_OWNER` | SYSTEM           | ORGANIZATION     |
| `BRANCH_MANAGER`     | SYSTEM           | BRANCH           |

### ORGANIZATION_OWNER

- Represents the primary organizational administrator.
- Receives an explicit, reviewed set of Organization and Branch permissions.
- Must not be assignable through the generic public Role Assignment use case/API.
- Initial owner creation and ownership transfer require dedicated use cases.
- The consistency of `Organization.ownerUserId` and the corresponding owner assignment must be handled atomically by the appropriate owning-context workflow.

### BRANCH_MANAGER

- Is assigned to a BranchMembership.
- Its permissions are effective only for the branch whose active membership received the assignment.
- It does not obtain Organization-level permissions through its branch assignment.

## 4.5 Organization-defined custom roles

An Organization may define custom roles such as `SALES_MANAGER`, `ACCOUNTANT`, or `INVENTORY_MANAGER`.

Rules:

- A custom Role belongs to exactly one Organization.
- A custom Role from Organization A cannot be assigned or used in Organization B.
- An Organization-defined Role may have assignment scope ORGANIZATION or BRANCH.
- An Organization-assigned Role may contain both Organization and Branch target-scope permissions.
- A Branch-assigned Role may contain only Branch target-scope permissions.
- Branch-owned custom Role definitions are not supported in v1.

## 4.6 Permission Registry

Permission codes and metadata are defined by application source code. Organization administrators cannot invent new Permission codes.

Organizations may compose known registry permissions into their permitted custom roles, subject to scope compatibility and delegation rules.

The source-code Permission Registry is the source of truth for permission metadata. The database stores stable permission identity/code and its relations to roles and overrides; it should not become a second competing source for localized metadata.

A Permission definition conceptually contains:

```ts
export interface PermissionDefinition {
  readonly code: PermissionCode;
  readonly name: LocalizedText;
  readonly description: LocalizedText;
  readonly targetScope: PermissionTargetScope;
  readonly resource: PermissionResource;
  readonly action: PermissionAction;
  readonly delegable: boolean;
}
```

`delegable` is explicit. Missing or unspecified delegability must not be interpreted as permission to delegate. Permission codes are stable contracts; retirement or renaming requires a compatibility and migration plan.

## 4.7 Organization-to-branch inheritance

An active OrganizationMembership with an applicable Organization-assigned Role may receive Branch target-scope permissions across all active branches belonging to that same Organization.

A BranchMembership is not required for this inherited Organization-level access.

Branch-assigned Roles apply only to the branch membership to which they are assigned. BranchMembership does not grant Organization target-scope permissions.

### BranchMembership status semantics

BranchMembership status controls RoleAssignments attached to that BranchMembership. An inactive, suspended, invited, or removed BranchMembership does **not by itself** revoke otherwise valid Organization-level inherited permissions.

If the product needs to deny a specific Organization member access to a particular branch despite inherited organization-level permissions, use a valid branch-specific DENY override.

An inactive OrganizationMembership or suspended Organization blocks all access derived through that organization membership. Branch target access also requires the target Branch to be active and to belong to the requested Organization.

## 4.8 Permission overrides

Supported effects:

- `ALLOW`
- `DENY`

**Explicit DENY always wins over ALLOW.**

An override is scoped to one OrganizationMembership, one Branch, and one Permission. This allows an organization member—including an Organization administrator without BranchMembership—to receive or lose a specific permission for one branch.

- A valid DENY blocks permission even if inherited from an Organization role, granted by a Branch role, or present as an ALLOW override.
- A valid ALLOW may grant the specific branch permission even if no role grants it, but only when the actor is allowed to delegate that permission.
- Overrides never bypass invalid global context: inactive Organization, inactive OrganizationMembership, inactive Branch, unknown Permission, or invalid target scope.
- An override must be associated with a membership and branch from the same Organization.
- The logical uniqueness key is `(organizationMembershipId, branchId, permissionId)`; changing effect updates that override rather than creating conflicting parallel rows.

The existing `UserPermissionOverride` relation to `BranchMembership` is incompatible with this approved behavior and must be redesigned in PHASE 2.

## 4.9 Controlled delegation

No actor may grant a role or permission that they are not authorized to delegate.

For Role assignment, two independent checks are required:

1. The actor is authorized to perform the assignment operation in the target scope.
2. The actor is authorized to delegate every permission contained in the target Role.

Conceptual rule:

```text
Permissions(Role being assigned)
    ⊆
Actor's Delegable Effective Permissions
```

Delegation checks apply to:

- Creating a custom Role.
- Adding permissions to a Role.
- Updating a Role's permission set.
- Assigning a Role.
- Creating an ALLOW override.

A Role's permissions must be known registry permissions, scope-compatible, and delegable to the actor for the target operation. DENY overrides require permission to manage overrides in the relevant scope; they reduce access and must not grant new access.

Sensitive system roles such as `ORGANIZATION_OWNER` are reserved and cannot be assigned through generic assignment workflows. Owner creation/transfer is a separate workflow.

Delegation is an Application-level use-case rule supported by Domain policies; it is not implemented only in a controller or guard.

## 4.10 Role lifecycle

Roles have lifecycle states:

- `ACTIVE`
- `ARCHIVED`

Archived roles:

- Cannot be newly assigned.
- Do not contribute permissions to authorization decisions.
- Remain persisted for history and audit; do not hard-delete merely to deactivate.
- System roles are controlled by application/system workflows.
- An Organization can manage only roles it owns.

The exact treatment of existing active assignments when a Role is archived must be enforced consistently: the Role is immediately ineffective for new authorization decisions, while assignment history remains intact.

## 4.11 Audit logging

Sensitive access-control changes must be auditable.

Initial event types include:

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

Audit data should capture, as applicable:

- Actor ID.
- Subject/target user or membership.
- Organization ID.
- Branch ID.
- Event/action and resource identity.
- Timestamp.
- Before/after state where useful.
- Request/correlation ID.

Audit records are append-only. Sensitive mutations and their audit writes must be atomic. Do not log passwords, tokens, secrets, or other credentials. Do not persist every successful permission check by default; that would create unnecessary volume.

---

# 5. Authorization Evaluation Contract

## 5.1 Request model

Conceptual request:

```ts
export interface CheckPermissionInput {
  readonly userId: string;
  readonly organizationId: string;
  readonly permissionCode: PermissionCode;
  readonly branchId?: string;
}
```

For Organization-target permissions, `branchId` is not required to determine scope.

For Branch-target permissions, `branchId` is required and the branch must belong to `organizationId`.

Unknown permission codes and mismatched target scopes are denied.

## 5.2 Global context validation

Before evaluating grants or overrides:

1. Confirm the permission code exists in the registry.
2. Confirm target context matches the permission's target scope.
3. Confirm the Organization exists and is ACTIVE.
4. Confirm the user's OrganizationMembership exists and is ACTIVE.
5. For Branch-target permissions, confirm the Branch exists, belongs to the requested Organization, and is ACTIVE.

Global validation cannot be bypassed by ALLOW overrides.

The Identity Access authentication boundary remains responsible for authenticating the user. Whether the evaluator must independently query `User.status` is an explicit integration design item to verify in PHASE 8; do not assume an unverified ownership or enforcement mechanism.

## 5.3 Effective permission sources

For Organization target permissions:

- OrganizationMembership RoleAssignments are considered.
- BranchMembership RoleAssignments are never considered.

For Branch target permissions:

- OrganizationMembership RoleAssignments may grant branch permissions across active branches of the same Organization.
- BranchMembership RoleAssignments may grant branch permissions only for that Branch and only while that BranchMembership is ACTIVE.
- BranchMembership status does not revoke Organization-level inherited permissions by itself.
- Branch-specific overrides are evaluated before effective role grants according to precedence below.

A valid RoleAssignment must not be revoked; its Role must be ACTIVE; its definition scope, owning organization, and assignment scope must be compatible with the membership target.

## 5.4 Override precedence

After global context validation:

1. A matching explicit DENY override results in DENY.
2. Otherwise, a matching explicit ALLOW override results in ALLOW.
3. Otherwise, evaluate valid Organization and Branch RoleAssignments.
4. If no valid permission grant exists, DENY.

A DENY always beats ALLOW, including a role grant and an ALLOW override. An ALLOW override cannot override global context failures.

## 5.5 Authorization decision

The internal decision should contain more than an opaque boolean where useful:

- allowed/denied.
- internal reason code.
- permission code.
- target scope.
- organization context.
- branch context when applicable.

Do not expose sensitive internal denial details to untrusted callers. HTTP may return a consistent authorization-denied response while internal logs/diagnostics retain a safe reason code.

The Domain evaluator should be deterministic and independent of persistence. Infrastructure gathers the facts; Domain policy/evaluator determines the decision.

---

# 6. Database Design Principles and Target Model

PHASE 2 produced the approved Prisma schema and forward migration. The migration was applied and verified on both development and test databases; implementation evidence is recorded in `IMPLEMENTATION-STATUS.md`. The following is the approved conceptual target, not yet an implemented schema.

## 6.1 Role target

The conceptual Role fields are:

- `id`
- `code`
- `name`
- `description`
- `definitionScope`
- `assignmentScope`
- `organizationId`
- `isAssignable`
- `status`
- `createdById`
- `createdAt`
- `updatedAt`

Rules:

- Definition scope is only SYSTEM or ORGANIZATION.
- SYSTEM roles have no organization owner.
- ORGANIZATION roles require an owning organization.
- Role ownership and assignment scope are immutable after creation; create a new Role rather than moving an existing Role between tenants/scopes.
- No branch-owned custom Role in v1.
- Generic assignment must not permit reserved `ORGANIZATION_OWNER`.
- `isAssignable` was selected and implemented in PHASE 2. `ORGANIZATION_OWNER` is seeded as non-assignable and protected by the database constraint `Role_reserved_owner_non_assignable_check`.

## 6.2 RoleAssignment invariants

Each RoleAssignment must target exactly one of:

- `organizationMembershipId`
- `branchMembershipId`

Both NULL and both populated are invalid.

Keep partial unique indexes that prevent duplicate active assignments for `(organizationMembershipId, roleId)` and `(branchMembershipId, roleId)`, while allowing a new assignment after a previous one has been revoked.

Validate cross-table ownership/scope compatibility in Application transactions and enforce database-level safeguards where appropriate. Use composite foreign keys for tenant consistency where the schema supports them.

## 6.3 RolePermission

The existing join-table pattern with a composite primary key `(roleId, permissionId)` is appropriate and should be retained unless PHASE 2 discovers a concrete issue.

Permission attachment must validate target-scope compatibility and delegation before persistence.

## 6.4 Permission persistence

The source-code registry is the source of truth for permission metadata. The database Permission row should retain stable identity/code and required relations, not a competing localized metadata copy.

During PHASE 2, Permission metadata consumers were audited in the repository. The targeted search in `src`, `prisma`, and `test` found no additional consumers beyond the catalog and Seed. The database `name` and `description` columns were removed through the approved forward migration. The source-code catalog was formalized as the Permission Registry in PHASE 3.

Seed must upsert known registry permissions and must not delete customer-defined roles or operational user data. Retired permission codes must be handled deliberately; do not silently delete referenced permissions.

## 6.5 UserPermissionOverride target

The conceptual association is:

- OrganizationMembership.
- Branch.
- Permission.
- Actor/assignedBy.
- Effect (ALLOW or DENY).

The membership and branch must belong to the same Organization. The logical unique key is `(organizationMembershipId, branchId, permissionId)`.

Use composite relations/foreign keys to protect the shared organization identity where practical. Target-scope compatibility and delegation remain Application rules.

## 6.6 Constraints and triggers

Review and retain/rework existing protections rather than duplicating them blindly.

Expected invariants to assess:

- Role definition-scope ownership consistency.
- RoleAssignment exactly-one-membership constraint.
- RoleAssignment scope and tenant ownership validation.
- Role ownership/assignment-scope immutability.
- Override membership/branch same-organization consistency.
- Branch organization immutability.
- Active-assignment partial unique indexes.

Do not use ordinary PostgreSQL CHECK constraints for arbitrary cross-table invariants. Use composite foreign keys, application validation, transactions, or carefully justified triggers.

PHASE 2 reviewed the existing guards and redesigned the RoleAssignment and Role ownership triggers for the new model. The resulting constraints and triggers were inspected after migration. Dedicated negative-write integration tests remain PHASE 6 work.

## 6.7 Indexing

Design indexes from actual authorization queries and verify with query plans where practical. Candidates to evaluate:

- Unique `Permission.code`.
- Role unique code per definition scope/organization.
- `RolePermission.permissionId`.
- RoleAssignment membership/revocation lookups.
- RoleAssignment role/revocation lookup.
- OrganizationMembership by user/status and organization/status.
- BranchMembership by organization membership/status and branch/status.
- Override by organization membership + branch + permission.

Do not add indexes merely because a column exists. Each index needs a query or integrity justification.

---

# 7. Clean Architecture and DDD Boundaries

The following is an intended organization, not a requirement to create every folder immediately. Add files only when a real use case needs them.

## 7.1 Domain

Conceptual structure:

```text
access-control/domain/
├── permissions/
│   ├── permission-code.ts
│   ├── permission.types.ts
│   └── catalog/
├── roles/
├── role-assignments/
├── permission-overrides/
└── authorization/
```

Domain owns role rules, permission metadata contracts, lifecycle rules, scope compatibility, applicable delegation policies, and a pure permission evaluator.

Domain must not import NestJS, Prisma, Redis, HTTP, or infrastructure adapters. Do not create a Value Object, entity, base class, or domain service without a meaningful invariant or behavior.

## 7.2 Application

Conceptual structure:

```text
access-control/application/
├── commands/
│   ├── create-role/
│   ├── update-role/
│   ├── archive-role/
│   ├── assign-role/
│   ├── revoke-role/
│   ├── set-role-permissions/
│   └── set-permission-override/
├── queries/
│   ├── check-permission/
│   ├── get-effective-permissions/
│   └── list-available-permissions/
├── services/
├── ports/
└── errors/
```

Each handler/use case has a focused responsibility. Application orchestrates repositories, ports, transactions, authorization for management operations, and delegation checks. It must not depend on Prisma models.

The authenticated actor must come from a trusted authentication context, never from an untrusted request body.

## 7.3 Infrastructure

Conceptual structure:

```text
access-control/infrastructure/
├── persistence/
│   ├── prisma-role.repository.ts
│   ├── prisma-role-assignment.repository.ts
│   ├── prisma-permission-override.repository.ts
│   └── prisma-authorization-read.repository.ts
├── adapters/
└── audit/
```

Infrastructure owns Prisma, PostgreSQL queries, transaction implementation, persistence mapping, error translation, and audit persistence.

Use targeted authorization read queries; do not load entire aggregates for every permission check. Avoid N+1 queries and avoid generic repository frameworks without concrete need.

## 7.4 Presentation

HTTP controllers, DTOs, and guards are added after core authorization use cases. Guards handle authentication and request-level protection, but the Application use case must enforce authorization too.

Controllers must not own business rules or delegation logic.

---

# 8. Delegation Requirements

For every privileged mutation, validate both management authority and delegation authority.

### Role assignment

- Actor can perform role assignment at the target scope.
- Actor can delegate every permission contained in the target role.
- Target membership and role must belong to compatible scopes and the same tenant.
- Archived or non-assignable/reserved roles cannot be assigned through generic workflows.

### Role creation/update

- Actor can create/manage a role in the organization.
- All permissions are known registry entries.
- All permissions are scope-compatible with the role assignment scope.
- All assigned permissions are delegable by the actor for this operation.
- Adding a permission to an existing role must re-run delegation validation.

### ALLOW override

- Actor is authorized to manage overrides in the relevant target scope.
- Permission is known and branch-scoped.
- Actor may delegate the permission.
- OrganizationMembership, Branch, and permission context are valid.

### DENY override

- Actor is authorized to manage overrides in the relevant target scope.
- DENY reduces access and does not create a permission grant.
- It cannot bypass global context validation.

### Reserved owner role

`ORGANIZATION_OWNER` is not assignable through generic role assignment. Owner creation/transfer requires dedicated authorization and lifecycle handling.

---

# 9. Audit and Operational Security

Implement a dedicated append-only access-control audit model/repository during PHASE 7, after mutation boundaries are clear.

Sensitive role/permission mutations and audit writes must commit or roll back together. Define the event payload deliberately; avoid storing secrets or unnecessary personal data.

Audit success permission checks selectively, not indiscriminately. Record sensitive denials where operationally useful without leaking internal details to clients.

---

# 10. Performance and Cache Policy

Do not introduce a long-lived authorization cache in v1.

Each new authorization decision must use current authoritative state for role assignments, role status, permissions, overrides, and relevant organization/membership/branch status.

Optimize first through:

- Targeted read queries.
- Appropriate indexes.
- Selecting only required fields.
- Avoiding N+1 access patterns.
- Query-plan review.

If caching is proposed later, first design reliable invalidation for RolePermission, RoleAssignment, Role status, Permission overrides, Membership status, Organization status, and Branch status. Cache must never preserve a revoked permission beyond the agreed consistency boundary.

For highly sensitive mutations, address the check-then-write race with an appropriate transaction/atomic operation; a permission check followed by an unrelated write is not automatically race-safe.

---

# 11. Testing Strategy and Acceptance Requirements

Testing is part of the definition of done.

## 11.1 Domain unit tests

- Definition, assignment, and target scope validation.
- Scope compatibility.
- Role lifecycle and archived role behavior.
- Registry uniqueness and metadata validation.
- Permission evaluator.
- DENY precedence.
- Default DENY.

## 11.2 Application tests

- Create/update/archive role.
- Set role permissions.
- Assign/revoke role.
- Set/update/remove override.
- Delegation validation.
- Reserved system role protection.
- Not found, conflict, and authorization failures.
- Transaction orchestration where relevant.

## 11.3 Infrastructure integration tests

Use PostgreSQL/Prisma integration tests for:

- Mapping.
- Unique and partial unique indexes.
- Check constraints.
- Composite foreign keys.
- Trigger behavior where retained.
- Transaction rollback.
- Authorization read-query correctness.
- Prisma error translation.

Mocks alone are insufficient for critical database invariants.

## 11.4 Security test matrix

At minimum, tests must prove:

| Scenario                                       | Expected result                                                                                          |
| ---------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Organization role + no BranchMembership        | Branch permissions inherited within that organization                                                    |
| Active Branch Manager in assigned branch       | Allowed according to role permissions                                                                    |
| Branch Manager in another branch               | Denied                                                                                                   |
| User belongs to two organizations              | No permission leakage between tenants                                                                    |
| Inactive OrganizationMembership                | Denied                                                                                                   |
| Suspended Organization                         | Denied                                                                                                   |
| Inactive Branch                                | Denied for branch targets                                                                                |
| Inactive BranchMembership                      | Its branch assignments are ineffective; organization-inherited permissions remain governed independently |
| Explicit DENY override                         | Denied even if a role grants the permission                                                              |
| Valid ALLOW override                           | Allowed if global context and delegation rules pass                                                      |
| Revoked RoleAssignment                         | No longer grants access                                                                                  |
| Archived Role                                  | Does not grant access                                                                                    |
| Organization role used in another organization | Rejected/denied                                                                                          |
| Unknown permission                             | Denied                                                                                                   |
| Mismatched target scope                        | Denied                                                                                                   |
| Assignment outside actor authority             | Rejected                                                                                                 |
| Generic assignment of ORGANIZATION_OWNER       | Rejected                                                                                                 |
| Non-delegable permission in target role        | Cannot be delegated by ordinary actor                                                                    |
| RolePermission change                          | Reflected in subsequent authorization decisions                                                          |
| RoleAssignment revocation                      | Reflected in subsequent authorization decisions                                                          |

All tenant-isolation scenarios must use distinct organizations and branches.

---

# 12. Implementation Roadmap

Only one phase is active at a time. Do not mark a phase complete from code appearance alone. Each phase requires deliverables, passing acceptance criteria, observed verification, and project-owner review.

| Phase | Name                                            | Status as of 2026-11-01           |
| ----- | ----------------------------------------------- | --------------------------------- |
| 0     | Repository Audit and Baseline                   | COMPLETED                         |
| 1     | Requirements and Architecture Design            | COMPLETED — APPROVED              |
| 2     | Database Schema and Migration Design            | COMPLETED — APPROVED              |
| 3     | Permission Registry and Seed                    | COMPLETED — APPROVED              |
| 4     | Domain Model                                    | COMPLETED — APPROVED (2026-11-01) |
| 5     | Application Layer and Use Cases                 | COMPLETED — APPROVED BY PROJECT OWNER (2026-11-01) |
| 6     | Infrastructure and Authorization Persistence    | CORE IMPLEMENTATION PRESENT — ACCEPTANCE ITEMS OPEN |
| 7     | Audit Logging                                   | NOT STARTED                       |
| 8     | Cross-Context Integration                       | NOT STARTED                       |
| 9     | HTTP Layer                                      | NOT STARTED                       |
| 10    | Security, Performance, and Production Readiness | NOT STARTED                       |

## PHASE 0 — Repository Audit and Baseline

Status: **COMPLETED**.

Deliverables were current-state inventory, existing dependency review, migration review, and verified baseline. Exact evidence is in `IMPLEMENTATION-STATUS.md`.

## PHASE 1 — Requirements and Architecture Design

Status: **COMPLETED — APPROVED BY USER**.

Approved outputs:

- Scoped RBAC.
- Three independent scope concepts.
- System and organization-owned roles.
- Permission Registry.
- Organization-to-branch inheritance.
- Branch-specific ALLOW/DENY overrides.
- Controlled delegation.
- Audit logging.
- Deny by default.
- No long-lived authorization cache.
- Clean Architecture and bounded-context boundaries.
- Security test strategy.

Do not redesign this phase from scratch. If implementation reveals a real contradiction, document it, explain its impact, and request approval before changing the approved architecture.

## PHASE 2 — Database Schema and Migration Design

Status: **COMPLETED — APPROVED BY PROJECT OWNER (2026-11-01)**.

The approved target schema and forward migration were implemented and applied to `tarkhineh_test` and `tarkhineh_db`. Both databases were verified as up to date. Detailed schema, data-preservation, Seed, Build, and test evidence is recorded in `IMPLEMENTATION-STATUS.md`.

Goal: finalize Prisma schema, database invariants, and migration strategy before implementing Domain/Application logic.

Activities:

1. Define `RoleDefinitionScope`.
2. Define Access Control-owned `RoleAssignmentScope`.
3. Finalize permission target-scope model (source-code registry metadata).
4. Redesign Role model and remove branch-owned role concept.
5. Add Role lifecycle status.
6. Decide exact reserved/non-assignable role representation (`isAssignable` or equivalent).
7. Add/retain RoleAssignment constraints.
8. Redesign UserPermissionOverride around OrganizationMembership + Branch + Permission.
9. Review composite relations and tenant integrity.
10. Simplify Permission persistence only after consumer audit.
11. Review triggers and check constraints.
12. Review unique and query indexes.
13. Approve exact Prisma schema and migration SQL.
14. Validate migration strategy against development and test databases.

Rules:

- Inspect actual files and current migration history before editing.
- Do not rewrite historical migrations casually.
- A forward migration was selected and applied to both development and test databases. No database reset was performed.
- Test database is separate (`tarkhineh_test`).
- Avoid destructive changes without an explicit plan and owner approval.
- Run Prisma format, validate, generate, migration status, and database integration checks as relevant.
- The migration was applied and verified on `tarkhineh_test` before being applied to the main development database.

Acceptance criteria:

- Exact target schema approved by the project owner.
- Database constraints and relations are valid.
- Existing intended invariants are preserved or deliberately replaced.
- Migration applies successfully to the test and main development databases; both report schema up to date.
- Prisma validation and client generation succeed.
- Database constraints and triggers are inspected after migration; behavior-level negative-write integration tests are scheduled for PHASE 6.

## PHASE 3 — Permission Registry and Seed

Status: **COMPLETED — APPROVED BY PROJECT OWNER (2026-11-01)**.

### Permission Registry

The source-controlled Registry is the single source of truth for Permission metadata.

It contains exactly 23 stable Permission codes:

- All 18 existing codes are preserved.
- Exactly five codes are added:
  - `organization.roles.read`
  - `organization.roles.create`
  - `organization.roles.update`
  - `organization.roles.archive`
  - `organization.members.permissions.manage`
- `organization.roles.assign` is an existing code and remains unchanged.
- No existing code was renamed or removed.

Every Registry entry explicitly defines:

- Stable `code`.
- English and Persian `name` and `description`.
- `targetScope`: `ORGANIZATION` or `BRANCH`.
- `resource`.
- `action`.
- Explicit `delegable` boolean.

Scope distribution: 16 ORGANIZATION and 7 BRANCH.

Defined actions: `READ`, `CREATE`, `UPDATE`, `INVITE`, `SUSPEND`, `REMOVE`, `ASSIGN`, `ARCHIVE`, and `MANAGE`.

`organization.members.permissions.manage` is:

- Target scope: `ORGANIZATION`
- Resource: `organization.members.permissions`
- Action: `MANAGE`
- Delegable: `false`

It covers Organization-member permission overrides, including branch-specific exceptions. Its target scope remains ORGANIZATION.

### Delegability policy

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

Exactly 7 permissions are non-delegable:

- `organization.update`
- `organization.branches.suspend`
- `organization.members.remove`
- `organization.roles.create`
- `organization.roles.update`
- `organization.roles.archive`
- `organization.members.permissions.manage`

Delegability determines whether a permission may be granted to another principal through later role/override workflows. It does not determine whether the holder may perform the operation.

### Explicit System Role permission sets

Both permission sets are static source-controlled lists. They are never derived from the complete Registry.

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

`BRANCH_MANAGER` has exactly 7 permissions:

- `branch.dashboard.read`
- `branch.staff.read`
- `branch.staff.invite`
- `branch.staff.update`
- `branch.staff.suspend`
- `branch.staff.remove`
- `branch.roles.assign`

Role configuration:

- `ORGANIZATION_OWNER`: `assignmentScope = ORGANIZATION`, `isAssignable = false`.
- `BRANCH_MANAGER`: `assignmentScope = BRANCH`, `isAssignable = true`.

`isAssignable` is not itself assignment authority. Application-level assignment and delegation rules remain for the later Application phase.

### Seed synchronization and safety

The production Seed invokes `synchronizeAccessControlRegistry` inside one Prisma interactive transaction.

The synchronizer:

1. Reads the two known System Roles.
2. Validates all existing managed roles before the first write.
3. Fails if either managed role is ARCHIVED, has an unexpected assignment scope, or unexpectedly belongs to an Organization.
4. Upserts the 23 source-controlled Permission codes.
5. Creates or updates only the two known SYSTEM roles.
6. Replaces RolePermission links only for those exact System Role IDs.
7. Does not overwrite existing System Role status.
8. Never deletes Permission rows.
9. Never modifies Organization-defined custom roles, RoleAssignments, or UserPermissionOverrides.

No Prisma schema, migration, or database reset was part of PHASE 3.

The production CLI Seed was not executed against either development or test database during this implementation checkpoint.

### PHASE 3 verification

| Check                                 | Observed result                             |
| ------------------------------------- | ------------------------------------------- |
| `npx vitest run`                      | 63 files passed; 723 tests passed; 0 failed |
| Registry Unit Tests                   | 25 passed                                   |
| System Role permission-set Unit Tests | 4 passed                                    |
| Seed precondition Unit Tests          | 3 passed                                    |
| Access Control Integration Tests      | 1 file passed; 2 tests passed               |
| `npx tsc --noEmit`                    | Completed without reported errors           |
| `npm run build`                       | Exit code 0                                 |
| `npm run lint`                        | Exit code 0; 0 errors; 102 warnings         |
| `git diff --check`                    | No whitespace errors                        |

The focused Access Control Integration tests use the real `tarkhineh_test` database through a guarded URL. Test fixtures and synchronization writes are contained in interactive transactions and deliberately rolled back.

The tests cover:

- Repeated synchronization and idempotency.
- Exact System Role grants.
- Preservation of custom roles and their permissions.
- Preservation of RoleAssignments and UserPermissionOverrides.
- Preservation of historical Permission rows.
- Archived System Role rejection before synchronization writes.

Known limitations:

- The Integration tests do not inject a database failure midway through Seed statements. They verify precondition failures and deliberate transaction rollback after successful assertions.
- The full project Integration Suite was not rerun in this checkpoint.
- The previously documented unrelated Outbound Email retry/lease Integration failure remains deferred and unresolved.
- Lint reports 102 warnings and zero errors; warnings were not suppressed.
- The production CLI Seed was not run against `tarkhineh_db` or `tarkhineh_test`.

### PHASE 3 acceptance

- [x] Registry is the single source of Permission metadata.
- [x] All 18 existing codes are preserved; five approved codes added.
- [x] Scope, resource, action, localized metadata, and delegability are explicit.
- [x] System Role permission sets are explicit and static.
- [x] Seed synchronizes only the two managed System Roles.
- [x] Custom roles, assignments, overrides, and historical Permission rows are preserved.
- [x] Unit, focused Integration, TypeScript, Build, Lint, and diff checks completed.

**PHASE 3 was formally approved by the project owner on 2026-11-01 and is closed.**

## PHASE 4 — Domain Model

Status: **COMPLETED — APPROVED BY PROJECT OWNER (2026-11-01)**.

### Delivered Domain capabilities

The Access Control Domain model has been implemented with the following responsibilities:

- **Role:** validates definition scope, assignment scope, ownership, reserved System Role invariants, permission membership, assignability, and ACTIVE/ARCHIVED lifecycle.
- **RoleAssignment:** validates assignment targets and scope compatibility, distinguishes generic assignment from the dedicated Organization Owner factory, supports historical reconstitution, and evaluates revocation/effectiveness.
- **PermissionOverride:** models Branch-target ALLOW and DENY exceptions for an OrganizationMembership, validates tenant consistency and known permission scope, and protects timestamp state.
- **Permission scope rules:** validate Permission codes against the source-controlled Registry and enforce Role assignment-scope compatibility.
- **Authorization decision:** represents allow/deny outcomes and their reason codes.
- **Permission evaluator:** evaluates a supplied authorization snapshot, validates global Organization/Membership/Branch context, applies DENY before ALLOW, then evaluates Organization and Branch Role grants. It is stateless and does not perform persistence or I/O.
- **Delegation policy:** evaluates permission delegability, actor-held permissions, Role composition, Role assignment, and ALLOW/DENY override requirements.

### Architecture boundaries

- Domain implementation is isolated under `src/contexts/access-control/domain/`.
- No Prisma schema, migration, database operation, or production Seed change was made in PHASE 4.
- At the PHASE 4 checkpoint, no Application use case, repository port, Prisma adapter, NestJS provider, controller, or HTTP guard had yet been introduced. Application use cases and ports were implemented in PHASE 5; Prisma adapters and concrete provider composition remain PHASE 6 work, while controllers and HTTP guards remain PHASE 9 work.
- The evaluator receives its authorization state as a snapshot; loading and constructing that snapshot belongs to later Application and Infrastructure work.
- Identity account-status integration, audit persistence, transaction/locking semantics, and database constraint behavior tests remain deferred to their assigned phases.

### Files created

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

`permissions/permission-catalog.unit.spec.ts` was also formatted by Prettier. The Permission Registry implementation was not changed in PHASE 4.

### PHASE 4 verification

Observed terminal results on 2026-11-01:

| Check                        | Observed result                                                         |
| ---------------------------- | ----------------------------------------------------------------------- |
| Full `npx vitest run`        | 68 files passed; 846 tests passed; 0 failed                             |
| Access Control Domain tests  | 6 files passed; 148 tests passed; 0 failed                              |
| `npx tsc --noEmit`           | Completed without reported errors                                       |
| `npm run build`              | Completed successfully                                                  |
| Domain `oxlint --type-aware` | 19 files; 0 warnings; 0 errors                                          |
| Domain Prettier check        | All matched TypeScript files formatted                                  |
| `git diff --check`           | No output; note that Git does not include untracked files in this check |

The full project suite and production build were run before the final formatting-only pass. After formatting, the focused Domain tests, TypeScript check, Domain lint, and Prettier check were run again successfully.

### PHASE 4 acceptance review

- [x] Role, RoleAssignment, and PermissionOverride Domain models implemented.
- [x] Permission and scope compatibility rules implemented.
- [x] Authorization decision and pure snapshot evaluator implemented.
- [x] Delegation policy implemented.
- [x] Focused Domain unit tests: 148 passed.
- [x] Full project unit suite: 846 passed.
- [x] TypeScript, production build, Domain lint, and formatting checks passed.
- [x] No database schema or migration changes.
- [x] Project-owner review and formal PHASE 4 approval (2026-11-01).

**PHASE 4 was formally approved by the project owner on 2026-11-01. PHASE 5 may now begin.**

## PHASE 5 — Application Layer and Use Cases

Status: COMPLETED — APPROVED BY PROJECT OWNER (2026-11-01).

### Implemented Application capabilities

- Seven commands: CreateRole, UpdateRole, ArchiveRole, AssignRole, RevokeRole, SetPermissionOverride, and RemovePermissionOverride.
- Application queries for permission checking, effective permissions, and available permissions.
- AuthorizationApplicationService, using Application ports and Domain authorization policies.
- Application error types and repository/read ports.
- AccessControlUnitOfWork and AccessControlUnitOfWorkContext contracts.
- All seven mutation handlers execute authorization reads, target reads, and persistence calls through the transaction-bound context supplied to the Unit of Work.
- AuthorizationApplicationService accepts a transaction-bound AuthorizationSnapshotReader for command operations while retaining its default reader for query operations.
- Actor identity remains an explicit command input that must be populated by a trusted authentication boundary; HTTP integration is deferred to PHASE 9.
- `UpdateRoleHandler` validates delegation only when `permissionCodes` is supplied, including an empty array; metadata-only updates do not require re-delegating an unchanged Permission set.
- Repository port documentation assigns transaction lifecycle ownership to the Unit of Work and prohibits nested or independent transactions in supplied adapters.

### Application transaction boundary

AccessControlUnitOfWork owns the transaction lifecycle. It supplies transaction-bound RoleRepository, RoleAssignmentRepository, PermissionOverrideRepository, and AuthorizationSnapshotReader ports through one context.

The Application contract requires the supplied ports to share one underlying transaction client. The Unit of Work must commit on successful callback completion and roll back when the callback throws. Callbacks must not perform external side effects.

This is an Application contract, not evidence that a real database transaction or concurrency guarantee has already been implemented. PostgreSQL isolation, locking, retry, and transaction-bound adapter behavior are PHASE 6 responsibilities.

### PHASE 5 verification checkpoint

Observed on 2026-11-01:

- Access Control Unit tests: 15 files passed; 275 tests passed; 0 failed.
- `npx tsc --noEmit`: completed without reported errors.
- `npx oxlint --type-aware src/contexts/access-control/`: 68 files; 0 warnings; 0 errors.
- `git diff --check`: no whitespace errors.
- A source search found no direct legacy Repository or AuthorizationSnapshotReader injection tokens in the seven command-handler files.

Limitations at this checkpoint:

- Unit of Work tests use mocks and verify Application callback boundaries only. They do not prove PostgreSQL atomicity, rollback, isolation, locking, or race-condition behavior.
- No Prisma-backed Access Control Unit of Work or transaction-bound repository adapters have been implemented.
- Runtime NestJS provider/module composition using a concrete Unit of Work implementation remains to be completed and verified with Infrastructure.
- A full production build and PostgreSQL Access Control Integration suite have not been run as part of this checkpoint.
- No Prisma schema, migration, or database changes were made.

PHASE 5 was formally approved by the project owner on 2026-11-01 and is closed. Its completion covers the Application contract and mocked Unit verification only; real PostgreSQL transaction behavior, concurrency guarantees, concrete adapters, and runtime provider composition remain PHASE 6 work. Do not claim production transaction safety from the current mocked tests.

## PHASE 6 — Infrastructure and Authorization Persistence

Status: **CORE IMPLEMENTATION PRESENT — ACCEPTANCE ITEMS OPEN; AWAITING PROJECT-OWNER REVIEW.**

The concrete Prisma-backed AccessControlUnitOfWork, transaction-bound repositories, authorization snapshot readers, NestJS provider bindings, and the initial PostgreSQL Integration coverage have been implemented. The current implementation uses Serializable transactions for mutation operations, RepeatableRead for standalone snapshot reads, bounded P2034 retry, and a narrowly classified Permission Override composite-key P2002 retry. The complete implementation evidence, observed command results, and still-open acceptance gaps are maintained in IMPLEMENTATION-STATUS.md, section 8.

This status is not formal phase closure. The outstanding cross-tenant/database-guard/concurrency tests and query-plan review remain acceptance items.

Required work:

- Implement transaction-bound RoleRepository, RoleAssignmentRepository, PermissionOverrideRepository, and AuthorizationSnapshotReader adapters.
- Implement a consistent authorization snapshot read, including the Organization snapshot and all active Branch snapshots for delegation evaluation.
- Define and implement PostgreSQL isolation/locking semantics for sensitive check-then-write operations. A transaction alone is not sufficient evidence of race-condition protection.
- Handle serialization/deadlock retry only where safe; callbacks must remain free of external side effects.
- Preserve and translate known Prisma/database errors without masking original application errors.
- Keep database uniqueness constraints authoritative for duplicate writes.
- Complete NestJS provider/module composition with the concrete adapters.
- Add PostgreSQL Integration tests for commit, rollback, same-transaction binding, tenant isolation, concurrent authorization changes, duplicate assignments, Role/Permission mutation races, and database guard behavior.
- Review indexes and query plans; avoid N+1 authorization reads.
- Run relevant Integration tests, full Unit tests, TypeScript, production build, and lint.

Do not move Prisma dependencies into Domain or Application. PHASE 6 implements the Application contracts defined in PHASE 5.

## PHASE 7 — Audit Logging

Status: NOT STARTED.

Implement audit model, repository, atomic mutation/audit transactions, before/after state where useful, correlation IDs, and tests. Keep audit append-only and free of secrets.

## PHASE 8 — Cross-Context Integration

Status: NOT STARTED.

Integrate Identity and Organization facts through explicit boundaries/read adapters. Do not import other contexts' Domain internals. Avoid circular dependencies. Initial planned integration is the Organization Management branch-creation authorization port.

## PHASE 9 — HTTP Layer

Status: NOT STARTED.

Implement DTOs, controllers, endpoints, guards, trusted actor context, response mapping, and API tests. HTTP must not own business or delegation rules.

## PHASE 10 — Security, Performance, and Production Readiness

Status: NOT STARTED.

Complete tenant isolation, delegation, override, revocation, lifecycle, transaction, performance, query-plan, index, audit, error-handling, full build, and full test review. Confirm that every protected path enforces authorization and that permission revocation is reflected in subsequent requests.

---

# 13. Working Protocol

## 13.1 One phase at a time

For each phase:

1. State the phase goal.
2. Inspect actual files and dependencies.
3. Provide a focused checklist and deliverables.
4. Identify risks and acceptance criteria.
5. Wait for owner approval before implementation where required.
6. Do not begin the next phase until the current phase is verified and reviewed.

## 13.2 Never assume existing code

- Inspect real repository files before proposing edits.
- Inspect actual schema, migrations, seed, error patterns, DI modules, and tests.
- Do not invent files, classes, or APIs.
- Ask for one specific missing fact when necessary.

## 13.3 Preserve approved decisions

Do not reopen approved decisions without a concrete technical contradiction. If a contradiction exists:

1. Explain the exact conflict.
2. Explain security and implementation consequences.
3. Offer a proportionate alternative.
4. Obtain project-owner approval before changing the decision.

## 13.4 Implementation style

The project owner wants to understand the implementation.

- Explain why a file or abstraction exists.
- Work in small, coherent increments.
- Avoid dumping hundreds of lines at once.
- Prefer readable code over architectural ceremony.
- Avoid unnecessary helper classes, factories, base classes, and interfaces.
- Provide complete files only when a complete-file replacement is the clearest approach.

## 13.5 Command and feedback protocol

Provide terminal commands one at a time. Wait for the output, inspect it, then provide the next command. Avoid long bundles of commands.

Do not claim tests, builds, lint, migrations, or code changes succeeded without observing actual results.

## 13.6 Testing discipline

- Run relevant tests after each meaningful change.
- Run `npx tsc --noEmit` when appropriate; record separately from Nest build.
- Run full build and relevant test suites before phase completion.
- Do not delete or skip existing tests without a documented reason and approval.
- Record environment limitations and skipped tests explicitly.

## 13.7 Migration safety

Before any migration:

1. Inspect current schema and migration history.
2. Inspect current data when relevant.
3. Define target schema.
4. Plan backfill if needed.
5. Review generated/manual SQL.
6. Validate constraints, relations, indexes, and triggers.
7. Apply to test database.
8. Verify migration status and test database behavior.
9. Obtain approval before destructive or reset operations.

## 13.8 Architecture boundaries

- Domain must not import Prisma or NestJS.
- Application must not consume Prisma generated models directly.
- Infrastructure implements Application ports.
- HTTP does not own business rules.
- Access Control does not own User, Organization, Branch, or Membership lifecycle.
- Contexts must not depend on each other's internal Domain models.
- Cross-context integration uses explicit contracts and adapters.

## 13.9 Error handling

Use existing shared error patterns:

- Context-specific application/domain error codes.
- Shared base errors and categories.
- Prisma translation in Infrastructure.
- Preserve unknown errors rather than misclassifying them.
- Translate unique conflicts precisely.
- Represent dependency unavailability consistently.

## 13.10 Avoid overengineering

Do not add without a concrete requirement:

- Generic authorization frameworks.
- Generic repository frameworks.
- General-purpose policy engines.
- Wildcard permissions.
- Role hierarchy.
- ABAC.
- Distributed authorization service.
- Long-lived permission cache.
- Event sourcing.
- Unnecessary domain events or layers.

Every abstraction must have a clear invariant, responsibility, and real consumer.

---

# 14. Phase Tracking and Definition of Done

The canonical phase status is maintained in `IMPLEMENTATION-STATUS.md`.

Allowed statuses:

- NOT STARTED
- IN PROGRESS
- BLOCKED
- COMPLETED
- NEEDS REVIEW

A phase is COMPLETED only when:

1. Deliverables exist.
2. Acceptance criteria are met.
3. Required tests pass.
4. TypeScript/build checks pass where relevant.
5. No unsafe mock or unfinished TODO remains in the phase's production path.
6. Actual outputs have been reviewed.
7. The project owner has reviewed and accepted the result.

At each phase close, provide a report containing:

```text
PHASE:
STATUS:
DELIVERABLES:
FILES CREATED:
FILES MODIFIED:
DATABASE CHANGES:
TESTS (command and observed result):
BUILD (command and observed result):
SECURITY REVIEW:
OUTSTANDING ITEMS:
NEXT PHASE:
```

Update `IMPLEMENTATION-STATUS.md` after every meaningful work session and after phase approval.

---

# 15. Final Product Acceptance Criteria

The completed system must answer these questions correctly and securely:

1. Is the user an active member of the requested Organization?
2. Does the user have the requested Organization permission?
3. Does the user have the requested Branch permission?
4. Is the Branch permission inherited from an Organization role?
5. Is the permission granted by a branch-specific role assignment?
6. Does an explicit DENY override block the grant?
7. Is an ALLOW override valid and delegated?
8. Does the custom Role belong to the requested Organization?
9. Is the actor authorized to delegate every permission in the target Role?
10. Is an archived Role excluded from authorization?
11. Is a revoked RoleAssignment excluded from subsequent decisions?
12. Are sensitive access-control changes auditable?
13. Can any permission leak between Organizations? The answer must be no.
14. Do Organization and Membership lifecycle changes affect authorization correctly?
15. Does every new request use authoritative, current authorization state?

All acceptance criteria must be backed by automated tests.

---

# Final instruction

Use this document as the architecture contract for the Tarkhineh Access Control project.

Do not restart completed phases. Do not make assumptions about code that has not been inspected. Work one phase at a time, record status, verify all claims, and request approval before changing an accepted architectural decision.

The current implementation checkpoint is **PHASE 6 — Infrastructure and Authorization Persistence**, the next phase and not yet started. PHASES 0–5 are closed; PHASE 5 was approved by the project owner on 2026-11-01. Proceed sequentially through PHASE 6 (Infrastructure and Authorization Persistence), PHASE 7 (Audit Logging), and PHASE 8 (Cross-Context Integration). Only one phase may be active at a time.

**Final goal:** Build a production-ready, secure, scalable, and maintainable Access Control system for Tarkhineh Backend using Clean Architecture, DDD, and Scoped RBAC — without unnecessary complexity.
