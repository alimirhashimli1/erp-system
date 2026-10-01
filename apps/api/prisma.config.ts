import { defineConfig } from 'prisma/config';

// Prisma 7 no longer auto-loads .env; load the repo-root one when present (local dev).
// In containers, variables come from the environment and no file exists.
try {
  process.loadEnvFile('../../.env');
} catch {
  // no .env file — rely on the process environment
}

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed.ts',
  },
  datasource: {
    url: process.env['DATABASE_URL'] ?? '',
  },
});
