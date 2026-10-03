import { Injectable } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import { PrismaTxHost } from '../../infrastructure/prisma/prisma-tx-host';
import type { AuditEntry, AuditLogRepository } from './audit-log.port';

const toJson = (v: unknown) =>
  v === undefined || v === null ? Prisma.JsonNull : (v as Prisma.InputJsonValue);

@Injectable()
export class PrismaAuditLogRepository implements AuditLogRepository {
  constructor(private readonly tx: PrismaTxHost) {}

  async append(entry: AuditEntry): Promise<void> {
    await this.tx.client.auditLog.create({
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
