// Runs before the app is imported. Sets a throwaway environment so the
// integration test can never touch a real database, send mail or reach AWS.
process.env.NODE_ENV = 'test';
process.env.DB_HOST = process.env.TEST_DB_HOST ?? 'localhost';
process.env.DB_PORT = process.env.TEST_DB_PORT ?? '5432';
process.env.DB_USER = process.env.TEST_DB_USER ?? 'postgres';
process.env.DB_PASSWORD = process.env.TEST_DB_PASSWORD ?? 'postgres';
process.env.DB_NAME = process.env.TEST_DB_NAME ?? 'blog_it';
process.env.DB_SSL = 'false';
process.env.RUN_MIGRATIONS = 'true';
process.env.JWT_SECRET = 'e2e-access-secret-0123456789abcdef';
process.env.JWT_REFRESH_SECRET = 'e2e-refresh-secret-fedcba9876543210';
process.env.JWT_EXPIRES_IN = '15m';
process.env.JWT_REFRESH_EXPIRES_IN = '7d';
process.env.FRONTEND_URL = '';
// Many sign-ins from one address in a minute are normal in a test.
process.env.THROTTLE_LIMIT = '100000';
process.env.THROTTLE_MULTIPLIER = '1000';
process.env.ADMIN_EMAIL = 'admin@e2e.test';
process.env.ADMIN_PASSWORD = 'Admin-Passw0rd-e2e!';
for (const key of ['MAIL_HOST', 'AWS_S3_BUCKET', 'GOOGLE_CLIENT_ID']) {
  delete process.env[key];
}

// Safety: the test empties its tables, so the database must clearly be a
// test database.
if (!process.env.DB_NAME.endsWith('_it')) {
  throw new Error(
    `Refusing to run: database "${process.env.DB_NAME}" does not end in _it.`,
  );
}
