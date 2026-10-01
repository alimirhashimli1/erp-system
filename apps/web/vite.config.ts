import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // Same-origin in dev too: the browser talks to Vite, Vite forwards /api to Nest.
    // This mirrors the nginx proxy in production, so cookies/CORS behave identically.
    proxy: { '/api': 'http://localhost:3000' },
  },
  build: { sourcemap: false }, // don't ship source maps to production
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
  },
});
