// Usage: pnpm --filter @procurestack/api db:new-migration <snake_case_name>
// Docker-free alternative to `prisma migrate dev --create-only`: applies the existing
// migrations to a throwaway PGlite database, then diffs it against schema.prisma.
import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdirSync, writeFileSync } from 'node:fs';
import { startPglite } from './pglite.mjs';

const name = process.argv[2];
if (!name || !/^[a-z0-9_]+$/.test(name)) {
  console.error('Usage: new-migration <snake_case_name>');
  process.exit(1);
}

// Async exec on purpose: PGlite runs in this process, so a blocking call would deadlock it.
const run = promisify(exec);
const pg = await startPglite();
try {
  const env = { ...process.env, DATABASE_URL: pg.url };
  await run('pnpm exec prisma migrate deploy', { env });
  const { stdout: sql } = await run(
    'pnpm exec prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script',
    { env },
  );
  if (!sql.trim() || /This is an empty migration/.test(sql)) {
    console.log('Schema matches migrations — nothing to do.');
  } else {
    const stamp = new Date().toISOString().replace(/\D/g, '').slice(0, 14);
    const dir = `prisma/migrations/${stamp}_${name}`;
    mkdirSync(dir, { recursive: true });
    writeFileSync(`${dir}/migration.sql`, sql);
    console.log(`Created ${dir}/migration.sql — review it before committing.`);
  }
} finally {
  await pg.stop();
}
