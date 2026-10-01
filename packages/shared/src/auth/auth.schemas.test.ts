import { describe, expect, it } from 'vitest';
import { LoginSchema } from './auth.schemas';
import { RoleSchema } from './roles';

describe('LoginSchema', () => {
  it('normalises email to lower case so lookups are case-insensitive', () => {
    const parsed = LoginSchema.parse({ email: 'Buyer@ProcureStack.dev', password: 'x' });
    expect(parsed.email).toBe('buyer@procurestack.dev');
  });

  it('rejects a malformed email', () => {
    expect(LoginSchema.safeParse({ email: 'not-an-email', password: 'x' }).success).toBe(false);
  });

  it('rejects oversized passwords (hashing DoS guard)', () => {
    const result = LoginSchema.safeParse({ email: 'a@b.dev', password: 'x'.repeat(129) });
    expect(result.success).toBe(false);
  });
});

describe('RoleSchema', () => {
  it('rejects roles outside the closed set', () => {
    expect(RoleSchema.safeParse('SUPERUSER').success).toBe(false);
  });
});
