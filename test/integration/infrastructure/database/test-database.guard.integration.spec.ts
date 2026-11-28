import { describe, expect, it } from 'vitest';
import { loadTestDatabaseConfig } from '../config/test-database.config.js';
import {
  TestDatabaseGuard,
  TestDatabaseGuardError,
} from './test-database.guard.js';

const testDatabaseConfig = loadTestDatabaseConfig();

const testEnvironment: NodeJS.ProcessEnv = {
  ...process.env,
  NODE_ENV: 'test',
};

describe('TestDatabaseGuard', () => {
  describe('verify', () => {
    it('should verify the identity of the test database', async () => {
      const guard = new TestDatabaseGuard(testDatabaseConfig, testEnvironment);

      const identity = await guard.verify();

      expect(identity).toEqual(
        expect.objectContaining({
          databaseName: testDatabaseConfig.databaseName,
          databaseUser: expect.any(String),
          serverVersion: expect.any(String),
        }),
      );
    });

    it('should return an immutable database identity', async () => {
      const guard = new TestDatabaseGuard(testDatabaseConfig, testEnvironment);

      const identity = await guard.verify();

      expect(Object.isFrozen(identity)).toBe(true);
    });

    it('should reject an environment other than test', async () => {
      const guard = new TestDatabaseGuard(testDatabaseConfig, {
        ...testEnvironment,
        NODE_ENV: 'development',
      });

      await expect(guard.verify()).rejects.toThrow(TestDatabaseGuardError);

      await expect(guard.verify()).rejects.toThrow(
        'Database verification is only allowed in the test environment.',
      );
    });

    it('should reject a database name without the test suffix', async () => {
      const guard = new TestDatabaseGuard(
        {
          ...testDatabaseConfig,
          databaseName: 'tarkhineh',
        },
        testEnvironment,
      );

      await expect(guard.verify()).rejects.toThrow(TestDatabaseGuardError);

      await expect(guard.verify()).rejects.toThrow(
        'Test database name must end with "_test".',
      );
    });

    it('should reject a database that does not match the configured name', async () => {
      const guard = new TestDatabaseGuard(
        {
          ...testDatabaseConfig,
          databaseName: 'another_test',
        },
        testEnvironment,
      );

      await expect(guard.verify()).rejects.toThrow(TestDatabaseGuardError);

      await expect(guard.verify()).rejects.toThrow(
        'Connected database does not match the configured test database.',
      );
    });
  });
});
