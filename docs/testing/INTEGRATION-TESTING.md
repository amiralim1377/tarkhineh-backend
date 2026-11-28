# Integration Testing

## 1. Overview

This document describes the integration testing infrastructure used in the Tarkhineh backend.

Integration tests verify the interaction between application components and real infrastructure dependencies, including PostgreSQL, Prisma, Redis, and NestJS modules.

Integration tests are kept separate from unit and end-to-end tests.

### Test configuration files

| File                           | Responsibility    |
| ------------------------------ | ----------------- |
| `vitest.config.ts`             | Unit tests        |
| `vitest.config.e2e.ts`         | End-to-end tests  |
| `vitest.config.integration.ts` | Integration tests |

Integration test files must use the `.integration.spec.ts` suffix.

The integration test configuration runs files matching:

```text
test/integration/**/*.integration.spec.ts
```

Integration test files are executed without file-level parallelism to reduce database contention.

---

## 2. Prerequisites

Before running integration tests, ensure the following requirements are met:

- Node.js and npm are installed.
- Project dependencies are installed.
- PostgreSQL is running and accessible.
- A dedicated PostgreSQL test database exists.
- The Prisma client has been generated.

Install dependencies:

```bash
npm install
```

Generate the Prisma client when necessary:

```bash
npx prisma generate
```

### PostgreSQL test database

Integration tests must use a dedicated database.

Example:

```text
tarkhineh_test
```

Do not configure the production or development database as the integration test database.

The test database must be accessible using the credentials configured in `.env.test`.

---

## 3. Environment Configuration

Create a `.env.test` file in the project root.

Example:

```dotenv
NODE_ENV=test

TEST_DATABASE_URL=postgresql://USER:PASSWORD@127.0.0.1:5433/tarkhineh_test
TEST_DATABASE_NAME=tarkhineh_test
```

Replace `USER` and `PASSWORD` with the PostgreSQL credentials configured on your machine.

### Environment variables

| Variable             | Description                                     |
| -------------------- | ----------------------------------------------- |
| `NODE_ENV`           | Must be `test`                                  |
| `TEST_DATABASE_URL`  | PostgreSQL connection URL for the test database |
| `TEST_DATABASE_NAME` | Expected test database name                     |

The `.env.test` file is excluded from Git and must not be committed.

The example environment file is available at `.env.example`.

### DATABASE_URL handling

The integration test setup loads `.env.test`, validates the test database configuration, verifies the database connection, and then assigns the validated test connection string to:

```typescript
process.env.DATABASE_URL;
```

This ensures application components that read `DATABASE_URL` use the test database during integration tests.

---

## 4. Test Database Safety

The test database infrastructure prevents integration tests from accidentally connecting to an unintended database.

### TestDatabaseSchema

Location:

```text
test/integration/infrastructure/config/test-database.schema.ts
```

Responsibilities:

- Validates `NODE_ENV`.
- Validates the PostgreSQL connection URL.
- Extracts the database name from the connection URL.
- Ensures `TEST_DATABASE_NAME` matches the database name in the URL.

### TestDatabaseConfig

Location:

```text
test/integration/infrastructure/config/test-database.config.ts
```

The `loadTestDatabaseConfig()` function validates the environment and returns an immutable configuration object containing:

- Connection string
- Database name
- Host
- Port

### TestDatabaseGuard

Location:

```text
test/integration/infrastructure/database/test-database.guard.ts
```

Before opening a test database connection, the guard verifies:

1. `NODE_ENV` is set to `test`.
2. The configured database name ends with `_test`.
3. PostgreSQL is reachable.
4. The actual connected database matches the configured database name.

The guard returns an immutable database identity containing:

- Database name
- Database user
- PostgreSQL server version

If verification fails, a `TestDatabaseGuardError` is thrown.

The guard also preserves verification and connection-closing errors for troubleshooting.

---

## 5. Database Migrations

Integration tests require the test database schema to be up to date.

The project provides a dedicated migration runner.

### Apply pending migrations

```bash
npm run test:int:migrate
```

This command:

1. Loads `.env.test`.
2. Validates the test database configuration.
3. Verifies database safety.
4. Executes:

```bash
npx prisma migrate deploy
```

Only pending migrations are applied.

The migration runner does not reset existing data.

---

## 6. Reset Test Database

To reset the test database and apply migrations again:

```bash
npm run test:int:reset
```

This command executes:

```bash
npx prisma migrate reset --force
```

The reset process removes existing test database data and reapplies the migrations.

### Seed execution

The Prisma configuration defines:

```typescript
migrations: {
  path: "prisma/migrations",
  seed: "tsx prisma/seed.ts",
}
```

Therefore, Prisma executes the configured seed after a successful migration reset.

The seed synchronizes the Access Control Registry and System Roles.

**Warning:** Reset is destructive. Never point this command at a development or production database.

---

## 7. Running Integration Tests

Run the complete integration test suite:

```bash
npm run test:integration
```

Equivalent command:

```bash
npx vitest run --config vitest.config.integration.ts
```

### Run a single integration test file

Example:

```bash
npx vitest run \
  --config vitest.config.integration.ts \
  test/integration/infrastructure/testing/integration-test-context.integration.spec.ts
```

### Run TypeScript validation

```bash
npx tsc --noEmit
```

### Test commands summary

| Command                    | Description                                       |
| -------------------------- | ------------------------------------------------- |
| `npm test`                 | Runs unit tests                                   |
| `npm run test:e2e`         | Runs E2E tests                                    |
| `npm run test:integration` | Runs integration tests                            |
| `npm run test:int:migrate` | Applies pending test database migrations          |
| `npm run test:int:reset`   | Resets the test database and reapplies migrations |

---

## 8. Database Lifecycle

Location:

```text
test/integration/infrastructure/database/
```

The integration database lifecycle is managed by:

- `IntegrationTestDatabaseManager`
- `IntegrationTestDatabaseLifecycle`

### IntegrationTestDatabaseManager

The manager is responsible for:

- Verifying the test database before connecting.
- Creating a Prisma client using `PrismaPg`.
- Managing database connections.
- Preventing duplicate concurrent initialization.
- Handling connection failures.
- Supporting safe disconnection and reconnection.

The manager exposes:

```typescript
database.isConnected;
database.client;
database.start();
database.stop();
```

Accessing `database.client` before a successful connection throws an error.

### IntegrationTestDatabaseLifecycle

The lifecycle registers Vitest hooks:

```typescript
beforeAll(async () => {
  await databaseManager.start();
});

afterAll(async () => {
  await databaseManager.stop();
});
```

This ensures the database connection is established before tests run and closed after the test file finishes.

### Public database testing API

The public registration function is:

```typescript
registerIntegrationTestDatabase();
```

It registers the database lifecycle and returns the database manager.

---

## 9. Integration Test Context

Location:

```text
test/integration/infrastructure/testing/integration-test-context.ts
```

The recommended entry point for integration tests that need the Menu test factories is:

```typescript
registerIntegrationTestContext();
```

Example:

```typescript
const testContext = registerIntegrationTestContext();
```

The returned context exposes:

```typescript
testContext.database;
testContext.cleanup;
testContext.menu;
```

The `menu` property provides access to all Menu test factories.

Factory instances are created lazily and reused within the same test file.

### Automatic cleanup

The context registers an `afterEach` hook:

```typescript
afterEach(async () => {
  await cleanup.clean();
});
```

Consequently, registered test data cleanup tasks are executed automatically after each test.

Tests should not need to manually clean up factory-created records under normal circumstances.

---

## 10. Test Data Factories

Location:

```text
test/integration/infrastructure/testing/factories/
```

The current factory collection focuses on the Menu domain.

### Available factories

| Factory                   | Responsibility                            |
| ------------------------- | ----------------------------------------- |
| `MenuTestContextFactory`  | Creates a User, Organization, and Branch  |
| `MenuCategoryFactory`     | Creates a Menu Category                   |
| `MenuItemFactory`         | Creates a Menu Item                       |
| `MenuItemCategoryFactory` | Creates a Menu Item–Category relationship |
| `BranchMenuItemFactory`   | Creates a Branch Menu Item                |

### MenuTestContextFactory

Creates the base test context:

- User
- Organization
- Branch

These records are created inside a Prisma transaction.

The factory returns the created records so other factories can use their IDs.

### Example usage

```typescript
const testContext = registerIntegrationTestContext();

const context = await testContext.menu.context.create();

const category = await testContext.menu.category.create({
  organizationId: context.organization.id,
  nameFa: 'نوشیدنی‌ها',
});

const item = await testContext.menu.item.create({
  organizationId: context.organization.id,
  nameFa: 'قهوه اسپرسو',
  basePrice: 120_000n,
  status: 'ACTIVE',
});

const itemCategory = await testContext.menu.itemCategory.create({
  organizationId: context.organization.id,
  menuItemId: item.id,
  categoryId: category.id,
});

const branchMenuItem = await testContext.menu.branchMenuItem.create({
  organizationId: context.organization.id,
  branchId: context.branch.id,
  menuItemId: item.id,
});
```

Each factory registers its own cleanup task after successfully creating a record.

---

## 11. Cleanup Strategy

Location:

```text
test/integration/infrastructure/testing/cleanup/integration-test-cleanup.ts
```

`IntegrationTestCleanup` manages cleanup tasks registered by factories.

### Cleanup behavior

The cleanup implementation provides:

- Last-in, first-out (LIFO) execution.
- Asynchronous cleanup.
- Continued execution when an individual cleanup task fails.
- Aggregation of cleanup errors using `AggregateError`.
- Protection against concurrent cleanup execution.
- Protection against registering new tasks while cleanup is running.

### Why LIFO?

Related database records must be deleted in dependency order.

For example:

```text
BranchMenuItem
      ↓
MenuItemCategory
      ↓
MenuItem / MenuCategory
      ↓
Branch
      ↓
Organization
      ↓
User
```

Cleanup tasks are executed in reverse registration order so dependent records are removed before their parents.

If cleanup fails, the test reports the error instead of silently ignoring it.

---

## 12. Redis Integration Tests

Redis-backed rate-limiting integration suites are opt-in.

By default, the Redis-specific integration suites are skipped.

To enable them:

```bash
RATE_LIMIT_REDIS_INTEGRATION=true npm run test:integration
```

Redis must be running and accessible.

Optional Redis connection settings:

```dotenv
RATE_LIMIT_TEST_REDIS_HOST=127.0.0.1
RATE_LIMIT_TEST_REDIS_PORT=6379
```

When these variables are omitted, the rate-limiting integration tests use:

```text
127.0.0.1:6379
```

The Redis tests use isolated key prefixes and remove only keys created within their test namespaces.

Do not use a production Redis instance for these tests.

---

## 13. Best Practices

When writing new integration tests:

1. Use the integration Vitest configuration.
2. Name test files with the `.integration.spec.ts` suffix.
3. Use the dedicated test database.
4. Never hardcode production or development database credentials.
5. Use `registerIntegrationTestContext()` when Menu factories are needed.
6. Prefer factories over manually creating repeated test fixtures.
7. Keep test data isolated using unique IDs.
8. Ensure created records are cleaned up.
9. Avoid depending on data created by another test.
10. Do not run destructive reset operations against non-test databases.
11. Use isolated Redis namespaces for Redis integration tests.
12. Keep integration tests independent and repeatable.

---

## 14. Integration Test Directory Structure

```text
test/integration/
├── access-control/
├── health/
├── http/
├── identity-access/
├── infrastructure/
│   ├── config/
│   ├── database/
│   └── testing/
│       ├── cleanup/
│       └── factories/
│           └── menu/
├── organization-management/
├── outbound-email/
├── prisma/
├── rate-limiting/
├── scripts/
└── setup/
```

The infrastructure directory contains shared utilities used by integration tests.

Domain-specific integration tests remain organized by their respective contexts.

---

## 15. Recommended Workflow

A typical local integration testing workflow:

```bash
# 1. Generate Prisma client if necessary
npx prisma generate

# 2. Apply pending migrations
npm run test:int:migrate

# 3. Run TypeScript validation
npx tsc --noEmit

# 4. Run integration tests
npm run test:integration
```

If the test database needs to be recreated:

```bash
npm run test:int:reset
```

After reset, run the integration suite again.

---

## 16. Important Notes

- `.env.test` must remain local and must never be committed.
- The test database name must end with `_test`.
- The configured database name must match the database name in the connection URL.
- Database safety verification runs before integration test database connections.
- Redis-backed rate-limiting integration tests are disabled unless explicitly enabled.
- Database reset operations are destructive.
- Integration tests must not rely on execution order or shared persistent data.
