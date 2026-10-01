import { Injectable } from '@nestjs/common';
import type { User } from '../../../generated/prisma/client';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import type { UserRepository } from '../application/ports';
import type { UserAccount } from '../domain/user-account';

// Prisma's Role enum and the shared ROLES tuple hold identical strings (see role-sync.spec.ts).
const toDomain = (u: User): UserAccount => ({
  id: u.id,
  email: u.email,
  fullName: u.fullName,
  passwordHash: u.passwordHash,
  roles: u.roles,
  isActive: u.isActive,
});

@Injectable()
export class PrismaUserRepository implements UserRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findByEmail(email: string): Promise<UserAccount | null> {
    const user = await this.prisma.user.findUnique({ where: { email } });
    return user ? toDomain(user) : null;
  }

  async findById(id: string): Promise<UserAccount | null> {
    const user = await this.prisma.user.findUnique({ where: { id } });
    return user ? toDomain(user) : null;
  }
}
