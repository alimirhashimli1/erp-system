// Runs before any test module is imported: ConfigModule validates env at import time.
Object.assign(process.env, {
  NODE_ENV: 'test',
  LOG_LEVEL: 'silent',
  DATABASE_URL: 'postgresql://unused:unused@localhost:5432/unused',
  REDIS_URL: 'redis://localhost:6379',
  JWT_ACCESS_SECRET: 'test-secret-that-is-at-least-32-characters',
  CORS_ORIGINS: 'http://localhost:5173',
  COOKIE_SECURE: 'false',
  JOBS_ENABLED: 'false',
});
