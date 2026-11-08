# وضعیت پیاده‌سازی مدیریت سازمان‌ها (Organization Management)

## مشخصات سند

| ویژگی | مقدار |
|---|---|
| پروژه | \`tarkhineh-backend\` |
| سند | وضعیت واقعی پیاده‌سازی و نقشهٔ اجرا |
| نسخه | ۱.۰ |
| آخرین بازبینی | ۱۴۰۵/۰۸/۱۷ |
| شاخهٔ بررسی‌شده | \`access-control\` |
| Commit مبنای بررسی | \`869707117fd7a4c4379def6e0c42c262aeee2908\` |
| مرجع معماری | \`MASTER-ARCHITECTURE.md\` نسخهٔ ۱.۰ |
| دفتر تصمیم‌ها | \`ARCHITECTURAL-DECISIONS.md\` نسخهٔ ۱.۰ |
| فاز فعلی | PHASE 0 — تکمیل ممیزی و تأیید خط مبنای معماری |

> این سند فقط آنچه را در Snapshot مشخص‌شدهٔ Repository مشاهده شده ثبت می‌کند. «وجود مدل در Prisma» به معنی وجود Use Case، API، Migration اعمال‌شده یا قابلیت عملیاتی نیست. هیچ نتیجهٔ Build/Test/Database در این بازبینی از اجرای محلی به دست نیامده است.

---

## ۱. جمع‌بندی وضعیت

Organization Management در وضعیت **پیاده‌سازی اولیه و ناقص** قرار دارد. مدل‌های Domain مربوط به Organization و Branch، تعدادی Value Object و تست‌های Unit آن‌ها وجود دارند. از لایهٔ Application فعلاً Command ایجاد Branch دیده می‌شود. Repository و Adapter محدود Prisma برای Branch و بررسی وجود Organization نیز وجود دارند.

اما CRUD سازمان، فهرست و خواندن شعبه، تکمیل چرخهٔ حیات Branch، هر دو نوع Membership، Presentation/API و اتصال عملیاتی به Access Control هنوز در سورس این Context کامل نیستند.

**محدودیت امنیتی مهم:** Provider مربوط به مجوز ایجاد شعبه در ماژول فعلی با Stubای ثبت شده که همیشه \`false\` برمی‌گرداند. این رفتار Fail closed است و باعث می‌شود CreateBranch تا زمان اتصال Authorization واقعی عملاً مجاز نشود؛ این وضعیت نباید به‌عنوان اتصال کامل Access Control تلقی شود.

## ۲. موجودی کد مشاهده‌شده

ساختار فعلی Context:

\`\`\`text
src/contexts/organization-management/
├── application/
│   ├── commands/
│   │   └── create-branch/
│   │       ├── create-branch.command.ts
│   │       └── create-branch.handler.ts
│   ├── errors/
│   └── ports/
│       ├── branch-creation-authorization.port.ts
│       ├── branch.repository.ts
│       └── organization-lookup.port.ts
├── domain/
│   ├── entities/
│   │   ├── branch.ts
│   │   ├── branch.spec.ts
│   │   ├── organization.ts
│   │   └── organization.spec.ts
│   ├── errors/
│   └── value-objects/
└── infrastructure/
    └── persistence/
        ├── prisma-branch.repository.ts
        └── prisma-organization-lookup.adapter.ts
\`\`\`

ماژول NestJS با CQRS و PrismaModule ثبت شده و فقط CreateBranchHandler و Adapterهای فعلی را Wire می‌کند. در Context فعلی پوشهٔ Presentation/Controller مشاهده نشد.

## ۳. وضعیت قابلیت‌ها

| قابلیت | وضعیت مشاهده‌شده | توضیح |
|---|---|---|
| Organization Domain Entity | موجود، ناقص از نظر چرخهٔ حیات | Create، Reconstitute، Rename، Suspend و Activate دارد؛ Repository/Use Case ندارد |
| Organization Slug | موجود | نرمال‌سازی و اعتبارسنجی Slug و تست Unit وجود دارد |
| Organization persistence | پیاده‌سازی نشده در این Context | OrganizationRepository و Adapter مربوطه مشاهده نشد |
| Organization API و Query | پیاده‌سازی نشده | Controller، فهرست و جزئیات مشاهده نشد |
| Branch Domain Entity | موجود | Create، Reconstitute، تغییر مشخصات و Activate/Deactivate دارد |
| Branch Value Objects | موجود | Name، Slug، Address، Location، PhoneNumber و TimeZone همراه تست Unit |
| CreateBranch Command/Handler | موجود، اما عملیاتی نیست | سازمان را فقط از نظر وجود بررسی و مجوز ایجاد را استعلام می‌کند |
| Branch Repository | ناقص | فقط \`existsBySlug\` و \`save\` دارد |
| Organization Lookup Adapter | ناقص | فقط وجود Organization را بررسی می‌کند؛ وضعیت ACTIVE را بررسی نمی‌کند |
| Branch Authorization Adapter | Stub fail-closed | Provider ثبت‌شده همیشه \`false\` می‌دهد |
| Branch read/update/status Use Cases | مشاهده نشد | Find، List، Update، Activate و Deactivate وجود ندارد |
| OrganizationMembership Domain | مشاهده نشد | فقط مدل Prisma وجود دارد |
| BranchMembership Domain | مشاهده نشد | فقط مدل Prisma وجود دارد |
| Membership Use Cases/Repositories | مشاهده نشد | دعوت، فعال‌سازی، تعلیق، حذف منطقی و Query پیاده‌سازی نشده‌اند |
| HTTP Presentation | مشاهده نشد | Route و DTO مربوط به این Context پیدا نشد |
| Application/Infrastructure Integration tests | مشاهده نشد در موجودی این Context | تست‌های فعلی مشاهده‌شده عمدتاً Domain Unit هستند |

## ۴. وضعیت مدل پایگاه داده

فایل‌های Prisma مربوط به این Context:

- \`prisma/models/organization.prisma\`
- \`prisma/models/branch.prisma\`

مدل‌های موجود:

- \`Organization\` با Status برابر \`ACTIVE | SUSPENDED\` و \`ownerUserId\`؛
- \`OrganizationMembership\` با Status برابر \`INVITED | ACTIVE | SUSPENDED | REMOVED\`؛
- \`BranchMembership\` با همان Statusهای عضویت؛
- \`Branch\` با Status برابر \`ACTIVE | INACTIVE\`؛
- \`BranchImage\`، \`BranchWorkingDay\` و \`BranchWorkingPeriod\`.

قیود مهم موجود در Schema:

- \`Organization.slug\` یکتا در کل سامانه؛
- \`(organizationId, slug)\` برای Branch یکتا؛
- \`(organizationId, userId)\` برای OrganizationMembership یکتا؛
- \`(branchId, organizationMembershipId)\` برای BranchMembership یکتا؛
- روابط مرکب BranchMembership که سازمان Branch و OrganizationMembership را هم‌ساز نگه می‌دارند.

Migrationهای مرتبط با پروفایل شعبه در Repository وجود دارند:

- \`20261031135312_add_branch_images_and_location\`
- \`20261031135938_expand_branch_profile_and_working_hours\`

**محدودیت بررسی:** در این کار Migrationها روی دیتابیس اجرا یا وضعیت آن‌ها با CLI بررسی نشده است؛ بنابراین از وجود Migration نمی‌توان نتیجه گرفت که دیتابیس توسعه یا تست در وضعیت Up-to-date قرار دارد.

### ریسک Schema برای بررسی بعدی

چند رابطهٔ مالکیتی در مدل فعلی \`onDelete: Cascade\` دارند. با توجه به هدف حفظ تاریخچه و تصمیم پیشنهادی عدم حذف فیزیکی در v1، پیش از هر Use Case حذف باید اثر Cascade بر Membershipها، Branchها و ارجاعات Access Control بررسی و سیاست Retention تأیید شود.

## ۵. شکاف‌ها و ملاحظات فنی مشاهده‌شده

1. **Organization Lookup فقط وجود را می‌سنجد.** \`CreateBranchHandler\` سازمان Suspend‌شده را از مسیر این Port تشخیص نمی‌دهد. Port باید اطلاعات وضعیت یا قابلیت فعال بودن سازمان را نیز ارائه کند.
2. **Authorization آماده نیست.** Stub فعلی همیشه عدم مجوز برمی‌گرداند. جایگزینی آن با Allow ثابت یا حذف بررسی مجوز ممنوع است؛ باید Adapter متصل به قرارداد رسمی Access Control ساخته شود.
3. **بررسی Slug و ذخیره دو مرحله‌اند.** Unique Constraint دیتابیس و ترجمهٔ خطای P2002 در Repository وجود دارند که برای رقابت هم‌زمان ضروری‌اند؛ تست Integration باید این رفتار را تثبیت کند.
4. **Organization Domain timestamps ندارد.** Schema دارای \`createdAt\` و \`updatedAt\` است، اما \`OrganizationProps\` فعلی این فیلدها را ندارد. Mapping/تاریخچه باید هنگام ساخت Repository تعیین تکلیف شود.
5. **تغییر Slug و مالکیت در Entity فعلی پشتیبانی نشده است.** Slug و \`ownerUserId\` immutable هستند؛ تغییر Slug و انتقال مالکیت نباید با تغییر فیلد عمومی دور زده شوند.
6. **شناسه‌ها باید یکسان تولید شوند.** \`UniqueId\` فعلی UUID تولید می‌کند؛ با توجه به اینکه ID شعبه باید از Application/Domain تأمین شود و سازمان نیز آن را به Repository می‌دهد، Adapter نباید به Default شناسهٔ Prisma اتکا کند.
7. **مدل‌های Membership فقط persistence هستند.** ساخت Domain و Use Case بدون روشن شدن قواعد دعوت مجدد، REMOVED و مالک سازمان شروع نشود.
8. **اطلاعات تصویر و ساعات کاری فقط در Schema موجودند.** وجود مدل‌های Prisma به معنی پیاده‌سازی قواعد Domain، Storage یا API نیست.

## ۶. فازبندی اجرایی

| فاز | عنوان | خروجی لازم برای بستن فاز |
|---:|---|---|
| 0 | ممیزی و تأیید معماری | بررسی کامل سورس، Migration، تست‌ها و تأیید ADRهای باز |
| 1 | Organization Core | Repository، Create/Read/Update، Status lifecycle و تست‌ها |
| 2 | Owner Workflow | اعتبارسنجی User، عضویت اولیه و هماهنگی امن با Role مالک در Access Control |
| 3 | Branch Management | تکمیل Lookup فعال بودن سازمان، Authorization، Create/Read/List/Update/Status و Integration tests |
| 4 | Organization Membership | Domain، Repository، عضویت/دعوت، Activate/Suspend/Remove و Queryها |
| 5 | Branch Membership | Domain، قیود همان سازمان، lifecycle، Role-assignment boundary و تست‌ها |
| 6 | Cross-Context Integration | قراردادهای Identity Access و Access Control بدون Import داخلی و بدون وابستگی دوری |
| 7 | Presentation و Acceptance | Controller/DTO، E2E، آزمون Tenant isolation، Build/Lint/Test و مستندسازی نهایی |

فازها ممکن است در جزئیات با نتیجهٔ ممیزی کامل بازتنظیم شوند؛ هیچ فازی صرفاً با ایجاد فایل یا کلاس بسته نمی‌شود.

## ۷. معیار پذیرش مشترک برای هر فاز

- قواعد و خطاهای Domain تست Unit دارند.
- Use Case موفق، ناموفق، مجاز/غیرمجاز و وضعیت‌های مرزی تست می‌شوند.
- Query و Command در Scope سازمان اجرا می‌شوند و دادهٔ Tenant دیگر را افشا نمی‌کنند.
- قیدهای یکتا و روابط مرکب روی PostgreSQL Integration test دارند.
- خطای Identity/Authorization به موفقیت تبدیل نمی‌شود.
- Migration فقط forward-only است و وضعیت محیط‌ها با دستور واقعی تأیید می‌شود.
- Build، Lint، تست‌های مرتبط و بازبینی Diff نتیجهٔ قابل ثبت دارند.
- Master Architecture، ADR و این سند با وضعیت واقعی کد به‌روز می‌شوند.

## ۸. گام بعدی دقیق

1. ADRهای دارای وضعیت «پیشنهادی» به مالک پروژه ارائه و موارد باز تعیین تکلیف شوند.
2. ممیزی PHASE 0 با تمرکز بر کل Schema/Migrations، اتصال ماژول در AppModule، قراردادهای Authorization و Identity، تست‌های سراسری و قواعد موجود تکمیل شود.
3. پس از تأیید، طراحی و پیاده‌سازی Organization Core آغاز شود؛ قبل از آن، CreateBranch با Allow ثابت یا بدون Authorization فعال نشود.

---

## سابقهٔ بازبینی

| تاریخ | مبنا | نتیجه |
|---|---|---|
| ۱۴۰۵/۰۸/۱۷ | شاخهٔ \`access-control\`، Commit \`869707117fd7a4c4379def6e0c42c262aeee2908\` | Snapshot سورس و Prisma برای ایجاد خط مبنای اولیه بررسی شد؛ دستورات Build/Test/Migration در این بازبینی اجرا نشدند |
