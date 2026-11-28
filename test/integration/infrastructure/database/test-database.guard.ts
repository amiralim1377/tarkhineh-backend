import { Client } from 'pg';
import type { TestDatabaseConfig } from '../config/test-database.config.js';

interface DatabaseIdentity {
  readonly databaseName: string;
  readonly databaseUser: string;
  readonly serverVersion: string;
}

interface DatabaseIdentityRow {
  readonly database_name: string;
  readonly database_user: string;
  readonly server_version: string;
}

export class TestDatabaseGuardError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = TestDatabaseGuardError.name;
  }
}

export class TestDatabaseGuard {
  private static readonly DATABASE_NAME_SUFFIX = '_test';

  constructor(
    private readonly config: TestDatabaseConfig,
    private readonly environment: NodeJS.ProcessEnv = process.env,
  ) {}

  async verify(): Promise<DatabaseIdentity> {
    this.validateEnvironment();
    this.validateConfiguredDatabaseName();

    const client = new Client({
      connectionString: this.config.connectionString,
      connectionTimeoutMillis: 5_000,
      query_timeout: 5_000,
    });

    let connected = false;
    let identity: DatabaseIdentity | undefined;
    let verificationError: TestDatabaseGuardError | undefined;
    let closeError: unknown;

    try {
      await client.connect();
      connected = true;

      const result = await client.query<DatabaseIdentityRow>(`
        SELECT
          current_database() AS database_name,
          current_user AS database_user,
          current_setting('server_version') AS server_version;
      `);

      const row = result.rows[0];

      if (!row) {
        throw new TestDatabaseGuardError(
          'Unable to determine the connected database identity.',
        );
      }

      if (row.database_name !== this.config.databaseName) {
        throw new TestDatabaseGuardError(
          'Connected database does not match the configured test database.',
        );
      }

      identity = Object.freeze({
        databaseName: row.database_name,
        databaseUser: row.database_user,
        serverVersion: row.server_version,
      });
    } catch (error) {
      verificationError =
        error instanceof TestDatabaseGuardError
          ? error
          : new TestDatabaseGuardError(
              'Failed to verify the test database connection. Check PostgreSQL availability and test database credentials.',
              { cause: error },
            );
    } finally {
      if (connected) {
        try {
          await client.end();
        } catch (error) {
          closeError = error;
        }
      }
    }

    if (verificationError && closeError) {
      throw new TestDatabaseGuardError(
        'Test database verification failed and the connection could not be closed.',
        {
          cause: new AggregateError(
            [verificationError, closeError],
            'Database verification and connection cleanup both failed.',
          ),
        },
      );
    }

    if (verificationError) {
      throw verificationError;
    }

    if (closeError) {
      throw new TestDatabaseGuardError(
        'Failed to close the test database verification connection.',
        { cause: closeError },
      );
    }

    if (!identity) {
      throw new TestDatabaseGuardError(
        'Unable to determine the connected database identity.',
      );
    }

    return identity;
  }

  private validateEnvironment(): void {
    if (this.environment.NODE_ENV !== 'test') {
      throw new TestDatabaseGuardError(
        'Database verification is only allowed in the test environment.',
      );
    }
  }

  private validateConfiguredDatabaseName(): void {
    if (
      !this.config.databaseName.endsWith(TestDatabaseGuard.DATABASE_NAME_SUFFIX)
    ) {
      throw new TestDatabaseGuardError(
        `Test database name must end with "${TestDatabaseGuard.DATABASE_NAME_SUFFIX}".`,
      );
    }
  }
}
