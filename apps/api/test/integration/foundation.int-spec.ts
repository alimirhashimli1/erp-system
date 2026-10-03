import { randomUUID } from 'node:crypto';
import type { TestingModule } from '@nestjs/testing';
import {
  DOCUMENT_NUMBERS,
  type DocumentNumberGenerator,
} from '../../src/common/document-number.port';
import { PrismaService } from '../../src/infrastructure/prisma/prisma.service';
import { PrismaTxHost } from '../../src/infrastructure/prisma/prisma-tx-host';
import { AuditService } from '../../src/modules/audit/audit.service';
import { createDbTestingModule } from './db-test-module';

describe('Foundation (integration)', () => {
  let moduleRef: TestingModule;
  let prisma: PrismaService;
  let uow: PrismaTxHost;
  let audit: AuditService;
  let numbers: DocumentNumberGenerator;

  beforeAll(async () => {
    moduleRef = await createDbTestingModule();
    prisma = moduleRef.get(PrismaService);
    uow = moduleRef.get(PrismaTxHost);
    audit = moduleRef.get(AuditService);
    numbers = moduleRef.get(DOCUMENT_NUMBERS);
  });

  afterAll(() => moduleRef.close());

  describe('audit_logs is append-only at the database level', () => {
    let id: string;

    beforeAll(async () => {
      const entityId = randomUUID();
      await audit.record({ actorId: null, action: 'TEST', entityType: 'Test', entityId });
      id = (await prisma.auditLog.findFirstOrThrow({ where: { entityId } })).id;
    });

    it('rejects UPDATE', async () => {
      await expect(
        prisma.auditLog.update({ where: { id }, data: { action: 'TAMPERED' } }),
      ).rejects.toThrow(/append-only/);
    });

    it('rejects DELETE', async () => {
      await expect(prisma.auditLog.delete({ where: { id } })).rejects.toThrow(/append-only/);
    });

    it('rejects TRUNCATE', async () => {
      await expect(prisma.$executeRawUnsafe('TRUNCATE audit_logs')).rejects.toThrow(/append-only/);
    });
  });

  describe('UnitOfWork', () => {
    it('rolls back the audit entry and the document number together', async () => {
      const entityId = randomUUID();
      const before = await prisma.documentCounter.findUnique({ where: { type: 'GR' } });

      await expect(
        uow.run(async () => {
          await numbers.next('GR');
          await audit.record({ actorId: null, action: 'TEST', entityType: 'Test', entityId });
          throw new Error('boom');
        }),
      ).rejects.toThrow('boom');

      expect(await prisma.auditLog.count({ where: { entityId } })).toBe(0);
      expect(await prisma.documentCounter.findUnique({ where: { type: 'GR' } })).toEqual(before);
    });

    it('issues consecutive numbers when committed', async () => {
      const [a, b] = await uow.run(async () => [
        await numbers.next('RFX'),
        await numbers.next('RFX'),
      ]);
      expect(Number(b.slice(4))).toBe(Number(a.slice(4)) + 1);
      expect(a).toMatch(/^RFX-\d{6}$/);
    });
  });
});
