/**
 * Pure rules for refresh-token rotation (no I/O, no framework — trivially unit-testable).
 *
 * Rotation: every successful refresh revokes the presented token and issues a new one in
 * the same "family". A legitimate client only ever holds the newest token, so seeing an
 * already-revoked token means it was copied — by an attacker or from a stolen device.
 * The safe reaction is to revoke the whole family, logging out both parties.
 */
export interface StoredRefreshToken {
  id: string;
  userId: string;
  familyId: string;
  expiresAt: Date;
  revokedAt: Date | null;
}

export type RefreshTokenVerdict =
  | { kind: 'unknown' }
  | { kind: 'reused'; token: StoredRefreshToken }
  | { kind: 'expired'; token: StoredRefreshToken }
  | { kind: 'valid'; token: StoredRefreshToken };

export function assessRefreshToken(
  token: StoredRefreshToken | null,
  now: Date,
): RefreshTokenVerdict {
  if (!token) return { kind: 'unknown' };
  // Checked before expiry on purpose: a revoked token is a theft signal even if stale.
  if (token.revokedAt) return { kind: 'reused', token };
  if (token.expiresAt.getTime() <= now.getTime()) return { kind: 'expired', token };
  return { kind: 'valid', token };
}

export function refreshTokenExpiry(now: Date, ttlDays: number): Date {
  return new Date(now.getTime() + ttlDays * 24 * 60 * 60 * 1000);
}
