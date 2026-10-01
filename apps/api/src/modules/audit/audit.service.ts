import { Inject, Injectable } from '@nestjs/common';
import { AUDIT_LOG_REPOSITORY, type AuditEntry, type AuditLogRepository } from './audit-log.port';

/** Append-only: there is intentionally no update/delete API for audit entries. */
@Injectable()
export class AuditService {
  constructor(@Inject(AUDIT_LOG_REPOSITORY) private readonly repo: AuditLogRepository) {}

  record(entry: AuditEntry): Promise<void> {
    return this.repo.append(entry);
  }
}
