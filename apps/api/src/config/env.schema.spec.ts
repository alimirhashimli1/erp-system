import { validateEnv } from './env.schema';

const valid = {
  DATABASE_URL: 'postgresql://u:p@localhost:5432/db',
  REDIS_URL: 'redis://localhost:6379',
  JWT_ACCESS_SECRET: 'x'.repeat(32),
  CORS_ORIGINS: 'http://localhost:5173, http://localhost:8080',
};

describe('validateEnv', () => {
  it('applies safe defaults (secure cookies on, swagger off)', () => {
    const env = validateEnv(valid);
    expect(env.COOKIE_SECURE).toBe(true);
    expect(env.SWAGGER_ENABLED).toBe(false);
    expect(env.CORS_ORIGINS).toEqual(['http://localhost:5173', 'http://localhost:8080']);
  });

  it('fails fast and names the missing variable', () => {
    const { JWT_ACCESS_SECRET: _omit, ...missing } = valid;
    expect(() => validateEnv(missing)).toThrow(/JWT_ACCESS_SECRET/);
  });

  it('rejects a weak JWT secret', () => {
    expect(() => validateEnv({ ...valid, JWT_ACCESS_SECRET: 'short' })).toThrow(/at least 32/);
  });

  it('never echoes secret values in the error message', () => {
    const secret = 'super-secret-but-short';
    let message = '';
    try {
      validateEnv({ ...valid, JWT_ACCESS_SECRET: secret });
    } catch (e) {
      message = (e as Error).message;
    }
    expect(message).toMatch(/JWT_ACCESS_SECRET/);
    expect(message).not.toContain(secret);
  });
});
