import { describe, expect, it } from 'vitest';
import { loadTestDatabaseConfig } from './test-database.config.js';

const validEnvironment: NodeJS.ProcessEnv = {
  NODE_ENV: 'test',
  TEST_DATABASE_URL:
    'postgresql://test_user:test_password@127.0.0.1:5433/tarkhineh_test',
  TEST_DATABASE_NAME: 'tarkhineh_test',
};

describe('loadTestDatabaseConfig', () => {
  it('should load a valid PostgreSQL test database configuration', () => {
    const config = loadTestDatabaseConfig(validEnvironment);

    expect(config).toEqual({
      connectionString: validEnvironment.TEST_DATABASE_URL,
      databaseName: 'tarkhineh_test',
      host: '127.0.0.1',
      port: 5433,
    });
  });

  it('should use PostgreSQL default port when port is omitted', () => {
    const environment = {
      ...validEnvironment,
      TEST_DATABASE_URL:
        'postgresql://test_user:test_password@localhost/tarkhineh_test',
    };

    const config = loadTestDatabaseConfig(environment);

    expect(config.port).toBe(5432);
  });

  it('should reject a non-PostgreSQL connection URL', () => {
    const environment = {
      ...validEnvironment,
      TEST_DATABASE_URL:
        'mysql://test_user:test_password@localhost/tarkhineh_test',
    };

    expect(() => loadTestDatabaseConfig(environment)).toThrow();
  });

  it('should reject an invalid connection URL', () => {
    const environment = {
      ...validEnvironment,
      TEST_DATABASE_URL: 'invalid-url',
    };

    expect(() => loadTestDatabaseConfig(environment)).toThrow();
  });

  it('should reject an environment other than test', () => {
    const environment = {
      ...validEnvironment,
      NODE_ENV: 'development',
    };

    expect(() => loadTestDatabaseConfig(environment)).toThrow();
  });

  it('should reject a database name that does not match the URL', () => {
    const environment = {
      ...validEnvironment,
      TEST_DATABASE_NAME: 'another_database',
    };

    expect(() => loadTestDatabaseConfig(environment)).toThrow();
  });

  it('should reject missing required environment variables', () => {
    expect(() =>
      loadTestDatabaseConfig({
        NODE_ENV: 'test',
      }),
    ).toThrow();
  });

  it('should return an immutable configuration object', () => {
    const config = loadTestDatabaseConfig(validEnvironment);

    expect(Object.isFrozen(config)).toBe(true);
  });
});
