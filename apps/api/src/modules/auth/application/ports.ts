import type { UserAccount } from '../domain/user-account';
import type { StoredRefreshToken } from '../domain/refresh-token.policy';

/*
 * Ports = interfaces the application layer needs from the outside world (Dependency
 * Inversion). Prisma/argon2 adapters implement them in ../infrastructure; tests swap in
 * in-memory fakes without touching a database.
 */

export interface UserRepository {
  findByEmail(email: string): Promise<UserAccount | null>;
  findById(id: string): Promise<UserAccount | null>;
}

export interface NewRefreshToken {
  userId: string;
  familyId: string;
  tokenHash: string;
  expiresAt: Date;
}

export interface RefreshTokenRepository {
  create(token: NewRefreshToken): Promise<StoredRefreshToken>;
  findByHash(tokenHash: string): Promise<StoredRefreshToken | null>;
  /**
   * Atomically revoke `oldId` and insert its successor. Returns false if `oldId` was
   * already revoked (lost a race with a concurrent refresh) — callers treat that as reuse.
   */
  rotate(oldId: string, next: NewRefreshToken): Promise<boolean>;
  revokeFamily(familyId: string): Promise<void>;
}

export interface PasswordHasher {
  hash(plain: string): Promise<string>;
  verify(hash: string, plain: string): Promise<boolean>;
}

export const USER_REPOSITORY = Symbol('USER_REPOSITORY');
export const REFRESH_TOKEN_REPOSITORY = Symbol('REFRESH_TOKEN_REPOSITORY');
export const PASSWORD_HASHER = Symbol('PASSWORD_HASHER');
