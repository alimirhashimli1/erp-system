import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import type { NewRefreshToken, RefreshTokenRepository } from '../application/ports';
import type { StoredRefreshToken } from '../domain/refresh-token.policy';

const select = {
  id: true,
  userId: true,
  familyId: true,
  expiresAt: true,
  revokedAt: true,
} as const;

@Injectable()
export class PrismaRefreshTokenRepository implements RefreshTokenRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(token: NewRefreshToken): Promise<StoredRefreshToken> {
    return this.prisma.refreshToken.create({ data: token, select });
  }

  findByHash(tokenHash: string): Promise<StoredRefreshToken | null> {
    return this.prisma.refreshToken.findUnique({ where: { tokenHash }, select });
  }

  async rotate(oldId: string, next: NewRefreshToken): Promise<boolean> {
    return this.prisma
      .$transaction(async (tx) => {
        const created = await tx.refreshToken.create({ data: next, select: { id: true } });
        // Conditional update = optimistic lock: only one concurrent caller can flip
        // revokedAt from NULL. The loser sees count 0 and the transaction rolls back.
        const { count } = await tx.refreshToken.updateMany({
          where: { id: oldId, revokedAt: null },
          data: { revokedAt: new Date(), replacedById: created.id },
        });
        if (count === 0) throw new RotationConflict();
        return true;
      })
      .catch((e: unknown) => {
        if (e instanceof RotationConflict) return false;
        throw e;
      });
  }

  async revokeFamily(familyId: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { familyId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
}

class RotationConflict extends Error {}
