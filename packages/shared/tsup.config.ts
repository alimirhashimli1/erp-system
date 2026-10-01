import { defineConfig } from 'tsup';

// Dual ESM + CJS output: Vite (web) consumes ESM, NestJS (api) runs as CommonJS.
export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
  // tsup's DTS step sets `baseUrl` internally, which TS 6 flags as deprecated.
  dts: { compilerOptions: { ignoreDeprecations: '6.0' } },
  sourcemap: true,
  clean: true,
});
