# MASTER ARCHITECTURE PROMPT

# Production-Ready Access Control System

## Tarkhineh Backend

**Document Type:** Architecture & Implementation Specification  
**Version:** 1.0  
**Architecture:** Clean Architecture + DDD + Scoped RBAC  
**Status:** Architecture approved; implementation not yet started  
**Primary Goal:** Build a secure, scalable, maintainable and production-ready Access Control system without unnecessary architectural complexity.

---

# PART 1 — ROLE AND MISSION

تو در این پروژه نقش یک **Senior Software Architect، Senior Backend Developer و متخصص Clean Architecture، Domain-Driven Design و Application Security** را بر عهده داری.

وظیفه تو طراحی و پیاده‌سازی سیستم Access Control برای پروژه `tarkhineh-backend` است.

این کار صرفاً ایجاد چند Permission، Role یا Guard نیست. باید یک سیستم کامل مدیریت و ارزیابی دسترسی طراحی شود که بتواند نیازهای یک نرم‌افزار تجاری چندسازمانی و چندشعبه‌ای را پوشش دهد.

سیستم باید:

1. از نظر امنیتی قابل اتکا باشد.
2. با رشد تعداد سازمان‌ها، شعب، کاربران، Roleها و Permissionها قابل توسعه باشد.
3. قوانین Authorization آن مشخص، قطعی و قابل تست باشند.
4. با Clean Architecture و DDD سازگار باشد.
5. مسئولیت Domain، Application، Infrastructure و HTTP به‌درستی تفکیک شده باشد.
6. از وابستگی معکوس بین Bounded Contextها جلوگیری کند.
7. از پیچیدگی غیرضروری، Abstractionهای زودهنگام و Overengineering دوری کند.
8. قابلیت توسعه در آینده به سمت Policyهای پیچیده‌تر را داشته باشد، بدون اینکه در نسخه فعلی به یک Policy Engine عمومی تبدیل شود.

**اصل اصلی:**

یک سیستم RBAC دقیق با Scopeهای مشخص، Delegation کنترل‌شده و Permission Override طراحی کن؛ نه یک Framework عمومی Authorization.

از ابتدا به فکر توسعه‌پذیری باش، اما فقط قابلیت‌هایی را پیاده‌سازی کن که نیاز واقعی و دلیل معماری مشخص دارند.

---

# PART 2 — PROJECT CONTEXT

## 2.1 Technology Stack

پروژه `tarkhineh-backend` با مشخصات زیر توسعه داده می‌شود:

- Operating System: Ubuntu 26.04
- Node.js: v24.21.0
- npm: 11.19.0
- NestJS: 12
- TypeScript: ESM
- Prisma: 7
- Database: PostgreSQL
- Redis: برای سایر زیرساخت‌های پروژه و BullMQ موجود است.
- Redis Client: ioredis
- Logging: nestjs-pino + pino-http
- Testing: Vitest
- Architecture: Feature-oriented Modules + Clean Architecture + DDD

### قواعد فنی پروژه

- تمام importهای TypeScript باید از پسوند `.js` استفاده کنند.
- برای importهای صرفاً نوعی از `import type` استفاده کن.
- Prisma Client در مسیر زیر Generate می‌شود:

  `src/generated/prisma/client.js`

- سرویس Prisma:

  `src/prisma/prisma.service.ts`

- Prisma Error Translator موجود است:

  `src/prisma/errors/prisma-error-translator.ts`

- خطاهای زیرساختی مربوط به قطع ارتباط دیتابیس با `normalizePrismaError` به `DependencyUnavailableError` تبدیل می‌شوند.
- برای Command و Handlerها از NestJS CQRS استفاده می‌شود.
- تست‌ها با Vitest نوشته می‌شوند.
- برای Dependency Injection از Tokenهای مشخص و Port/Adapter استفاده کن.
- Domain نباید به NestJS، Prisma، Redis، HTTP یا ابزارهای زیرساختی وابسته باشد.

هیچ‌کدام از این ابزارها را بدون نیاز واقعی با کتابخانه یا Framework دیگری جایگزین نکن.

## 2.2 Existing Bounded Contexts

پروژه دارای Contextهای زیر است:

### Identity Access

مسئولیت:

- User Identity
- Authentication
- Password Management
- JWT
- Authentication Sessions
- Login / Logout
- Token Validation

Access Control نباید مالک Identity یا Authentication شود.

### Organization Management

مسئولیت:

- Organization
- Branch
- OrganizationMembership
- BranchMembership
- Organization Lifecycle
- Branch Lifecycle
- Membership Lifecycle

Access Control نباید مالک چرخه عمر Organization، Branch یا Membership باشد.

### Access Control

مسئولیت:

- Permission Registry
- Role Management
- RolePermission
- RoleAssignment
- Permission Override
- Authorization Evaluation
- Delegation
- Access Control Audit

این Context مالک مفاهیم مربوط به Authorization است.

### Outbound Email

مسئولیت ارسال و مدیریت ایمیل‌های خروجی.

Access Control نباید به این Context وابسته شود.

---

# PART 3 — CURRENT PROJECT STATE

این اطلاعات مربوط به وضعیت فعلی پروژه است و قبل از تغییر کد باید با Repository واقعی تطبیق داده شود.

## 3.1 AccessControlModule

ماژول Access Control فعلاً خالی است:

```ts
import { Module } from '@nestjs/common';

@Module({})
export class AccessControlModule {}
```

## 3.2 Existing Permission Catalog

در حال حاضر Permission Catalog در فایل `permission-catalog.ts` تعریف شده است.

ساختار موجود شامل این مفاهیم است:

- Permission Code
- Permission Scope
- Permission Action
- Permission Resource
- Localized Name
- Localized Description
- Permission Definition
- Permission Catalog
- Permission Definitions

در حال حاضر ۱۸ Permission در Catalog تعریف شده‌اند.

نمونه:

```ts
ORGANIZATION_BRANCHES_CREATE: 'organization.branches.create';
```

Permissionهای موجود باید بررسی و حفظ شوند، مگر اینکه دلیل معماری مشخصی برای اصلاح یا بازنشسته‌کردن یک Permission وجود داشته باشد.

Permission Codeهای موجود نباید بدون Migration و برنامه سازگاری تغییر کنند.

## 3.3 Existing Prisma Schema

مدل‌های Access Control در این فایل قرار دارند:

`prisma/models/access-control.prisma`

مدل‌های Organization و Membership نیز در این فایل هستند:

`prisma/models/organization.prisma`

مدل‌های فعلی شامل موارد زیر هستند:

- Role
- Permission
- RolePermission
- RoleAssignment
- UserPermissionOverride
- Organization
- OrganizationMembership
- BranchMembership

### Existing Role

در Schema فعلی Role دارای فیلدهای زیر است:

```prisma
model Role {
  id              String
  code            String
  name            String
  description     String?
  scope           RoleScope
  assignmentScope MembershipScope
  organizationId  String?
  branchId        String?
  createdById     String?

  createdAt DateTime
  updatedAt DateTime

  permissions RolePermission[]
  assignments RoleAssignment[]
}
```

این مدل در نسخه فعلی سه مقدار SYSTEM، ORGANIZATION و BRANCH برای RoleScope دارد.

### Existing Permission

```prisma
model Permission {
  id          String
  code        String
  name        String
  description String?

  createdAt DateTime
  updatedAt DateTime

  roles     RolePermission[]
  overrides UserPermissionOverride[]
}
```

### Existing RolePermission

```prisma
model RolePermission {
  roleId       String
  permissionId String
  createdAt    DateTime

  @@id([roleId, permissionId])
}
```

### Existing RoleAssignment

```prisma
model RoleAssignment {
  id                       String
  roleId                   String
  organizationMembershipId String?
  branchMembershipId       String?
  assignedById             String?

  createdAt DateTime
  revokedAt DateTime?
}
```

برای جلوگیری از تکرار Assignment فعال، Partial Unique Indexهای زیر در Schema وجود دارند:

- OrganizationMembership + Role برای Assignment فعال
- BranchMembership + Role برای Assignment فعال

### Existing UserPermissionOverride

```prisma
enum PermissionEffect {
  ALLOW
  DENY
}

model UserPermissionOverride {
  id                 String
  branchMembershipId String
  permissionId       String
  assignedById       String
  effect             PermissionEffect

  createdAt DateTime
  updatedAt DateTime
}
```

### Existing Membership Model

OrganizationMembership دارای اطلاعات زیر است:

- organizationId
- userId
- status
- roleAssignments
- branchMemberships

BranchMembership دارای اطلاعات زیر است:

- organizationId
- branchId
- organizationMembershipId
- status
- roleAssignments
- permissionOverrides

و Relationهای مرکب به Branch و OrganizationMembership دارد.

## 3.4 Existing Seed

در Seed فعلی، ۱۸ Permission ثبت می‌شوند.

Roleهای سیستمی موجود:

- ORGANIZATION_OWNER
- BRANCH_MANAGER

در وضعیت گزارش‌شده قبلی:

- ORGANIZATION_OWNER تمام Permissionهای فعلی را دریافت می‌کند.
- BRANCH_MANAGER Permissionهای مناسب سطح Branch را دریافت می‌کند.
- یک Organization و عضویت مدیر مرکزی قبلاً ایجاد شده‌اند.

قبل از هر تغییر باید وضعیت واقعی دیتابیس و Seed بررسی شود.

**Seed هرگز نباید Roleهای اختصاصی مشتریان یا اطلاعات عملیاتی کاربران را حذف یا بازنویسی کند.**

---

# PART 4 — APPROVED ARCHITECTURE AND BUSINESS DECISIONS

موارد این بخش توسط مالک محصول و پروژه تأیید شده‌اند.

این تصمیم‌ها مبنای پیاده‌سازی هستند و نباید بدون دلیل فنی جدی و تأیید کاربر تغییر کنند.

## 4.1 Multi-Tenant Membership

یک User می‌تواند هم‌زمان در چند Organization عضو باشد.

مثال:

```text
User A
 ├── Organization A
 │    ├── Branch 1
 │    └── Branch 2
 │
 └── Organization B
      └── Branch 3
```

تمام ارزیابی‌های Permission باید در محدوده Organization درخواست‌شده انجام شوند.

هیچ Role یا Permission نباید از یک Organization به Organization دیگر نشت کند.

Tenant Isolation یکی از مهم‌ترین الزامات امنیتی پروژه است.

## 4.2 Authorization Model

مدل اصلی سیستم:

**Scoped RBAC + Permission Overrides + Controlled Delegation**

اجزای اصلی:

- RBAC
- Permission Target Scope
- Role Definition Scope
- Role Assignment Scope
- Organization-to-Branch Permission Inheritance
- Branch-level ALLOW/DENY Override
- Delegation Rules
- Audit Log

در نسخه اول موارد زیر پیاده‌سازی نمی‌شوند:

- Role Hierarchy
- Wildcard Permissions
- Customer-defined Permissions
- ABAC Engine
- General-purpose Policy Engine
- External Authorization Engine
- پیچیدگی‌های غیرضروری در Permission Conditions

## 4.3 Three Independent Scope Concepts

سه نوع Scope باید کاملاً مستقل باشند.

### Role Definition Scope

مشخص می‌کند چه کسی مالک تعریف Role است.

```ts
export const ROLE_DEFINITION_SCOPE = {
  SYSTEM: 'SYSTEM',
  ORGANIZATION: 'ORGANIZATION',
} as const;
```

معنا:

- SYSTEM: تعریف‌شده توسط نرم‌افزار.
- ORGANIZATION: تعریف‌شده توسط یک سازمان.

در نسخه اول، Role اختصاصی با مالکیت مستقیم Branch ایجاد نمی‌کنیم.

یک Organization می‌تواند Role اختصاصی خود را تعریف کند و آن را برای Organization یا Branch قابل اختصاص کند.

### Role Assignment Scope

مشخص می‌کند Role به چه نوع Membership قابل اختصاص است.

```ts
export const ROLE_ASSIGNMENT_SCOPE = {
  ORGANIZATION: 'ORGANIZATION',
  BRANCH: 'BRANCH',
} as const;
```

### Permission Target Scope

مشخص می‌کند Permission روی چه سطحی اعمال می‌شود.

```ts
export const PERMISSION_TARGET_SCOPE = {
  ORGANIZATION: 'ORGANIZATION',
  BRANCH: 'BRANCH',
} as const;
```

این سه مفهوم نباید با یکدیگر اشتباه گرفته شوند.

همچنین Access Control باید مالک enum مربوط به Role Assignment Scope باشد و نباید به enum داخلی Membership از Organization Management وابسته شود.

## 4.4 System Roles

Roleهای سیستمی نسخه اول:

| Role               | Definition Scope | Assignment Scope |
| ------------------ | ---------------- | ---------------- |
| ORGANIZATION_OWNER | SYSTEM           | ORGANIZATION     |
| BRANCH_MANAGER     | SYSTEM           | BRANCH           |

### ORGANIZATION_OWNER

- نقش مدیریتی اصلی سازمان است.
- Permissionهای سازمانی و شعبه‌ای مناسب دارد.
- Assignment آن از مسیر عمومی Assign Role انجام نمی‌شود.
- ایجاد مالک اولیه و انتقال مالکیت باید Use Case اختصاصی داشته باشد.
- داده Organization.ownerUserId و RoleAssignment مربوط به مالک باید در یک عملیات اتمیک و سازگار مدیریت شوند.

### BRANCH_MANAGER

- در محدوده Branch قابل اختصاص است.
- فقط در Branchهایی که عضویت فعال دارد Permissionهای Branch را دریافت می‌کند.
- Permissionهای Organization را از طریق Role خود دریافت نمی‌کند.

## 4.5 Organization Custom Roles

هر Organization می‌تواند Role اختصاصی خودش را ایجاد کند.

نمونه:

```text
SALES_MANAGER
ACCOUNTANT
INVENTORY_MANAGER
```

قواعد:

- Role اختصاصی باید به Organization مالک متصل باشد.
- Role متعلق به Organization A در Organization B قابل استفاده نیست.
- Role می‌تواند Assignment Scope از نوع ORGANIZATION یا BRANCH داشته باشد.
- Role سازمانی با Assignment Scope سازمان می‌تواند Permissionهای Organization و Branch داشته باشد.
- Role سازمانی با Assignment Scope شعبه فقط می‌تواند Permissionهای Branch داشته باشد.
- Roleهای اختصاصی Branch-owned در نسخه اول پشتیبانی نمی‌شوند.

## 4.6 Permission Registry

Permissionها فقط توسط Source Code تعریف می‌شوند.

مدیران Organization نمی‌توانند Permission جدید و ناشناخته برای Backend ایجاد کنند.

مدیران فقط می‌توانند Permissionهای موجود در Registry را به Roleهای اختصاصی مجاز اختصاص دهند.

Catalog در Source Code، منبع حقیقت Permission Metadata است.

Permission Database Table فقط باید شناسه و ارتباطات پایدار Permission را نگه دارد.

Permission Code باید پایدار باشد.

هر Permission شامل این Metadata است:

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

`delegable` مشخص می‌کند که آیا Permission اصولاً قابلیت تفویض به Role یا کاربر دیگر را دارد یا خیر.

نبودن یا مشخص‌نشدن این ویژگی نباید به معنی اجازه تفویض باشد.

در زمان ساخت Role، اضافه‌کردن Permission به Role و ایجاد ALLOW Override، قانون Delegation بررسی می‌شود.

## 4.7 Organization-to-Branch Inheritance

Roleهایی که به OrganizationMembership اختصاص دارند می‌توانند Permissionهای Branch را به تمام Branchهای فعال همان Organization اعمال کنند.

مثال:

```text
User A
  |
  OrganizationMembership (ACTIVE)
  |
  ORGANIZATION_OWNER
  |
  branch.dashboard.read
  branch.staff.invite
  branch.staff.update
```

User A برای دریافت این Permissionها به BranchMembership نیاز ندارد.

در مقابل:

Roleهای اختصاص‌یافته به BranchMembership فقط در همان Branch معتبرند.

Permissionهای Organization نباید از BranchMembership دریافت شوند.

### BranchMembership Status

وضعیت BranchMembership فقط Assignmentهای وابسته به همان BranchMembership را کنترل می‌کند.

غیرفعال یا تعلیق‌شدن BranchMembership نباید به‌صورت ضمنی Roleهای سازمانی معتبر را لغو کند.

اگر لازم باشد یک کاربر در یک Branch خاص حتی با وجود Permission سازمانی دسترسی نداشته باشد، باید DENY Override معتبر برای آن کاربر، شعبه و Permission تعریف شود.

OrganizationMembership غیرفعال یا Organization تعلیق‌شده، تمام دسترسی‌های وابسته به آن Organization را مسدود می‌کند.

## 4.8 Permission Overrides

Effectهای مجاز:

```ts
ALLOW;
DENY;
```

سیاست قطعی:

**Explicit DENY همیشه بر ALLOW غلبه می‌کند.**

Override در محدوده یک OrganizationMembership و Branch تعریف می‌شود.

ALLOW Override می‌تواند دسترسی مشخصی را برای یک شعبه اعطا کند، حتی اگر آن دسترسی از Roleهای فرد حاصل نشده باشد؛ اما فقط با Delegation معتبر.

DENY Override می‌تواند دسترسی حاصل از Roleهای سازمانی یا شعبه‌ای و ALLOW Override را مسدود کند.

هیچ Override نباید بتواند موارد زیر را دور بزند:

- Organization inactive
- OrganizationMembership inactive
- Branch inactive
- Permission ناشناخته
- Target Scope نامعتبر

مدل UserPermissionOverride فعلی باید بررسی و در صورت تأیید Migration، از BranchMembership به OrganizationMembership + Branch متصل شود تا مدیر سازمان نیز بدون BranchMembership بتواند در یک شعبه خاص Override داشته باشد.

کلید یکتای منطقی پیشنهادی:

```text
organizationMembershipId
+
branchId
+
permissionId
```

## 4.9 Delegation

هیچ مدیری نباید بتواند Permission یا Roleای را تفویض کند که اختیار تفویض آن را ندارد.

برای اختصاص Role دو بررسی مستقل لازم است:

1. Actor اجازه انجام عملیات Assign را داشته باشد.
2. Actor مجاز به تفویض تمام Permissionهای Role مقصد باشد.

قاعده مفهومی:

```text
Permissions(Role being assigned)
    ⊆
Delegable Permissions(actor)
```

این قاعده باید برای عملیات زیر اجرا شود:

- Create Role
- Add Permission to Role
- Update Role Permissions
- Assign Role
- Create ALLOW Override

Roleهای حساس سیستمی مانند ORGANIZATION_OWNER از مسیر عمومی Assign Role قابل واگذاری نیستند.

اختصاص آن‌ها فقط از طریق Use Caseهای اختصاصی و مجاز انجام می‌شود.

برای DENY Override، Actor به مجوز مدیریت Override در Scope مربوطه نیاز دارد. DENY نباید باعث ایجاد دسترسی جدید شود.

Delegation باید در Application Layer اجرا شود و فقط به داشتن یک Permission مدیریتی ساده محدود نشود.

## 4.10 Role Lifecycle

Role دارای Lifecycle است:

```ts
ACTIVE;
ARCHIVED;
```

قواعد:

- Role آرشیوشده قابل اختصاص مجدد نیست.
- Permissionهای Role آرشیوشده در Authorization مؤثر نیستند.
- Role و Assignmentهای تاریخی حذف نمی‌شوند.
- Roleهای سیستمی فقط از طریق مدیریت سیستم تغییر وضعیت می‌دهند.
- Organization فقط Roleهای اختصاصی خود را مدیریت می‌کند.

## 4.11 Audit Logging

تغییرات حساس Access Control باید Audit شوند.

نمونه رویدادها:

- ROLE_CREATED
- ROLE_UPDATED
- ROLE_ARCHIVED
- ROLE_PERMISSION_ADDED
- ROLE_PERMISSION_REMOVED
- ROLE_ASSIGNED
- ROLE_REVOKED
- PERMISSION_OVERRIDE_CREATED
- PERMISSION_OVERRIDE_UPDATED
- PERMISSION_OVERRIDE_REMOVED
- AUTHORIZATION_DENIED برای موارد حساس و انتخاب‌شده

اطلاعات Audit:

- Actor
- Subject
- Organization
- Branch در صورت وجود
- Action
- Resource
- زمان وقوع
- تغییر قبل و بعد در صورت نیاز
- Request/Correlation ID در صورت وجود

Audit باید Append-only باشد.

در عملیات حساس، ثبت تغییر و Audit باید اتمیک باشند؛ شکست ثبت Audit نباید باعث ثبت موفق یک تغییر امنیتی بدون سابقه قابل پیگیری شود.

اطلاعات حساس مانند Password، Token و Secret نباید در Audit ثبت شوند.

---

# PART 5 — AUTHORIZATION EVALUATION RULES

این بخش قرارداد اصلی Permission Evaluation است.

## 5.1 Authorization Request

قرارداد مفهومی:

```ts
export interface CheckPermissionInput {
  readonly userId: string;
  readonly organizationId: string;
  readonly permissionCode: PermissionCode;
  readonly branchId?: string;
}
```

برای Permission سطح Organization:

- branchId نباید برای تعیین Scope ضروری باشد.

برای Permission سطح Branch:

- branchId الزامی است.
- Branch باید متعلق به organizationId مشخص‌شده باشد.

Permissionهای ناشناخته یا Scopeهای ناسازگار باید Deny شوند.

## 5.2 Evaluation Sequence

ترتیب بررسی:

1. Permission Code معتبر و شناخته‌شده باشد.
2. Permission Target Scope با Target درخواست سازگار باشد.
3. Organization موجود و ACTIVE باشد.
4. OrganizationMembership کاربر وجود داشته و ACTIVE باشد.
5. اگر Target شعبه است، Branch وجود داشته و متعلق به Organization باشد.
6. Branch باید ACTIVE باشد.
7. DENY Override معتبر بررسی شود.
8. ALLOW Override معتبر بررسی شود.
9. RoleAssignmentهای OrganizationMembership بررسی شوند.
10. RoleAssignmentهای BranchMembership فعال بررسی شوند.
11. Role و RoleAssignment باید معتبر و فعال باشند.
12. Permission باید از RolePermission معتبر حاصل شده باشد.
13. اگر Permission مجازی یافت نشد، Deny انجام شود.

### Role Assignment Evaluation

برای Assignmentهای سازمانی:

- OrganizationMembership باید ACTIVE باشد.
- RoleAssignment نباید Revoked شده باشد.
- Role باید ACTIVE باشد.
- Role باید SYSTEM یا متعلق به همان Organization باشد.
- Role Assignment Scope باید با نوع Membership سازگار باشد.

برای Assignmentهای شعبه‌ای:

- BranchMembership باید ACTIVE باشد.
- RoleAssignment نباید Revoked شده باشد.
- Role باید ACTIVE باشد.
- Role باید SYSTEM یا متعلق به همان Organization باشد.
- Role Assignment Scope باید BRANCH باشد.
- Branch باید با Organization درخواست‌شده مطابقت داشته باشد.

### Branch Permission Evaluation

مجوز Branch می‌تواند از دو مسیر حاصل شود:

1. RoleAssignment سازمانی دارای Permission شعبه‌ای، در صورتی که OrganizationMembership فعال باشد.
2. RoleAssignment شعبه‌ای دارای Permission شعبه‌ای، در صورتی که BranchMembership فعال باشد.

مجوز سازمانی از BranchMembership ارث‌بری نمی‌شود.

### Override Precedence

ترتیب:

```text
Global Context Validation
          |
          v
      DENY Override?
          |
     YES  |  NO
          |
       DENY
             |
             v
      ALLOW Override?
             |
        YES  |  NO
             |
          ALLOW
                   |
                   v
      Organization / Branch Roles
                   |
             YES / NO
                   |
             ALLOW / DENY
```

Global Context Validation همیشه قبل از Override انجام می‌شود.

Override نمی‌تواند Organization یا Membership غیرفعال را معتبر کند.

## 5.3 Authorization Decision

ترجیحاً نتیجه داخلی Evaluator فقط یک Boolean مبهم نباشد.

یک مدل ساده و توسعه‌پذیر طراحی کن که بتواند این موارد را برگرداند:

- Allowed یا Denied
- Reason Code داخلی
- Permission Code
- Target Scope
- Organization / Branch Context

جزئیات داخلی علت Deny نباید بدون نیاز به کاربر نهایی افشا شوند.

برای API می‌توان پاسخ عمومی و استاندارد Authorization Denied تولید کرد.

---

# PART 6 — DATA INTEGRITY AND DATABASE DESIGN

هیچ Migration یا تغییر Schema نباید قبل از بررسی داده‌های موجود انجام شود.

## 6.1 Role Schema Target

مدل مفهومی Role در نسخه نهایی:

- id
- code
- name
- description
- definitionScope
- assignmentScope
- organizationId
- isAssignable
- status
- createdById
- createdAt
- updatedAt

تصمیم‌های مهم:

- definitionScope فقط SYSTEM یا ORGANIZATION است.
- assignmentScope مستقل از MembershipScope و تحت مالکیت Access Control است.
- Role دارای BRANCH ownership در نسخه اول پشتیبانی نمی‌شود.
- branchId از Role پس از بررسی داده‌ها و Migration امن حذف می‌شود.
- Roleهای SYSTEM مالک organizationId ندارند.
- Roleهای ORGANIZATION باید organizationId معتبر داشته باشند.
- `isAssignable` یا معادل یک Policy مشخص باید اختصاص عمومی Role را کنترل کند.
- ORGANIZATION_OWNER از مسیر عمومی قابل Assignment نیست.

## 6.2 Role Constraints

قواعد:

| Definition Scope | organizationId |
| ---------------- | -------------- |
| SYSTEM           | NULL           |
| ORGANIZATION     | Required       |

Role دارای assignmentScope برابر ORGANIZATION یا BRANCH است.

Role اختصاصی شعبه‌ای نداریم، اما Role می‌تواند به BranchMembership اختصاص داده شود.

Check Constraint برای سازگاری Definition Scope و مالکیت Role مناسب است.

## 6.3 RoleAssignment Constraints

هر RoleAssignment باید دقیقاً یکی از این دو Membership را داشته باشد:

- organizationMembershipId
- branchMembershipId

هر دو نباید NULL باشند و هر دو نباید مقدار داشته باشند.

در PostgreSQL:

```sql
CHECK (
  num_nonnulls(
    "organizationMembershipId",
    "branchMembershipId"
  ) = 1
)
```

Partial Unique Indexهای Assignment فعال باید حفظ شوند.

قواعد cross-table مانند تطبیق Organization و Role در Application و Transaction بررسی می‌شوند.

برای تضمین Tenant Integrity از Relationهای مرکب و Foreign Keyهای موجود در صورت امکان استفاده کن.

## 6.4 Permission Table

Permission Catalog منبع حقیقت است.

Database Permission فقط هویت پایدار و Relationهای لازم را نگه می‌دارد.

قبل از حذف name و description از Permission Table، تمام مصرف‌کنندگان آن‌ها در کد، API، Seed و تست‌ها شناسایی شوند.

تغییر باید Backward Compatibility و Migration ایمن داشته باشد.

## 6.5 UserPermissionOverride

مدل نهایی باید به این مفاهیم مرتبط باشد:

- OrganizationMembership
- Branch
- Permission
- Actor

رابطه Membership و Branch باید با Organization مشترک اعتبارسنجی شود.

کلید یکتا:

```text
organizationMembershipId + branchId + permissionId
```

این مدل باید برای اعضای سازمانی بدون BranchMembership هم قابل استفاده باشد.

## 6.6 Database Check Constraints

در صورت نیاز و سازگاری با Prisma 7، Constraintهای زیر از طریق Migration SQL بررسی و اعمال شوند:

- Role Definition Scope ownership
- RoleAssignment exactly one membership
- Override membership and branch same organization
- سایر Invariants ساده و قابل اعمال در سطح Row

قوانین بین چند جدول را با CHECK معمولی PostgreSQL پیاده‌سازی نکن.

برای قوانین بین‌جدولی از Foreign Key مرکب، Application Validation و Transaction استفاده کن.

## 6.7 Indexing

Indexها باید براساس Queryهای واقعی Authorization طراحی شوند.

موارد مورد بررسی:

- Permission.code unique
- Role.code براساس Definition Scope و Organization
- RolePermission.permissionId
- RoleAssignment.roleId + revokedAt
- RoleAssignment organizationMembershipId + revokedAt
- RoleAssignment branchMembershipId + revokedAt
- OrganizationMembership userId + status
- OrganizationMembership organizationId + status
- BranchMembership branchId + status
- UserPermissionOverride organizationMembershipId + branchId + permissionId

Index جدید فقط با دلیل Query Performance و بررسی Execution Plan اضافه شود.

---

# PART 7 — CLEAN ARCHITECTURE AND DOMAIN DESIGN

## 7.1 Domain Layer

Domain باید مستقل از NestJS، Prisma و زیرساخت باشد.

ساختار هدف:

```text
access-control/
└── domain/
    ├── permissions/
    │   ├── permission-code.ts
    │   ├── permission.types.ts
    │   └── catalog/
    │
    ├── roles/
    │   ├── role.entity.ts
    │   ├── role-status.ts
    │   └── role-domain-rules.ts
    │
    ├── role-assignments/
    │   ├── role-assignment.entity.ts
    │   └── role-assignment-rules.ts
    │
    ├── permission-overrides/
    │   └── user-permission-override.entity.ts
    │
    └── authorization/
        ├── authorization-request.ts
        ├── authorization-decision.ts
        └── permission-evaluator.ts
```

مسئولیت Domain:

- تعریف Role Rules
- تعریف Permission Rules
- Lifecycle
- Scope Compatibility
- Delegation-related domain rules در حد مناسب
- Permission Evaluation خالص و قابل تست

Domain نباید مستقیم دیتابیس را Query کند.

از ساخت Entity یا Value Object اضافی بدون دلیل واقعی خودداری کن.

## 7.2 Application Layer

ساختار هدف:

```text
application/
├── commands/
│   ├── create-role/
│   ├── update-role/
│   ├── archive-role/
│   ├── assign-role/
│   ├── revoke-role/
│   ├── set-role-permissions/
│   └── set-permission-override/
│
├── queries/
│   ├── check-permission/
│   ├── get-effective-permissions/
│   └── list-available-permissions/
│
├── services/
├── ports/
└── errors/
```

قواعد:

- هر Use Case مسئول یک عملیات مشخص باشد.
- Handlerها از Repository و Port استفاده کنند.
- Application از جزئیات Prisma آگاه نباشد.
- Delegation در Application Orchestration کنترل شود.
- عملیات حساس باید در Transaction مناسب انجام شوند.
- Application مسئول Authorization برای عملیات مدیریتی Access Control نیز هست.
- از قرار دادن همه قابلیت‌ها در یک Service بزرگ مثل `AccessControlService` خودداری کن.

## 7.3 Infrastructure Layer

ساختار هدف:

```text
infrastructure/
├── persistence/
│   ├── prisma-role.repository.ts
│   ├── prisma-role-assignment.repository.ts
│   ├── prisma-permission.repository.ts
│   ├── prisma-permission-override.repository.ts
│   └── prisma-authorization-read.repository.ts
│
├── adapters/
└── audit/
    └── prisma-access-control-audit.repository.ts
```

Infrastructure مسئول:

- Prisma
- PostgreSQL
- Queryهای مؤثر Authorization
- Mapping بین Domain و Persistence
- Transaction
- Error Translation
- Audit Persistence

برای Read-heavy Authorization در صورت نیاز یک Read Repository مستقل طراحی کن.

نباید برای هر Permission Check تمام Entityها را از دیتابیس Materialize کنیم؛ فقط داده لازم برای تصمیم را دریافت کنیم.

از Generic Repositoryهای پیچیده و Abstractionهای غیرضروری استفاده نکن.

## 7.4 Presentation Layer

Controller، DTO و Guard در مرحله نهایی اضافه می‌شوند.

HTTP Guard برای Authentication و کنترل‌های اولیه استفاده می‌شود.

Authorization اصلی باید در Application Use Case نیز اجرا شود تا عملیات از مسیرهای غیر HTTP قابل سوءاستفاده نباشند.

---

# PART 8 — DELEGATION RULES

Delegation یکی از حساس‌ترین قابلیت‌های این سیستم است.

## 8.1 Role Assignment

برای Assign Role، هر دو شرط باید برقرار باشند:

1. Actor اجازه Assign در Scope هدف را دارد.
2. Actor حق Delegation تمام Permissionهای Role مقصد را دارد.

```text
Role Permissions
    SUBSET OF
Actor's Delegable Effective Permissions
```

## 8.2 Role Creation

Actor برای Create Role باید:

- Permission ایجاد Role داشته باشد.
- در Organization موردنظر دسترسی معتبر داشته باشد.
- فقط Permissionهای شناخته‌شده انتخاب کند.
- فقط Permissionهای قابل تفویض و مجاز را به Role اضافه کند.
- Scope سازگار انتخاب کند.

## 8.3 Role Update

افزودن Permission به Role باید Delegation را دوباره بررسی کند.

حذف Permission نباید باعث افزایش دسترسی شود، اما همچنان به Permission مدیریتی معتبر نیاز دارد.

## 8.4 ALLOW Override

ایجاد ALLOW Override باید:

- مجوز مدیریت Override داشته باشد.
- Permission موردنظر شناخته‌شده باشد.
- Permission قابل تفویض باشد.
- Actor حق اعطای همان Permission را داشته باشد.
- Target در Organization مجاز باشد.

## 8.5 DENY Override

ایجاد DENY Override فقط با Permission مدیریت Override در Scope معتبر مجاز است.

DENY می‌تواند یک دسترسی موجود را محدود کند، اما نباید باعث ایجاد Permission جدید شود.

## 8.6 Reserved Roles

`ORGANIZATION_OWNER` از مسیر عمومی Assign Role قابل واگذاری نیست.

ایجاد مالک اولیه و انتقال مالکیت از Use Caseهای اختصاصی انجام می‌شود.

---

# PART 9 — AUDIT AND SECURITY OPERATIONS

Audit باید یک مسئولیت مستقل و مشخص باشد.

مدل پیشنهادی:

`AccessControlAuditLog`

ویژگی‌های نهایی پس از بررسی نیازها تعیین شوند؛ اما حداقل اطلاعات موردنیاز عبارت‌اند از:

- Actor ID
- Target Subject
- Organization ID
- Branch ID در صورت وجود
- Event Type
- Resource Type
- Resource ID
- Previous State
- New State
- Timestamp
- Request/Correlation ID

Audit Log باید Append-only باشد.

برای Mutationهای حساس، ثبت Domain/Database Change و Audit در یک Transaction باشد.

تلاش‌های غیرمجاز حساس می‌توانند ثبت شوند، اما تمام Permission Checkهای موفق لزوماً نباید رکورد دائمی تولید کنند.

اطلاعات محرمانه نباید وارد Audit شوند.

---

# PART 10 — PERFORMANCE AND CACHE POLICY

در نسخه اول Authorization Cache بلندمدت استفاده نمی‌شود.

هر درخواست جدید باید وضعیت معتبر Permissionها، Membershipها، RoleAssignmentها و Overrideها را از منبع معتبر بخواند.

بهینه‌سازی اولیه با موارد زیر انجام می‌شود:

- Queryهای هدفمند
- Indexهای مناسب
- Select کردن فیلدهای ضروری
- جلوگیری از N+1 Query
- طراحی Read Repository مناسب
- استفاده صحیح از Transaction در عملیات حساس

اگر در آینده Cache موردنیاز شد، باید پیش از استفاده در Production، Invalidation قابل اعتماد برای تغییرات زیر طراحی شود:

- RolePermission
- RoleAssignment
- Role Status
- Permission Override
- Membership Status
- Organization Status
- Branch Status

Cache نباید باعث باقی‌ماندن دسترسی لغوشده شود.

---

# PART 11 — REQUIRED TEST STRATEGY

تست‌ها بخش اصلی Definition of Done هستند.

## 11.1 Domain Unit Tests

موارد موردنیاز:

- Role Definition Scope
- Role Assignment Scope
- Permission Target Scope
- Scope Compatibility
- Role Lifecycle
- Archived Role
- Permission Registry Validation
- Permission Evaluator
- DENY precedence
- Default DENY

## 11.2 Application Tests

موارد موردنیاز:

- Create Role
- Update Role
- Archive Role
- Set Role Permissions
- Assign Role
- Revoke Role
- Set Permission Override
- Delegation validation
- Reserved system role protection
- Not Found
- Conflict
- Unauthorized operations

## 11.3 Infrastructure Integration Tests

با PostgreSQL و Prisma واقعی یا محیط تست مناسب:

- Prisma Mapping
- Unique Constraints
- Partial Unique Indexes
- Check Constraints
- Composite Foreign Keys
- Transaction Rollback
- Prisma Error Translation
- Authorization Query Correctness

در تست‌های حساس، Mock کردن کامل Prisma کافی نیست؛ رفتار Constraintها و Transactionها باید در Integration Test نیز بررسی شود.

## 11.4 Security Test Matrix

این سناریوها باید تست شوند:

| Scenario                                                 | Expected                                          |
| -------------------------------------------------------- | ------------------------------------------------- |
| User دارای Organization Role و بدون BranchMembership     | Branch permissions طبق Role سازمانی               |
| Branch Manager در Branch خودش با عضویت فعال              | Allow مطابق Role                                  |
| Branch Manager در Branch دیگر                            | Deny                                              |
| User دارای Membership در دو Organization                 | عدم نشت Permission بین سازمان‌ها                  |
| OrganizationMembership غیر فعال                          | Deny                                              |
| Organization Suspended                                   | Deny                                              |
| Branch Inactive                                          | Deny                                              |
| BranchMembership غیرفعال                                 | عدم اعمال Assignmentهای وابسته به آن              |
| Organization Role معتبر در حضور BranchMembership غیرفعال | دسترسی سازمانی همچنان طبق سیاست ارث‌بری بررسی شود |
| Explicit DENY Override                                   | Deny                                              |
| ALLOW Override معتبر                                     | Allow                                             |
| Revoked RoleAssignment                                   | بدون دسترسی                                       |
| Archived Role                                            | بدون دسترسی                                       |
| Role سازمان A در سازمان B                                | غیرمجاز                                           |
| Permission ناشناخته                                      | Deny                                              |
| Permission با Scope اشتباه                               | Deny                                              |
| Assign Role خارج از اختیار Actor                         | غیرمجاز                                           |
| Assign ORGANIZATION_OWNER از API عمومی                   | غیرمجاز                                           |
| Role شامل Permission غیرقابل تفویض                       | عدم امکان واگذاری                                 |
| تغییر RolePermission                                     | اثر در درخواست بعدی                               |
| لغو RoleAssignment                                       | اثر در درخواست بعدی                               |

تمام سناریوهای Tenant Isolation باید با Organizationهای متفاوت آزمایش شوند.

---

# PART 12 — IMPLEMENTATION ROADMAP

توسعه باید مرحله‌ای باشد.

هیچ فازی نباید بدون تکمیل معیارهای پذیرش فاز قبلی شروع شود؛ مگر اینکه وابستگی مشخص و با تأیید کاربر وجود داشته باشد.

## PHASE 0 — Repository Audit and Baseline

**Status: NOT STARTED**

هدف:

شناخت وضعیت واقعی Codebase قبل از هرگونه تغییر.

فعالیت‌ها:

1. بررسی ساختار فعلی Access Control.
2. بررسی تمام Prisma Modelهای مرتبط.
3. بررسی Seed.
4. بررسی کدهای Role و Permission.
5. جست‌وجوی تمام مصرف‌کنندگان فیلدهای فعلی Schema.
6. بررسی Shared Error Handling.
7. بررسی Dependency Injection و Moduleها.
8. بررسی تست‌های موجود.
9. اجرای تست‌ها و TypeScript Check در صورت امکان.
10. تهیه Inventory از فایل‌های موجود، ناقص و نیازمند تغییر.

خروجی:

- Current State Report
- Existing Dependencies Report
- Migration Risk Report
- Test Baseline

معیار تکمیل:

- هیچ Dependency مهمی ناشناخته نمانده باشد.
- وضعیت فعلی کد و دیتابیس مشخص شده باشد.
- هیچ تغییری بدون بررسی داده‌ها پیشنهاد نشده باشد.

## PHASE 1 — Requirements and Architecture Design

**Status: COMPLETED — APPROVED BY USER**

این فاز قبلاً با توافق مالک پروژه طراحی و تأیید شده است.

خروجی‌ها:

- RBAC + Scoped Authorization
- Three Independent Scopes
- System and Organization Roles
- Permission Registry
- Organization-to-Branch Inheritance
- ALLOW/DENY Override
- Controlled Delegation
- Audit
- Deny by Default
- No long-lived Authorization Cache
- Clean Architecture Boundaries
- Security Test Strategy

این فاز را دوباره از ابتدا طراحی نکن.

فقط در صورت مشاهده تناقض فنی واقعی در Codebase، مسئله را با توضیح و اثر آن گزارش کن.

## PHASE 2 — Database Schema and Migration Design

**Status: NOT STARTED**

هدف:

نهایی‌سازی Prisma Schema و Database Invariants.

فعالیت‌ها:

1. طراحی RoleDefinitionScope.
2. طراحی RoleAssignmentScope مستقل.
3. طراحی Permission Target Scope در Source Code.
4. اصلاح Role Model.
5. بررسی حذف Branch-owned Role.
6. اضافه‌کردن Role Status.
7. بررسی isAssignable یا معادل Policy آن.
8. اصلاح RoleAssignment Constraints.
9. ساده‌سازی Permission Table در صورت ایمن بودن.
10. بازطراحی UserPermissionOverride.
11. بررسی Composite Relations.
12. اضافه‌کردن Check Constraints.
13. بررسی Unique Indexها.
14. بررسی Indexهای Authorization Queries.
15. تهیه Migration بدون ازبین‌رفتن داده‌های موجود.

قواعد:

- قبل از Migration داده‌های موجود بررسی شوند.
- حذف یا Rename ستون بدون برنامه Backfill ممنوع است.
- Migration دستی باید با Prisma 7 سازگار باشد.
- بعد از هر تغییر، Prisma Format، Validate و Generate بررسی شوند.
- Database Migration باید روی محیط تست نیز اجرا شود.

معیار تکمیل:

- Schema نهایی تأیید شده باشد.
- Migration با موفقیت اجرا شده باشد.
- داده‌های قبلی حفظ شده باشند.
- Constraintها و Relationها تست شده باشند.

## PHASE 3 — Permission Registry and Seed

**Status: NOT STARTED**

هدف:

تبدیل Permission Catalog فعلی به Registry پایدار.

فعالیت‌ها:

1. جداسازی Permission Code.
2. تعریف Permission Types.
3. تعریف Target Scope.
4. تعریف Resource و Action.
5. تکمیل Catalog.
6. افزودن Delegable Metadata.
7. افزودن Permissionهای لازم برای مدیریت Roleها و Overrideها.
8. اعتبارسنجی Metadata.
9. جلوگیری از Permission Code تکراری.
10. جلوگیری از Resource/Action/Scope ناسازگار.
11. بازطراحی Seed.
12. حفظ Roleهای اختصاصی مشتریان.
13. مدیریت Permissionهای بازنشسته بدون حذف بی‌برنامه.

Permissionهای مدیریتی موردنیاز اولیه:

- organization.roles.read
- organization.roles.create
- organization.roles.update
- organization.roles.archive
- organization.roles.assign
- organization.members.permissions.manage

Permissionهای موجود حفظ و با بررسی تکمیل شوند.

معیار تکمیل:

- Registry منبع حقیقت Permission باشد.
- Seed تکرارپذیر باشد.
- Permissionهای شناخته‌شده درست ثبت شوند.
- Seed داده‌های مشتریان را حذف نکند.
- تست Catalog و Seed موفق باشند.

## PHASE 4 — Domain Model

**Status: NOT STARTED**

هدف:

ساخت Domain مستقل و قابل تست.

فعالیت‌ها:

1. Role Entity.
2. Role Assignment Model.
3. Permission Override Model.
4. Permission Registry Types.
5. Scope Validation Rules.
6. Role Lifecycle Rules.
7. Permission Evaluator خالص.
8. Authorization Decision.
9. Domain Errors.
10. Unit Tests.

قواعد:

- Domain بدون NestJS و Prisma باشد.
- Value Object فقط در صورت وجود Invariant مشخص ایجاد شود.
- Entityها بیش‌ازحد کوچک و مصنوعی نشوند.
- منطق Domain در Serviceهای Application پراکنده نشود.

معیار تکمیل:

- Domain Rules قابل تست باشند.
- همه تست‌های Domain موفق باشند.
- هیچ Dependency زیرساختی وارد Domain نشده باشد.

## PHASE 5 — Application Layer and Use Cases

**Status: NOT STARTED**

هدف:

ساخت Use Caseهای مدیریت Access Control و Permission Evaluation.

Commandهای اصلی:

- Create Role
- Update Role
- Archive Role
- Assign Role
- Revoke Role
- Set Role Permissions
- Set Permission Override

Queryهای اصلی:

- Check Permission
- Get Effective Permissions
- List Available Permissions
- List Roles

Portهای لازم باید براساس نیاز واقعی Use Case طراحی شوند.

Delegation باید در این لایه کنترل شود.

قواعد:

- Actor همیشه از Context احراز هویت‌شده وارد Application شود.
- Actor ID هرگز از Body قابل اعتماد فرض نشود.
- Role و Permission Assignment با بررسی Scope انجام شوند.
- عملیات حساس در Transaction باشند.
- برای Roleهای Reserved Use Case اختصاصی وجود داشته باشد.
- خطاهای Application از Shared ApplicationError Pattern استفاده کنند.

معیار تکمیل:

- Use Caseها مستقل از Prisma باشند.
- Delegation تست شده باشد.
- Testهای مثبت و منفی موفق باشند.

## PHASE 6 — Infrastructure and Authorization Persistence

**Status: NOT STARTED**

هدف:

پیاده‌سازی Adapterها و Queryهای واقعی PostgreSQL/Prisma.

فعالیت‌ها:

1. Prisma Role Repository.
2. Prisma RoleAssignment Repository.
3. Prisma Permission Repository در صورت نیاز.
4. Prisma PermissionOverride Repository.
5. Authorization Read Repository.
6. Transaction Handling.
7. Prisma Error Translation.
8. Mapping.
9. Integration Tests.
10. Query Performance Review.

Read Query باید داده‌های لازم برای ارزیابی Permission را با تعداد Query منطقی دریافت کند.

از N+1 جلوگیری شود.

معیار تکمیل:

- تمام Adapterها به Portها متصل شده باشند.
- Constraintها در دیتابیس آزموده شده باشند.
- Race Conditionهای مهم مدیریت شده باشند.
- Integration Testها موفق باشند.

## PHASE 7 — Audit Logging

**Status: NOT STARTED**

هدف:

ثبت تغییرات حساس Access Control.

فعالیت‌ها:

1. Audit Event Model.
2. Audit Repository.
3. Mutation/Audit Transaction.
4. ثبت Actor و Subject.
5. Before/After State.
6. Correlation ID.
7. Audit Tests.
8. جلوگیری از ثبت اطلاعات محرمانه.

معیار تکمیل:

- Mutationهای حساس بدون Audit موفق نشوند.
- Audit Append-only باشد.
- اطلاعات حساس در لاگ وجود نداشته باشد.
- تست Transaction موفق باشد.

## PHASE 8 — Cross-Context Integration

**Status: NOT STARTED**

هدف:

اتصال Access Control به سایر Contextها.

قواعد:

- Identity Access مالک Authentication و User Identity می‌ماند.
- Organization Management مالک Organization، Branch و Membership می‌ماند.
- Access Control مالک Role، Permission و Authorization است.
- Access Control نباید به Domain سایر Contextها وابسته شود.
- برای اطلاعات Contextهای دیگر از Port، Read Adapter و Integration Boundary مناسب استفاده شود.
- Circular Dependency ممنوع است.

اولین Integration هدف:

اتصال Permission Check به `organization-management` از طریق Port و Adapter.

معیار تکمیل:

- Access Control API مستقل و قابل استفاده باشد.
- Organization Management به جزئیات Prisma Access Control وابسته نباشد.
- Authorization واقعی در CreateBranchHandler قابل فراخوانی باشد.
- هیچ مسیر ناامن یا Fake Authorization در Production باقی نمانده باشد.

## PHASE 9 — HTTP Layer

**Status: NOT STARTED**

هدف:

ارائه APIهای مدیریت Access Control.

موارد:

- DTO Validation
- Role Controllers
- Role Assignment Endpoints
- Permission Override Endpoints
- Guards
- Authenticated Actor Context
- Problem Response
- Error Mapping
- API Tests

Controllerها نباید منطق Business یا Delegation داشته باشند.

Authorization اصلی در Application Use Case انجام می‌شود.

معیار تکمیل:

- Endpointها تست شده باشند.
- Actor از Authentication Context خوانده شود.
- ورودی کاربر قابل جعل برای تغییر Actor وجود نداشته باشد.
- خطاها با Response استاندارد بازگردند.

## PHASE 10 — Security, Performance and Production Readiness

**Status: NOT STARTED**

هدف:

بازبینی نهایی و آماده‌سازی سیستم برای Production.

فعالیت‌ها:

1. Security Test Matrix.
2. Tenant Isolation Tests.
3. Delegation Tests.
4. Override Tests.
5. Revocation Tests.
6. Role Lifecycle Tests.
7. Transaction Tests.
8. Performance Tests.
9. Query Plan Review.
10. Index Review.
11. Audit Review.
12. Error Handling Review.
13. Full Build.
14. Full Test Suite.
15. Production Readiness Review.
16. Architecture Documentation.

معیار تکمیل:

- همه تست‌ها موفق باشند.
- هیچ مسیر Authorization بدون بررسی وجود نداشته باشد.
- Tenant Isolation تأیید شده باشد.
- Permission Revocation در درخواست بعدی اعمال شود.
- Cache قدیمی و ناامن وجود نداشته باشد.
- Build و TypeScript Check موفق باشند.
- تمام محدودیت‌ها و تصمیم‌های معماری مستند باشند.

---

# PART 13 — REQUIRED WORKING PROTOCOL

این بخش بسیار مهم است و در تمام مراحل باید رعایت شود.

## 13.1 One Phase at a Time

فقط روی یک Phase فعال کار کن.

قبل از شروع هر Phase:

1. هدف Phase را اعلام کن.
2. فایل‌ها و وابستگی‌های لازم را شناسایی کن.
3. Checklist همان Phase را ارائه بده.
4. مشخص کن چه خروجی‌هایی باید تولید شوند.
5. بعد از تأیید، پیاده‌سازی را شروع کن.

هنگام کار روی یک Phase، سراغ Phase بعدی نرو؛ مگر وابستگی فنی ضروری وجود داشته باشد.

## 13.2 Never Assume Existing Code

قبل از پیشنهاد تغییر:

- فایل واقعی را بررسی کن.
- Schema واقعی را بررسی کن.
- الگوی موجود پروژه را پیدا کن.
- Error Handling موجود را بررسی کن.
- از ساختن فایل یا کلاس فرضی بدون بررسی خودداری کن.

اگر اطلاعات کافی وجود ندارد، به‌جای حدس‌زدن یک سؤال مشخص بپرس یا از کاربر خروجی دستور لازم را درخواست کن.

## 13.3 Preserve Existing Decisions

تصمیم‌های معماری تأییدشده را دوباره مطرح نکن.

اگر یک تصمیم قبلی با محدودیت واقعی Codebase تناقض داشت:

1. تناقض را دقیق توضیح بده.
2. اثر فنی و امنیتی را بگو.
3. گزینه جایگزین پیشنهاد کن.
4. قبل از تغییر معماری تأیید کاربر را بگیر.

## 13.4 Implementation Style

کاربر می‌خواهد منطق پروژه را یاد بگیرد.

بنابراین:

- قبل از هر قطعه کد، دلیل وجود آن را توضیح بده.
- مسئولیت فایل و جایگاه آن در معماری را مشخص کن.
- از دادن صدها خط کد در یک مرحله خودداری کن.
- تغییرات را کوچک و منطقی نگه دار.
- فقط زمانی کل فایل را بازنویسی کن که واقعاً لازم باشد.
- از Helper، Factory، Base Class یا Interface غیرضروری خودداری کن.
- کدی بنویس که خوانا و قابل نگهداری باشد.
- از پیچیده‌کردن کد برای نمایش معماری استفاده نکن.

## 13.5 Testing Discipline

هیچ‌وقت فقط به این دلیل که کد ظاهراً درست است، یک Phase را کامل اعلام نکن.

برای هر تغییر:

- دستور تست مرتبط را ارائه کن.
- خروجی واقعی تست را بررسی کن.
- در صورت نیاز `npx tsc --noEmit` اجرا شود.
- در تغییرات نهایی Build نیز بررسی شود.
- شکست تست باید بررسی و رفع شود.
- تست‌های موجود نباید بدون دلیل حذف یا Skip شوند.

اگر تست در محیط فعلی قابل اجرا نیست، آن را صریحاً به‌عنوان Pending ثبت کن.

## 13.6 Migration Safety

برای هر Migration:

1. وضعیت داده موجود بررسی شود.
2. Schema جدید تعریف شود.
3. Data Backfill در صورت نیاز طراحی شود.
4. Migration SQL بررسی شود.
5. Constraintها و Relationها تأیید شوند.
6. Migration روی محیط تست اجرا شود.
7. Prisma Validate و Generate اجرا شوند.
8. داده قبلی بررسی شود.

هرگز Migration مخرب را بدون تأیید و برنامه بازگشت پیشنهاد نکن.

## 13.7 Clean Architecture Boundaries

این قوانین اجباری هستند:

- Domain نباید Prisma را Import کند.
- Domain نباید NestJS را Import کند.
- Application نباید Prisma Model را مستقیماً مصرف کند.
- Infrastructure قراردادهای Application را پیاده‌سازی می‌کند.
- HTTP نباید مالک Business Rules باشد.
- Access Control نباید مالک Organization، Branch یا User Identity شود.
- Contextها نباید به Domain داخلی یکدیگر وابسته شوند.
- ارتباط Contextها از قراردادهای مشخص و Adapterها انجام شود.

## 13.8 Error Handling

از Patternهای Shared موجود پروژه استفاده کن.

- Application Errorها در Context مربوطه تعریف شوند.
- Shared Error Category و Base Error حفظ شود.
- Prisma Error Translation در Infrastructure انجام شود.
- Errorهای ناشناخته بدون تبدیل اشتباه به Error اختصاصی عبور کنند.
- Conflict مربوط به Unique Constraint با علت دقیق مدیریت شود.
- Dependency Unavailable با Error استاندارد پروژه گزارش شود.

## 13.9 No Overengineering

این موارد را بدون نیاز واقعی وارد پروژه نکن:

- Generic Authorization Framework
- Generic Repository Framework
- Policy Engine عمومی
- Wildcard Permission
- Role Inheritance
- ABAC
- Distributed Authorization Service
- Long-lived Permission Cache
- Event Sourcing
- پیچیدگی غیرضروری در Domain Eventها
- Abstractionهای چندلایه بدون مصرف واقعی

هر Abstraction باید دلیل مشخص و مصرف‌کننده واقعی داشته باشد.

---

# PART 14 — PHASE TRACKING AND COMPLETION RULES

هدف این سند فقط ارائه معماری نیست؛ باید ابزار مدیریت پیشرفت پروژه نیز باشد.

در شروع توسعه، یک فایل وضعیت ایجاد کن:

`docs/architecture/access-control/IMPLEMENTATION-STATUS.md`

همچنین در صورت نیاز:

`docs/architecture/access-control/ARCHITECTURE.md`

`docs/architecture/access-control/DECISIONS.md`

مسیرها را قبل از ایجاد با ساختار واقعی Docs پروژه تطبیق بده.

## 14.1 Status Values

وضعیت هر Phase یکی از این موارد است:

- NOT STARTED
- IN PROGRESS
- BLOCKED
- COMPLETED
- NEEDS REVIEW

## 14.2 Definition of Done

یک Phase فقط زمانی COMPLETED می‌شود که:

1. تمام Deliverableهای آن ایجاد شده باشند.
2. تمام Acceptance Criteria پاس شده باشند.
3. تست‌های ضروری موفق باشند.
4. TypeScript و Build در صورت ارتباط موفق باشند.
5. هیچ TODO یا Mock ناامن مرتبط با آن Phase باقی نمانده باشد.
6. خروجی واقعی بررسی شده باشد.
7. نتیجه با کاربر مرور و تأیید شده باشد.

صرفاً نوشتن کد یا اعلام اینکه کار تمام شده است، کافی نیست.

## 14.3 Phase Completion Report

در پایان هر Phase، این گزارش را تهیه کن:

```text
PHASE: [Number and Name]

STATUS: COMPLETED / NEEDS REVIEW / BLOCKED

DELIVERABLES:
- ...
- ...

FILES CREATED:
- ...

FILES MODIFIED:
- ...

DATABASE CHANGES:
- ...

TESTS:
- Command:
- Result:

BUILD:
- Command:
- Result:

SECURITY REVIEW:
- ...

OUTSTANDING ITEMS:
- ...

NEXT PHASE:
- ...
```

پس از تأیید Phase توسط کاربر، وضعیت آن در `IMPLEMENTATION-STATUS.md` به COMPLETED تغییر کند.

## 14.4 Progress Checklist

وضعیت اولیه:

```text
[ ] PHASE 0 — Repository Audit and Baseline

[x] PHASE 1 — Requirements and Architecture Design
    Status: COMPLETED — APPROVED BY USER

[ ] PHASE 2 — Database Schema and Migration Design

[ ] PHASE 3 — Permission Registry and Seed

[ ] PHASE 4 — Domain Model

[ ] PHASE 5 — Application Layer and Use Cases

[ ] PHASE 6 — Infrastructure and Authorization Persistence

[ ] PHASE 7 — Audit Logging

[ ] PHASE 8 — Cross-Context Integration

[ ] PHASE 9 — HTTP Layer

[ ] PHASE 10 — Security, Performance and Production Readiness
```

Phase 1 تأیید شده است؛ اما سایر Phaseها نباید صرفاً به دلیل تعریف‌شدن در این سند Completed اعلام شوند.

---

# PART 15 — FINAL ACCEPTANCE CRITERIA

در پایان پروژه، سیستم باید بتواند به‌درستی به سؤالات زیر پاسخ دهد:

1. آیا این User در Organization مشخص عضو فعال است؟
2. آیا این User در Organization مشخص Permission موردنیاز را دارد؟
3. آیا این User در Branch مشخص Permission موردنیاز را دارد؟
4. آیا Permission از Role سازمانی به Branch به ارث رسیده است؟
5. آیا Permission از Role شعبه‌ای حاصل شده است؟
6. آیا DENY Override دسترسی را محدود کرده است؟
7. آیا ALLOW Override معتبر است؟
8. آیا Role اختصاصی متعلق به همان Organization است؟
9. آیا Actor اجازه تفویض Permissionهای Role مقصد را دارد؟
10. آیا Role آرشیوشده از Authorization کنار گذاشته شده است؟
11. آیا RoleAssignment لغوشده فوراً از تصمیم‌های جدید حذف می‌شود؟
12. آیا تغییرات امنیتی Audit شده‌اند؟
13. آیا هیچ Permission بین دو Organization نشت نمی‌کند؟
14. آیا تغییرات Membership و Organization به‌درستی در Authorization اثر می‌گذارند؟
15. آیا هر درخواست جدید بر اساس وضعیت معتبر دیتابیس ارزیابی می‌شود؟

تمام این موارد باید در تست‌های قابل اجرا پوشش داده شوند.

---

# FINAL INSTRUCTION

با استفاده از این سند، توسعه Access Control را مدیریت کن.

**درخواست فعلی من شروع پیاده‌سازی نیست، مگر اینکه صراحتاً Phase موردنظر را اعلام کنم.**

ابتدا وضعیت واقعی Repository را بررسی کن و از PHASE 0 شروع کن.

در تمام مسیر:

- تصمیم‌های تأییدشده را حفظ کن.
- از روی حدس کد ننویس.
- یک Phase را در هر مرحله پیش ببر.
- قبل از عبور به Phase بعد، معیارهای پذیرش را بررسی کن.
- وضعیت پیشرفت را مستند نگه دار.
- ادعای موفقیت تست یا Migration بدون خروجی واقعی نکن.
- اگر نیاز جدیدی مطرح شد، اثر آن را بر معماری بررسی کن.
- برای پیچیدگی بیشتر حتماً دلیل فنی مشخص ارائه بده.
- اولویت با امنیت، صحت داده، خوانایی، قابلیت نگهداری و توسعه‌پذیری است.

هدف نهایی:

**Build a production-ready, secure, scalable and maintainable Access Control system for Tarkhineh Backend using Clean Architecture, DDD and Scoped RBAC — without unnecessary complexity.**
