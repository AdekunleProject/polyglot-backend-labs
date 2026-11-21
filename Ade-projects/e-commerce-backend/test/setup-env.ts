// Runs before the app is imported. Sets a throwaway environment so the
// integration test can never touch a real database or real payment keys.
process.env.MONGODB_URI =
  process.env.TEST_MONGODB_URI ??
  'mongodb://localhost:27017/ecommerce_it?replicaSet=rs0';
process.env.JWT_SECRET = 'e2e-access-secret-0123456789abcdef';
process.env.JWT_REFRESH_SECRET = 'e2e-refresh-secret-0123456789abcdef';
process.env.JWT_EXPIRES_IN = '15m';
process.env.JWT_REFRESH_EXPIRES_IN = '7d';
process.env.GOOGLE_CLIENT_ID = 'e2e';
process.env.GOOGLE_CLIENT_SECRET = 'e2e';
process.env.GOOGLE_CALLBACK_URL = 'http://localhost/cb';
process.env.PAYSTACK_SECRET_KEY = 'sk_test_e2e_secret';
process.env.PAYSTACK_CALLBACK_URL = 'http://localhost/pay';
process.env.FRONTEND_URL = 'http://localhost:5173';
process.env.AWS_REGION = 'eu-north-1';
process.env.AWS_ACCESS_KEY_ID = 'e2e';
process.env.AWS_SECRET_ACCESS_KEY = 'e2e';
process.env.AWS_S3_BUCKET = 'e2e';
// No admin bootstrap and no email during tests (empty, so a local .env cannot fill them in).
process.env.ADMIN_EMAIL = '';
process.env.ADMIN_PASSWORD = '';
process.env.MAIL_HOST = '';
// Rate limits are real in the app (the guards are registered in AppModule), so
// the tests raise them instead of switching them off.
process.env.THROTTLE_LIMIT = '100000';
process.env.THROTTLE_MULTIPLIER = '1000';
process.env.REDIS_URL = '';

// Safety: the test wipes its database, so it must be clearly a test database.
const dbName = new URL(process.env.MONGODB_URI).pathname.replace('/', '');
if (!dbName.endsWith('_it')) {
  throw new Error(
    `Refusing to run: database "${dbName}" does not end in _it. Use a throwaway database.`,
  );
}
