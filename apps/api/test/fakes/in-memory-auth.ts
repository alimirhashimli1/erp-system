import { randomUUID } from 'node:crypto';
import type { AuditEntry, AuditLogRepository } from '../../src/modules/audit/audit-log.port';
import type {
  NewRefreshToken,
  PasswordHasher,
  RefreshTokenRepository,
  UserRepository,
} from '../../src/modules/auth/application/ports';
import type { StoredRefreshToken } from '../../src/modules/auth/domain/refresh-token.policy';
import type { UserAccount } from '../../src/modules/auth/domain/user-account';

/*
 * In-memory adapters for the auth ports. Because the application layer depends only on
 * interfaces, tests run the real AuthService/controllers/guards with no database.
 */

export class InMemoryUserRepository implements UserRepository {
  constructor(public readonly users: UserAccount[] = []) {}

  findByEmail(email: string) {
    return Promise.resolve(this.users.find((u) => u.email === email) ?? null);
  }

  findById(id: string) {
    return Promise.resolve(this.users.find((u) => u.id === id) ?? null);
  }
}

type Row = StoredRefreshToken & { tokenHash: string; replacedById: string | null };

export class InMemoryRefreshTokenRepository implements RefreshTokenRepository {
  readonly rows: Row[] = [];

  create(t: NewRefreshToken) {
    const row: Row = { ...t, id: randomUUID(), revokedAt: null, replacedById: null };
    this.rows.push(row);
    return Promise.resolve(row);
  }

  findByHash(tokenHash: string) {
    return Promise.resolve(this.rows.find((r) => r.tokenHash === tokenHash) ?? null);
  }

  async rotate(oldId: string, next: NewRefreshToken) {
    const old = this.rows.find((r) => r.id === oldId);
    if (!old || old.revokedAt) return false;
    const created = await this.create(next);
    old.revokedAt = new Date();
    old.replacedById = created.id;
    return true;
  }

  revokeFamily(familyId: string) {
    for (const r of this.rows) if (r.familyId === familyId) r.revokedAt ??= new Date();
    return Promise.resolve();
  }
}

export class InMemoryAuditLogRepository implements AuditLogRepository {
  readonly entries: AuditEntry[] = [];

  append(entry: AuditEntry) {
    this.entries.push(entry);
    return Promise.resolve();
  }

  actions() {
    return this.entries.map((e) => e.action);
  }
}

/** Deterministic, fast stand-in for argon2 (hashing cost is irrelevant to these tests). */
export class FakePasswordHasher implements PasswordHasher {
  hash(plain: string) {
    return Promise.resolve(`hashed:${plain}`);
  }

  verify(hash: string, plain: string) {
    return Promise.resolve(hash === `hashed:${plain}`);
  }
}

export const makeUser = (overrides: Partial<UserAccount> = {}): UserAccount => ({
  id: randomUUID(),
  email: 'buyer@procurestack.dev',
  fullName: 'Bea Buyer',
  passwordHash: 'hashed:correct-password',
  roles: ['BUYER'],
  isActive: true,
  ...overrides,
});
