import { z } from 'zod';

const getDatabaseNameFromUrl = (value: string): string | null => {
  try {
    const url = new URL(value);

    if (!['postgres:', 'postgresql:'].includes(url.protocol)) {
      return null;
    }

    const encodedDatabaseName = url.pathname.slice(1);

    if (!encodedDatabaseName || encodedDatabaseName.includes('/')) {
      return null;
    }

    const databaseName = decodeURIComponent(encodedDatabaseName);

    if (!databaseName || databaseName.includes('/')) {
      return null;
    }

    return databaseName;
  } catch {
    return null;
  }
};

const isPostgresUrl = (value: string): boolean => {
  try {
    const url = new URL(value);

    return (
      ['postgres:', 'postgresql:'].includes(url.protocol) &&
      url.hostname.length > 0 &&
      getDatabaseNameFromUrl(value) !== null
    );
  } catch {
    return false;
  }
};

export const testDatabaseSchema = z
  .object({
    NODE_ENV: z.literal('test'),

    TEST_DATABASE_URL: z
      .string()
      .refine(
        isPostgresUrl,
        'TEST_DATABASE_URL must be a valid PostgreSQL connection URL',
      ),

    TEST_DATABASE_NAME: z.string().trim().min(1),
  })
  .superRefine((config, ctx) => {
    const databaseName = getDatabaseNameFromUrl(config.TEST_DATABASE_URL);

    if (databaseName !== config.TEST_DATABASE_NAME) {
      ctx.addIssue({
        code: 'custom',
        path: ['TEST_DATABASE_NAME'],
        message:
          'TEST_DATABASE_NAME must match the database name in TEST_DATABASE_URL',
      });
    }
  });

export type TestDatabaseEnvironment = z.infer<typeof testDatabaseSchema>;
