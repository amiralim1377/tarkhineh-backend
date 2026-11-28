import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../../../src/generated/prisma/client.js';

import type { TestDatabaseConfig } from '../config/test-database.config.js';
import { TestDatabaseGuard } from './test-database.guard.js';

export class IntegrationTestDatabaseManager {
  private prismaClient: PrismaClient | null = null;

  private startPromise: Promise<void> | null = null;

  private stopPromise: Promise<void> | null = null;

  constructor(
    private readonly config: TestDatabaseConfig,
    private readonly environment: NodeJS.ProcessEnv = process.env,
  ) {}

  get isConnected(): boolean {
    return this.prismaClient !== null;
  }

  get client(): PrismaClient {
    if (!this.prismaClient) {
      throw new Error(
        'Integration test database is not connected. Call start() first.',
      );
    }

    return this.prismaClient;
  }

  async start(): Promise<void> {
    // Wait for an ongoing disconnect before starting a new connection.
    if (this.stopPromise) {
      await this.stopPromise;
    }

    if (this.prismaClient) {
      return;
    }

    // Share an ongoing initialization between concurrent callers.
    if (this.startPromise) {
      await this.startPromise;
      return;
    }

    const operation = this.initialize();

    this.startPromise = operation;

    try {
      await operation;
    } finally {
      if (this.startPromise === operation) {
        this.startPromise = null;
      }
    }
  }

  async stop(): Promise<void> {
    // Share an ongoing disconnect between concurrent callers.
    if (this.stopPromise) {
      await this.stopPromise;
      return;
    }

    const operation = this.disconnect();

    this.stopPromise = operation;

    try {
      await operation;
    } finally {
      if (this.stopPromise === operation) {
        this.stopPromise = null;
      }
    }
  }

  private async disconnect(): Promise<void> {
    // Wait for initialization to finish before disconnecting.
    if (this.startPromise) {
      try {
        await this.startPromise;
      } catch {
        // Failed initialization leaves no connected client to stop.
        return;
      }
    }

    if (!this.prismaClient) {
      return;
    }

    const client = this.prismaClient;

    await client.$disconnect();

    // Keep the client reference if disconnect fails.
    if (this.prismaClient === client) {
      this.prismaClient = null;
    }
  }

  private async initialize(): Promise<void> {
    const guard = new TestDatabaseGuard(this.config, this.environment);

    await guard.verify();

    const client = new PrismaClient({
      adapter: new PrismaPg({
        connectionString: this.config.connectionString,
      }),
    });

    try {
      await client.$connect();

      this.prismaClient = client;
    } catch (error) {
      await client.$disconnect().catch(() => undefined);

      throw error;
    }
  }
}
