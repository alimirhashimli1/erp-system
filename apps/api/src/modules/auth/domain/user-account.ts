import type { AuthUser, Role } from '@procurestack/shared';

/** Domain view of a user. Contains the hash, so it must never leave the application layer. */
export interface UserAccount {
  id: string;
  email: string;
  fullName: string;
  passwordHash: string;
  roles: Role[];
  isActive: boolean;
}

/** What the HTTP layer knows about the caller after verifying the access token. */
export interface AuthPrincipal {
  id: string;
  email: string;
  roles: Role[];
}

export const toAuthUser = (u: UserAccount): AuthUser => ({
  id: u.id,
  email: u.email,
  fullName: u.fullName,
  roles: u.roles,
});
