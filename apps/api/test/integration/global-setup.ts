import { exec } from 'node:child_process';
import { promisify } from 'node:util';

/**
 * Uses TEST_DATABASE_URL when given (CI: real Postgres 18), else boots in-process PGlite.
 * Either way the migrations are applied first, so the suite also proves they work.
 */
export default async function globalSetup(): Promise<void> {
  let url = process.env['TEST_DATABASE_URL'];
  if (!url) {
    // Plain ESM helper shared with the new-migration script.
    const { startPglite } = await import('../../scripts/pglite.mjs');
    const pg = await startPglite();
    (globalThis as { __PGLITE__?: typeof pg }).__PGLITE__ = pg;
    url = pg.url;
  }
  process.env['INTEGRATION_DATABASE_URL'] = url;
  // Async on purpose: PGlite lives in this process; a blocking exec would deadlock it.
  await promisify(exec)('pnpm exec prisma migrate deploy', {
    env: { ...process.env, DATABASE_URL: url },
  });
}
