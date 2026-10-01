import { Global, Module } from '@nestjs/common';
import { AUDIT_LOG_REPOSITORY } from './audit-log.port';
import { AuditService } from './audit.service';
import { PrismaAuditLogRepository } from './prisma-audit-log.repository';

@Global()
@Module({
  providers: [AuditService, { provide: AUDIT_LOG_REPOSITORY, useClass: PrismaAuditLogRepository }],
  exports: [AuditService],
})
export class AuditModule {}
