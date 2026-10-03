export default async function globalTeardown(): Promise<void> {
  await (globalThis as { __PGLITE__?: { stop: () => Promise<void> } }).__PGLITE__?.stop();
}
