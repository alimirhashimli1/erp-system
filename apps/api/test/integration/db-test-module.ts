import { type ModuleMetadata } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { AppConfigModule } from '../../src/config/config.module';
import { PrismaModule } from '../../src/infrastructure/prisma/prisma.module';
import { AuditModule } from '../../src/modules/audit/audit.module';

/** Real config + Prisma + audit wiring against the integration database. */
export async function createDbTestingModule(extra: ModuleMetadata = {}): Promise<TestingModule> {
  const moduleRef = await Test.createTestingModule({
    ...extra,
    imports: [AppConfigModule, PrismaModule, AuditModule, ...(extra.imports ?? [])],
  }).compile();
  await moduleRef.init();
  return moduleRef;
}
