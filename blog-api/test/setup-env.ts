// Runs before the app is imported. Sets a throwaway environment so the
// integration test can never touch a real database.
process.env.NODE_ENV = 'test';
process.env.DB_HOST = process.env.TEST_DB_HOST ?? 'localhost';
process.env.DB_PORT = process.env.TEST_DB_PORT ?? '5432';
process.env.DB_USER = process.env.TEST_DB_USER ?? 'postgres';
process.env.DB_PASSWORD = process.env.TEST_DB_PASSWORD ?? 'postgres';
process.env.DB_NAME = process.env.TEST_DB_NAME ?? 'blog_it';
process.env.DB_SSL = 'false';
process.env.RUN_MIGRATIONS = 'true';
process.env.JWT_SECRET = 'e2e-access-secret-0123456789abcdef';
process.env.JWT_EXPIRES_IN = '1h';
process.env.FRONTEND_URL = '';

// Safety: the test empties its tables, so the database must clearly be a
// test database.
if (!process.env.DB_NAME.endsWith('_it')) {
  throw new Error(
    `Refusing to run: database "${process.env.DB_NAME}" does not end in _it.`,
  );
}
