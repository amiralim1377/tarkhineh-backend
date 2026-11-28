import { beforeEach, describe, expect, it, vi } from 'vitest';

import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../../../src/generated/prisma/client.js';

import type { TestDatabaseConfig } from '../config/test-database.config.js';
import { IntegrationTestDatabaseManager } from './integration-test-database.manager.js';
import { TestDatabaseGuard } from './test-database.guard.js';

vi.mock('@prisma/adapter-pg', () => ({
  PrismaPg: vi.fn(),
}));

vi.mock('../../../../src/generated/prisma/client.js', () => ({
  PrismaClient: vi.fn(),
}));

vi.mock('./test-database.guard.js', () => ({
  TestDatabaseGuard: vi.fn(),
}));

const mockConnect = vi.fn();
const mockDisconnect = vi.fn();
const mockVerify = vi.fn();

const testDatabaseConfig: TestDatabaseConfig = {
  connectionString: 'postgresql://test:test@127.0.0.1:5433/tarkhineh_test',
  databaseName: 'tarkhineh_test',
  host: '127.0.0.1',
  port: 5433,
};

const createManager = (
  environment: NodeJS.ProcessEnv = { NODE_ENV: 'test' },
): IntegrationTestDatabaseManager => {
  return new IntegrationTestDatabaseManager(testDatabaseConfig, environment);
};

describe('IntegrationTestDatabaseManager', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockConnect.mockReset();
    mockDisconnect.mockReset();
    mockVerify.mockReset();

    mockConnect.mockResolvedValue(undefined);
    mockDisconnect.mockResolvedValue(undefined);

    mockVerify.mockResolvedValue({
      databaseName: 'tarkhineh_test',
      databaseUser: 'test',
      serverVersion: '18.0',
    });

    vi.mocked(PrismaPg).mockImplementation(
      class MockPrismaPg {} as unknown as typeof PrismaPg,
    );

    vi.mocked(PrismaClient).mockImplementation(
      class MockPrismaClient {
        $connect = mockConnect;
        $disconnect = mockDisconnect;
      } as unknown as typeof PrismaClient,
    );

    vi.mocked(TestDatabaseGuard).mockImplementation(
      class MockTestDatabaseGuard {
        verify = mockVerify;
      } as unknown as typeof TestDatabaseGuard,
    );
  });

  describe('client', () => {
    it('should throw when database is not connected', () => {
      const manager = createManager();

      expect(() => manager.client).toThrow(
        'Integration test database is not connected. Call start() first.',
      );
    });
  });

  describe('isConnected', () => {
    it('should return false before starting', () => {
      const manager = createManager();

      expect(manager.isConnected).toBe(false);
    });

    it('should return true after successful connection', async () => {
      const manager = createManager();

      await manager.start();

      expect(manager.isConnected).toBe(true);
    });

    it('should return false after stopping', async () => {
      const manager = createManager();

      await manager.start();
      await manager.stop();

      expect(manager.isConnected).toBe(false);
    });
  });

  describe('start', () => {
    it('should verify the database before creating PrismaClient', async () => {
      const manager = createManager();

      await manager.start();

      expect(TestDatabaseGuard).toHaveBeenCalledWith(
        testDatabaseConfig,
        expect.any(Object),
      );

      expect(mockVerify).toHaveBeenCalledOnce();

      expect(PrismaClient).toHaveBeenCalledOnce();
      expect(mockConnect).toHaveBeenCalledOnce();
    });

    it('should create PrismaClient with PrismaPg adapter', async () => {
      const manager = createManager();

      await manager.start();

      expect(PrismaPg).toHaveBeenCalledWith({
        connectionString: testDatabaseConfig.connectionString,
      });

      expect(PrismaClient).toHaveBeenCalledWith({
        adapter: expect.any(Object),
      });
    });

    it('should not create multiple clients when called repeatedly', async () => {
      const manager = createManager();

      await manager.start();
      await manager.start();
      await manager.start();

      expect(TestDatabaseGuard).toHaveBeenCalledOnce();
      expect(PrismaClient).toHaveBeenCalledOnce();
      expect(mockConnect).toHaveBeenCalledOnce();
    });

    it('should share the same initialization when called concurrently', async () => {
      let resolveVerification!: (value: {
        databaseName: string;
        databaseUser: string;
        serverVersion: string;
      }) => void;

      let resolveConnection!: () => void;

      mockVerify.mockImplementation(
        () =>
          new Promise((resolve) => {
            resolveVerification = resolve;
          }),
      );

      mockConnect.mockImplementation(
        () =>
          new Promise<void>((resolve) => {
            resolveConnection = resolve;
          }),
      );

      const manager = createManager();

      const firstStart = manager.start();
      const secondStart = manager.start();

      await vi.waitFor(() => {
        expect(mockVerify).toHaveBeenCalledOnce();
      });

      expect(TestDatabaseGuard).toHaveBeenCalledOnce();

      resolveVerification({
        databaseName: 'tarkhineh_test',
        databaseUser: 'test',
        serverVersion: '18.0',
      });

      await vi.waitFor(() => {
        expect(mockConnect).toHaveBeenCalledOnce();
      });

      expect(PrismaClient).toHaveBeenCalledOnce();

      resolveConnection();

      await Promise.all([firstStart, secondStart]);

      expect(manager.isConnected).toBe(true);
    });

    it('should not create PrismaClient when database guard fails', async () => {
      mockVerify.mockRejectedValueOnce(new Error('Database guard failed'));

      const manager = createManager();

      await expect(manager.start()).rejects.toThrow('Database guard failed');

      expect(mockVerify).toHaveBeenCalledOnce();
      expect(PrismaClient).not.toHaveBeenCalled();
    });

    it('should disconnect PrismaClient when connection fails', async () => {
      mockConnect.mockRejectedValueOnce(new Error('Connection failed'));

      const manager = createManager();

      await expect(manager.start()).rejects.toThrow('Connection failed');

      expect(mockDisconnect).toHaveBeenCalledOnce();
      expect(manager.isConnected).toBe(false);
    });

    it('should allow retry after a failed connection', async () => {
      mockConnect
        .mockRejectedValueOnce(new Error('Connection failed'))
        .mockResolvedValueOnce(undefined);

      const manager = createManager();

      await expect(manager.start()).rejects.toThrow('Connection failed');

      await manager.start();

      expect(PrismaClient).toHaveBeenCalledTimes(2);
      expect(mockConnect).toHaveBeenCalledTimes(2);
      expect(mockDisconnect).toHaveBeenCalledOnce();
      expect(manager.isConnected).toBe(true);
    });
  });

  describe('stop', () => {
    it('should disconnect PrismaClient', async () => {
      const manager = createManager();

      await manager.start();
      await manager.stop();

      expect(mockDisconnect).toHaveBeenCalledOnce();
    });

    it('should do nothing when called before start', async () => {
      const manager = createManager();

      await manager.stop();

      expect(mockDisconnect).not.toHaveBeenCalled();
    });

    it('should be safe when called repeatedly', async () => {
      const manager = createManager();

      await manager.start();

      await manager.stop();
      await manager.stop();

      expect(mockDisconnect).toHaveBeenCalledOnce();
    });

    it('should allow starting again after stopping', async () => {
      const manager = createManager();

      await manager.start();
      await manager.stop();
      await manager.start();

      expect(PrismaClient).toHaveBeenCalledTimes(2);
      expect(mockConnect).toHaveBeenCalledTimes(2);
      expect(mockDisconnect).toHaveBeenCalledOnce();
      expect(manager.isConnected).toBe(true);
    });

    it('should wait for an ongoing start before disconnecting', async () => {
      let resolveConnection!: () => void;

      mockConnect.mockImplementation(
        () =>
          new Promise<void>((resolve) => {
            resolveConnection = resolve;
          }),
      );

      const manager = createManager();

      const startPromise = manager.start();

      await vi.waitFor(() => {
        expect(mockConnect).toHaveBeenCalledOnce();
      });

      const stopPromise = manager.stop();

      expect(mockDisconnect).not.toHaveBeenCalled();

      resolveConnection();

      await Promise.all([startPromise, stopPromise]);

      expect(mockDisconnect).toHaveBeenCalledOnce();
      expect(manager.isConnected).toBe(false);
    });

    it('should not fail when start fails while stop is waiting', async () => {
      let rejectConnection!: (error: Error) => void;

      mockConnect.mockImplementation(
        () =>
          new Promise<void>((_, reject) => {
            rejectConnection = reject;
          }),
      );

      const manager = createManager();

      const startPromise = manager.start();

      await vi.waitFor(() => {
        expect(mockConnect).toHaveBeenCalledOnce();
      });

      const stopPromise = manager.stop();

      rejectConnection(new Error('Connection failed'));

      await expect(startPromise).rejects.toThrow('Connection failed');

      await expect(stopPromise).resolves.toBeUndefined();

      expect(mockDisconnect).toHaveBeenCalledOnce();
      expect(manager.isConnected).toBe(false);
    });

    it('should preserve the client when disconnect fails and allow retry', async () => {
      mockDisconnect
        .mockRejectedValueOnce(new Error('Disconnect failed'))
        .mockResolvedValueOnce(undefined);

      const manager = createManager();

      await manager.start();

      await expect(manager.stop()).rejects.toThrow('Disconnect failed');

      expect(manager.isConnected).toBe(true);

      await manager.stop();

      expect(mockDisconnect).toHaveBeenCalledTimes(2);
      expect(manager.isConnected).toBe(false);
    });

    it('should share the same disconnect operation when called concurrently', async () => {
      let resolveDisconnect!: () => void;

      mockDisconnect.mockImplementation(
        () =>
          new Promise<void>((resolve) => {
            resolveDisconnect = resolve;
          }),
      );

      const manager = createManager();

      await manager.start();

      const firstStop = manager.stop();
      const secondStop = manager.stop();

      await vi.waitFor(() => {
        expect(mockDisconnect).toHaveBeenCalledOnce();
      });

      resolveDisconnect();

      await Promise.all([firstStop, secondStop]);

      expect(mockDisconnect).toHaveBeenCalledOnce();
      expect(manager.isConnected).toBe(false);
    });

    it('should wait for an ongoing stop before starting again', async () => {
      let resolveDisconnect!: () => void;

      mockDisconnect.mockImplementationOnce(
        () =>
          new Promise<void>((resolve) => {
            resolveDisconnect = resolve;
          }),
      );

      const manager = createManager();

      await manager.start();

      const stopPromise = manager.stop();

      await vi.waitFor(() => {
        expect(mockDisconnect).toHaveBeenCalledOnce();
      });

      const startPromise = manager.start();

      // The new client must not be created before disconnect completes.
      expect(PrismaClient).toHaveBeenCalledOnce();

      resolveDisconnect();

      await Promise.all([stopPromise, startPromise]);

      expect(PrismaClient).toHaveBeenCalledTimes(2);
      expect(mockConnect).toHaveBeenCalledTimes(2);
      expect(mockDisconnect).toHaveBeenCalledOnce();
      expect(manager.isConnected).toBe(true);
    });
  });
});
