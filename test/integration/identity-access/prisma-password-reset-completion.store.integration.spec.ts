function createTestDatabaseUrl(): string {
  const configuredUrl = process.env.DATABASE_URL;

  if (!configuredUrl) {
    throw new Error('DATABASE_URL must be configured for integration tests');
  }

  const url = new URL(configuredUrl);

  const databaseName = decodeURIComponent(url.pathname).replace(/^\/+/, '');

  if (databaseName !== 'tarkhineh_db') {
    throw new Error(
      'Refusing to run password-reset integration tests from an unexpected database URL',
    );
  }

  url.pathname = '/tarkhineh_test';

  return url.toString();
}
