import type { Config } from 'jest';
import base from './jest.config.ts';

// Integration suite: real Postgres, serial (`--runInBand`), see ADR 0007.
const config: Config = {
  ...base,
  roots: ['<rootDir>/test/integration'],
  testRegex: '.*\.int-spec\.ts$',
  globalSetup: '<rootDir>/test/integration/global-setup.ts',
  globalTeardown: '<rootDir>/test/integration/global-teardown.ts',
  setupFiles: ['<rootDir>/test/setup-env.ts', '<rootDir>/test/integration/setup-db-env.ts'],
  testTimeout: 30_000,
};

export default config;
