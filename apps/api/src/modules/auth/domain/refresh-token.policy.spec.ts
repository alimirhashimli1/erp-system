import {
  assessRefreshToken,
  refreshTokenExpiry,
  type StoredRefreshToken,
} from './refresh-token.policy';

const now = new Date('2026-10-01T12:00:00Z');
const token = (overrides: Partial<StoredRefreshToken> = {}): StoredRefreshToken => ({
  id: 't1',
  userId: 'u1',
  familyId: 'f1',
  expiresAt: new Date('2026-10-08T12:00:00Z'),
  revokedAt: null,
  ...overrides,
});

describe('assessRefreshToken', () => {
  it('returns unknown when no stored token matches the presented hash', () => {
    expect(assessRefreshToken(null, now).kind).toBe('unknown');
  });

  it('accepts a live, unrevoked token', () => {
    expect(assessRefreshToken(token(), now).kind).toBe('valid');
  });

  it('treats an already-rotated (revoked) token as reuse — the theft signal', () => {
    const verdict = assessRefreshToken(token({ revokedAt: new Date('2026-10-01T11:00:00Z') }), now);
    expect(verdict.kind).toBe('reused');
  });

  it('flags reuse even when the revoked token is also expired', () => {
    const verdict = assessRefreshToken(
      token({ revokedAt: new Date('2026-09-01'), expiresAt: new Date('2026-09-08') }),
      now,
    );
    expect(verdict.kind).toBe('reused');
  });

  it('rejects a token exactly at its expiry instant (boundary is exclusive)', () => {
    expect(assessRefreshToken(token({ expiresAt: now }), now).kind).toBe('expired');
  });
});

describe('refreshTokenExpiry', () => {
  it('adds whole days', () => {
    expect(refreshTokenExpiry(now, 7).toISOString()).toBe('2026-10-08T12:00:00.000Z');
  });
});
