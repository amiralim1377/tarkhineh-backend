import {
  testDatabaseSchema,
  type TestDatabaseEnvironment,
} from './test-database.schema.js';

export interface TestDatabaseConfig {
  readonly connectionString: string;
  readonly databaseName: string;
  readonly host: string;
  readonly port: number;
}

export function loadTestDatabaseConfig(
  environment: NodeJS.ProcessEnv = process.env,
): TestDatabaseConfig {
  const parsed = testDatabaseSchema.safeParse(environment);

  if (!parsed.success) {
    const errors = parsed.error.issues
      .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
      .join('\n');

    throw new Error(
      `Invalid Integration Test Database Configuration:\n${errors}`,
    );
  }

  const config: TestDatabaseEnvironment = parsed.data;
  const url = new URL(config.TEST_DATABASE_URL);

  return Object.freeze({
    connectionString: config.TEST_DATABASE_URL,
    databaseName: config.TEST_DATABASE_NAME,
    host: url.hostname,
    port: url.port ? Number(url.port) : 5432,
  });
}
