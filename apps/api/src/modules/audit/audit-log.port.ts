/** Shape of one audit entry. `before`/`after` hold business state, never secrets. */
export interface AuditEntry {
  actorId: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  before?: unknown;
  after?: unknown;
  metadata?: Record<string, unknown>;
}

/** Port (Dependency Inversion): use cases depend on this, not on Prisma. */
export interface AuditLogRepository {
  append(entry: AuditEntry): Promise<void>;
}

export const AUDIT_LOG_REPOSITORY = Symbol('AUDIT_LOG_REPOSITORY');
