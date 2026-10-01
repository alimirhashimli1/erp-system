import { createHash, randomBytes } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { RoleSchema } from '@procurestack/shared';
import { z } from 'zod';
import { AppConfigService } from '../../../config/app-config.service';
import type { AuthPrincipal, UserAccount } from '../domain/user-account';

export const JWT_ISSUER = 'procurestack-api';
export const JWT_AUDIENCE = 'procurestack-web';

const AccessClaimsSchema = z.object({
  sub: z.uuid(),
  email: z.email(),
  roles: z.array(RoleSchema),
});

/** Issues/verifies short-lived JWT access tokens and mints opaque refresh tokens. */
@Injectable()
export class TokenService {
  constructor(
    private readonly jwt: JwtService,
    private readonly config: AppConfigService,
  ) {}

  get accessTokenTtlSeconds(): number {
    return this.config.get('JWT_ACCESS_TTL_SECONDS');
  }

  signAccessToken(user: UserAccount): Promise<string> {
    return this.jwt.signAsync(
      { email: user.email, roles: user.roles },
      {
        subject: user.id,
        secret: this.config.get('JWT_ACCESS_SECRET'),
        expiresIn: this.accessTokenTtlSeconds,
        issuer: JWT_ISSUER,
        audience: JWT_AUDIENCE,
        algorithm: 'HS256',
      },
    );
  }

  /** Throws on bad signature, expiry, wrong issuer/audience or unexpected claim shape. */
  async verifyAccessToken(token: string): Promise<AuthPrincipal> {
    const payload: unknown = await this.jwt.verifyAsync(token, {
      secret: this.config.get('JWT_ACCESS_SECRET'),
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE,
      algorithms: ['HS256'], // pin the algorithm — never trust the token's own `alg` header
    });
    const claims = AccessClaimsSchema.parse(payload);
    return { id: claims.sub, email: claims.email, roles: claims.roles };
  }

  /** 256 bits of randomness; opaque to the client, meaningless without the DB row. */
  generateRefreshToken(): string {
    return randomBytes(32).toString('base64url');
  }

  /**
   * SHA-256 (not argon2) is fine here: the input is a high-entropy random value, so there
   * is nothing to brute-force — unlike human-chosen passwords.
   */
  hashRefreshToken(raw: string): string {
    return createHash('sha256').update(raw).digest('hex');
  }
}
