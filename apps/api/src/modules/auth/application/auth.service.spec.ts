import { UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { AppConfigService } from '../../../config/app-config.service';
import type { Env } from '../../../config/env.schema';
import { AuditService } from '../../audit/audit.service';
import {
  FakePasswordHasher,
  InMemoryAuditLogRepository,
  InMemoryRefreshTokenRepository,
  InMemoryUserRepository,
  makeUser,
} from '../../../../test/fakes/in-memory-auth';
import { AuthService } from './auth.service';
import { TokenService } from './token.service';

const env: Partial<Env> = {
  JWT_ACCESS_SECRET: 'test-secret-that-is-at-least-32-characters',
  JWT_ACCESS_TTL_SECONDS: 900,
  REFRESH_TOKEN_TTL_DAYS: 7,
};
const config = { get: (k: keyof Env) => env[k] } as unknown as AppConfigService;

function setup(users = [makeUser()]) {
  const userRepo = new InMemoryUserRepository(users);
  const refreshRepo = new InMemoryRefreshTokenRepository();
  const auditRepo = new InMemoryAuditLogRepository();
  const tokens = new TokenService(new JwtService(), config);
  const service = new AuthService(
    userRepo,
    refreshRepo,
    new FakePasswordHasher(),
    tokens,
    new AuditService(auditRepo),
    config,
  );
  return { service, refreshRepo, auditRepo, tokens, user: users[0]! };
}

const ctx = { ip: '127.0.0.1' };
const credentials = { email: 'buyer@procurestack.dev', password: 'correct-password' };

describe('AuthService.login', () => {
  it('issues a verifiable access token and a stored (hashed) refresh token', async () => {
    const { service, refreshRepo, tokens, user } = setup();
    const session = await service.login(credentials, ctx);

    await expect(tokens.verifyAccessToken(session.response.accessToken)).resolves.toMatchObject({
      id: user.id,
      roles: ['BUYER'],
    });
    expect(refreshRepo.rows).toHaveLength(1);
    // Only the hash is persisted, never the raw token.
    expect(refreshRepo.rows[0]!.tokenHash).not.toBe(session.refreshToken);
    expect(session.response.user).not.toHaveProperty('passwordHash');
  });

  it.each([
    ['wrong password', { ...credentials, password: 'nope' }, [makeUser()]],
    ['unknown email', { ...credentials, email: 'ghost@procurestack.dev' }, [makeUser()]],
    ['deactivated user', credentials, [makeUser({ isActive: false })]],
  ])('rejects %s with the same generic error and audits it', async (_, input, users) => {
    const { service, auditRepo } = setup(users);
    await expect(service.login(input, ctx)).rejects.toThrow('Invalid credentials');
    expect(auditRepo.actions()).toEqual(['AUTH_LOGIN_FAILED']);
  });
});

describe('AuthService.refresh (rotation)', () => {
  it('rotates: old token revoked, new token issued in the same family', async () => {
    const { service, refreshRepo } = setup();
    const first = await service.login(credentials, ctx);
    const second = await service.refresh(first.refreshToken, ctx);

    expect(second.refreshToken).not.toBe(first.refreshToken);
    const [oldRow, newRow] = refreshRepo.rows;
    expect(oldRow!.revokedAt).not.toBeNull();
    expect(oldRow!.replacedById).toBe(newRow!.id);
    expect(newRow!.familyId).toBe(oldRow!.familyId);
  });

  it('detects reuse of a rotated token and revokes the entire family', async () => {
    const { service, refreshRepo, auditRepo } = setup();
    const stolen = await service.login(credentials, ctx);
    const legit = await service.refresh(stolen.refreshToken, ctx); // victim refreshes

    // Attacker replays the old token → rejected, and the victim's new token dies too.
    await expect(service.refresh(stolen.refreshToken, ctx)).rejects.toThrow(UnauthorizedException);
    expect(refreshRepo.rows.every((r) => r.revokedAt)).toBe(true);
    await expect(service.refresh(legit.refreshToken, ctx)).rejects.toThrow(UnauthorizedException);
    expect(auditRepo.actions()).toContain('AUTH_REFRESH_TOKEN_REUSE_DETECTED');
  });

  it('rejects missing, unknown and expired tokens', async () => {
    const { service, refreshRepo } = setup();
    await expect(service.refresh(undefined, ctx)).rejects.toThrow(UnauthorizedException);
    await expect(service.refresh('made-up', ctx)).rejects.toThrow(UnauthorizedException);

    const session = await service.login(credentials, ctx);
    refreshRepo.rows[0]!.expiresAt = new Date(Date.now() - 1000);
    await expect(service.refresh(session.refreshToken, ctx)).rejects.toThrow(UnauthorizedException);
  });

  it('ends the session when the user was deactivated after login', async () => {
    const { service, user } = setup();
    const session = await service.login(credentials, ctx);
    user.isActive = false;
    await expect(service.refresh(session.refreshToken, ctx)).rejects.toThrow(UnauthorizedException);
  });
});

describe('AuthService.logout', () => {
  it('revokes the token family so the refresh token is useless afterwards', async () => {
    const { service } = setup();
    const session = await service.login(credentials, ctx);
    await service.logout(session.refreshToken);
    await expect(service.refresh(session.refreshToken, ctx)).rejects.toThrow(UnauthorizedException);
  });
});
