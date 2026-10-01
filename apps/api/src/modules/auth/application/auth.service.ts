import { randomUUID } from 'node:crypto';
import { Inject, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import type { AccessTokenResponse, AuthUser, LoginCredentials } from '@procurestack/shared';
import { AppConfigService } from '../../../config/app-config.service';
import { AuditService } from '../../audit/audit.service';
import { assessRefreshToken, refreshTokenExpiry } from '../domain/refresh-token.policy';
import { toAuthUser, type UserAccount } from '../domain/user-account';
import {
  PASSWORD_HASHER,
  REFRESH_TOKEN_REPOSITORY,
  USER_REPOSITORY,
  type PasswordHasher,
  type RefreshTokenRepository,
  type UserRepository,
} from './ports';
import { TokenService } from './token.service';

export interface RequestContext {
  ip?: string;
  userAgent?: string;
}

export interface IssuedSession {
  response: AccessTokenResponse;
  /** Raw refresh token — only ever placed in an httpOnly cookie, never logged or stored. */
  refreshToken: string;
}

/** Same message for every failure so the API never reveals which emails exist. */
const INVALID_CREDENTIALS = 'Invalid credentials';
const INVALID_SESSION = 'Session expired, please sign in again';

@Injectable()
export class AuthService {
  private dummyHash?: Promise<string>;

  constructor(
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    @Inject(REFRESH_TOKEN_REPOSITORY) private readonly refreshTokens: RefreshTokenRepository,
    @Inject(PASSWORD_HASHER) private readonly hasher: PasswordHasher,
    private readonly tokens: TokenService,
    private readonly audit: AuditService,
    private readonly config: AppConfigService,
  ) {}

  async login(input: LoginCredentials, ctx: RequestContext): Promise<IssuedSession> {
    const user = await this.users.findByEmail(input.email);
    // Always run one argon2 verification, even for unknown emails, so response time
    // doesn't leak whether an account exists (user-enumeration timing attack).
    const passwordOk = await this.hasher.verify(
      user?.passwordHash ?? (await this.getDummyHash()),
      input.password,
    );

    if (!user || !passwordOk || !user.isActive) {
      await this.audit.record({
        actorId: user?.id ?? null,
        action: 'AUTH_LOGIN_FAILED',
        entityType: 'User',
        entityId: user?.id ?? null,
        metadata: {
          ip: ctx.ip,
          reason: !user ? 'unknown_user' : passwordOk ? 'inactive' : 'bad_password',
        },
      });
      throw new UnauthorizedException(INVALID_CREDENTIALS);
    }

    const session = await this.startSession(user, randomUUID());
    await this.audit.record({
      actorId: user.id,
      action: 'AUTH_LOGIN_SUCCEEDED',
      entityType: 'User',
      entityId: user.id,
      metadata: { ip: ctx.ip, userAgent: ctx.userAgent },
    });
    return session;
  }

  async refresh(rawToken: string | undefined, ctx: RequestContext): Promise<IssuedSession> {
    if (!rawToken) throw new UnauthorizedException(INVALID_SESSION);

    const verdict = assessRefreshToken(
      await this.refreshTokens.findByHash(this.tokens.hashRefreshToken(rawToken)),
      new Date(),
    );

    switch (verdict.kind) {
      case 'unknown':
      case 'expired':
        throw new UnauthorizedException(INVALID_SESSION);
      case 'reused':
        await this.handleReuse(verdict.token.familyId, verdict.token.userId, ctx);
        throw new UnauthorizedException(INVALID_SESSION);
      case 'valid':
        break;
    }

    const { token } = verdict;
    const user = await this.users.findById(token.userId);
    if (!user?.isActive) {
      await this.refreshTokens.revokeFamily(token.familyId);
      throw new UnauthorizedException(INVALID_SESSION);
    }

    const nextRaw = this.tokens.generateRefreshToken();
    const rotated = await this.refreshTokens.rotate(token.id, {
      userId: user.id,
      familyId: token.familyId,
      tokenHash: this.tokens.hashRefreshToken(nextRaw),
      expiresAt: refreshTokenExpiry(new Date(), this.config.get('REFRESH_TOKEN_TTL_DAYS')),
    });
    if (!rotated) {
      // Another request rotated this token first — indistinguishable from replay.
      await this.handleReuse(token.familyId, user.id, ctx);
      throw new UnauthorizedException(INVALID_SESSION);
    }

    return { response: await this.buildResponse(user), refreshToken: nextRaw };
  }

  async logout(rawToken: string | undefined): Promise<void> {
    if (!rawToken) return;
    const token = await this.refreshTokens.findByHash(this.tokens.hashRefreshToken(rawToken));
    if (!token) return;
    await this.refreshTokens.revokeFamily(token.familyId);
    await this.audit.record({
      actorId: token.userId,
      action: 'AUTH_LOGOUT',
      entityType: 'User',
      entityId: token.userId,
    });
  }

  async me(userId: string): Promise<AuthUser> {
    const user = await this.users.findById(userId);
    if (!user?.isActive) throw new NotFoundException('User not found');
    return toAuthUser(user);
  }

  private async startSession(user: UserAccount, familyId: string): Promise<IssuedSession> {
    const raw = this.tokens.generateRefreshToken();
    await this.refreshTokens.create({
      userId: user.id,
      familyId,
      tokenHash: this.tokens.hashRefreshToken(raw),
      expiresAt: refreshTokenExpiry(new Date(), this.config.get('REFRESH_TOKEN_TTL_DAYS')),
    });
    return { response: await this.buildResponse(user), refreshToken: raw };
  }

  private async buildResponse(user: UserAccount): Promise<AccessTokenResponse> {
    return {
      accessToken: await this.tokens.signAccessToken(user),
      expiresIn: this.tokens.accessTokenTtlSeconds,
      user: toAuthUser(user),
    };
  }

  private async handleReuse(familyId: string, userId: string, ctx: RequestContext): Promise<void> {
    await this.refreshTokens.revokeFamily(familyId);
    await this.audit.record({
      actorId: userId,
      action: 'AUTH_REFRESH_TOKEN_REUSE_DETECTED',
      entityType: 'User',
      entityId: userId,
      metadata: { ip: ctx.ip, familyId },
    });
  }

  private getDummyHash(): Promise<string> {
    this.dummyHash ??= this.hasher.hash(randomUUID());
    return this.dummyHash;
  }
}
