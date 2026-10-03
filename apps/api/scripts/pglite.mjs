// Starts an in-memory Postgres (PGlite, WASM) that speaks the wire protocol on 127.0.0.1.
// Dev/test only — see docs/adr/0007-integration-tests-on-pglite.md.
import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';

/** @returns {Promise<{ url: string, stop: () => Promise<void> }>} */
export async function startPglite(port = 0) {
  const db = await PGlite.create();
  const server = new PGLiteSocketServer({ db, port, host: '127.0.0.1', maxConnections: 20 });
  await server.start();
  const actualPort = Number(server.getServerConn().split(':').pop());
  return {
    url: `postgresql://postgres:postgres@127.0.0.1:${actualPort}/postgres?sslmode=disable`,
    stop: async () => {
      await server.stop();
      await db.close();
    },
  };
}
