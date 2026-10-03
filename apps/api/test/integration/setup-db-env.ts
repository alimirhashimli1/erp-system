// Runs after test/setup-env.ts: point the app at the integration database.
const url = process.env['INTEGRATION_DATABASE_URL'];
if (!url) throw new Error('INTEGRATION_DATABASE_URL missing — run via `pnpm test:int`');
process.env['DATABASE_URL'] = url;
