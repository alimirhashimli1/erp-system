import { SetMetadata } from '@nestjs/common';
import type { Role } from '@procurestack/shared';

/*
 * Every route must declare exactly one access policy. Routes without one are DENIED by
 * RolesGuard ("default deny"), so forgetting a decorator fails closed, not open.
 */

export const IS_PUBLIC_KEY = 'access:isPublic';
export const ACCESS_POLICY_KEY = 'access:policy';

export type AccessPolicy = { kind: 'authenticated' } | { kind: 'roles'; roles: readonly Role[] };

/** No authentication required (login, health checks). */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

/** Any signed-in user, whatever their role (e.g. "who am I"). */
export const AnyAuthenticated = () =>
  SetMetadata(ACCESS_POLICY_KEY, { kind: 'authenticated' } satisfies AccessPolicy);

/**
 * Caller needs at least one of these roles. ADMIN is NOT an implicit superuser —
 * segregation of duties means admins get business actions only where listed explicitly.
 */
export const Roles = (...roles: [Role, ...Role[]]) =>
  SetMetadata(ACCESS_POLICY_KEY, { kind: 'roles', roles } satisfies AccessPolicy);
