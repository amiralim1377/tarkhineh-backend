import { describe, expect, it } from 'vitest';

import { registerIntegrationTestDatabaseLifecycle } from './integration-test-database.lifecycle.js';

const database = registerIntegrationTestDatabaseLifecycle();

describe('IntegrationTestDatabaseLifecycle', () => {
  it('should connect to the test database before running tests', () => {
    expect(database.isConnected).toBe(true);
  });

  it('should provide an accessible PrismaClient', async () => {
    const result = await database.client.$queryRaw<
      Array<{ database_name: string }>
    >`
      SELECT current_database() AS database_name;
    `;

    expect(result).toHaveLength(1);
    expect(result[0]?.database_name).toBe('tarkhineh_test');
  });
});
