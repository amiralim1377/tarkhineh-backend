# Master Architecture — Access Control System

## Tarkhineh Backend

| Attribute                    | Value                                                                       |
| ---------------------------- | --------------------------------------------------------------------------- |
| Document                     | Master Architecture & Implementation Specification                          |
| Version                      | 1.1                                                                         |
| Last updated                 | 2026-11-01                                                                  |
| Architecture                 | Clean Architecture + DDD + Scoped RBAC                                      |
| Architecture status          | Approved by project owner                                                   |
| Repository audit             | PHASE 0 completed                                                           |
| Current implementation phase | PHASE 2 — Database Schema and Migration Design (not started)                |
| Source of truth              | This document, `IMPLEMENTATION-STATUS.md`, and `ARCHITECTURAL-DECISIONS.md` |

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

PHASE 2 will produce and approve the exact Prisma schema and migration design. The following is the approved conceptual target, not yet an implemented schema.

## 6.1 Role target

The conceptual Role fields are:

- `id`
- `code`
- `name`
- `description`
- `definitionScope`
- `assignmentScope`
- `organizationId`
- `isAssignable` or an equivalently explicit reserved-role assignment policy
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
- The exact `isAssignable` representation and whether it is sufficient for reserved role policy must be finalized in PHASE 2.

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

Before removing database `name`/`description`, inspect all consumers in seed, API, admin tooling, tests, and generated-client usage. Any transition must preserve referential integrity and be included in a safe migration plan.

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

The current migration contains existing RoleAssignment guards and a Branch organization immutability trigger. PHASE 2 must inspect their exact behavior and redesign them for the new model.

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

| Phase | Name                                            | Status as of 2026-11-01 |
| ----- | ----------------------------------------------- | ----------------------- |
| 0     | Repository Audit and Baseline                   | COMPLETED               |
| 1     | Requirements and Architecture Design            | COMPLETED — APPROVED    |
| 2     | Database Schema and Migration Design            | NOT STARTED — NEXT      |
| 3     | Permission Registry and Seed                    | NOT STARTED             |
| 4     | Domain Model                                    | NOT STARTED             |
| 5     | Application Layer and Use Cases                 | NOT STARTED             |
| 6     | Infrastructure and Authorization Persistence    | NOT STARTED             |
| 7     | Audit Logging                                   | NOT STARTED             |
| 8     | Cross-Context Integration                       | NOT STARTED             |
| 9     | HTTP Layer                                      | NOT STARTED             |
| 10    | Security, Performance, and Production Readiness | NOT STARTED             |

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

Status: **NOT STARTED — NEXT PHASE**.

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
- Development data is currently reported by the owner as non-important/early-stage; this allows considering a development database reset if justified, but no reset has been approved or executed.
- Test database is separate (`tarkhineh_test`).
- Avoid destructive changes without an explicit plan and owner approval.
- Run Prisma format, validate, generate, migration status, and database integration checks as relevant.
- Migration must be tested against `tarkhineh_test` before any production-oriented recommendation.

Acceptance criteria:

- Exact target schema approved by the project owner.
- Database constraints and relations are valid.
- Existing intended invariants are preserved or deliberately replaced.
- Migration applies successfully to test database.
- Prisma validation and client generation succeed.
- Relevant database constraints are tested.

## PHASE 3 — Permission Registry and Seed

Status: NOT STARTED.

Activities:

1. Separate permission codes/types as justified.
2. Define target scopes, resources, and actions.
3. Complete localized registry metadata.
4. Add explicit `delegable` metadata.
5. Add the required role-management and override-management permission codes.
6. Validate code uniqueness and metadata consistency.
7. Refactor Seed.
8. Explicitly define each system role's permission set.
9. Preserve customer-defined roles and assignments.
10. Handle retired permissions deliberately.

Initial management permission codes to evaluate and include as approved:

- `organization.roles.read`
- `organization.roles.create`
- `organization.roles.update`
- `organization.roles.archive`
- `organization.roles.assign`
- `organization.members.permissions.manage`

Existing codes must be reviewed and preserved unless there is a documented compatibility plan.

Acceptance criteria:

- Registry is the single source of permission metadata.
- Seed is repeatable/idempotent.
- New permissions do not silently expand system role privileges.
- Customer-defined roles are never deleted or overwritten by system seed.
- Registry and seed tests pass.

## PHASE 4 — Domain Model

Status: NOT STARTED.

Implement the minimal Domain model required for roles, assignments, overrides, registry rules, scope compatibility, lifecycle, decisions, and pure evaluation. Keep Domain framework/infrastructure independent. Add comprehensive unit tests.

## PHASE 5 — Application Layer and Use Cases

Status: NOT STARTED.

Implement focused commands, queries, ports, error types, transactions, authorization for administrative operations, and delegation. Actor identity must come from trusted authentication context. Application must not depend on Prisma models.

## PHASE 6 — Infrastructure and Authorization Persistence

Status: NOT STARTED.

Implement Prisma adapters, targeted authorization read repository, mapping, transaction behavior, error translation, indexes/query review, and integration tests. Avoid N+1 queries.

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

The immediate next phase is **PHASE 2 — Database Schema and Migration Design**. The first task is to inspect and design the target Prisma schema and database invariants. Do not start Domain or Application implementation until PHASE 2 has been approved and completed.

**Final goal:** Build a production-ready, secure, scalable, and maintainable Access Control system for Tarkhineh Backend using Clean Architecture, DDD, and Scoped RBAC — without unnecessary complexity.
