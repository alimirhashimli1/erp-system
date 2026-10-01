import { Injectable } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import type { AuditEntry, AuditLogRepository } from './audit-log.port';

const toJson = (v: unknown) =>
  v === undefined || v === null ? Prisma.JsonNull : (v as Prisma.InputJsonValue);

@Injectable()
export class PrismaAuditLogRepository implements AuditLogRepository {
  constructor(private readonly prisma: PrismaService) {}

  async append(entry: AuditEntry): Promise<void> {
    await this.prisma.auditLog.create({
      data: {
        actorId: entry.actorId,
        action: entry.action,
        entityType: entry.entityType,
        entityId: entry.entityId ?? null,
        before: toJson(entry.before),
        after: toJson(entry.after),
        metadata: toJson(entry.metadata),
      },
    });
  }
}
