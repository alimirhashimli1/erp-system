import { Injectable } from '@nestjs/common';
import type { DocumentNumberGenerator, DocumentType } from '../../common/document-number.port';
import { PrismaTxHost } from './prisma-tx-host';

/**
 * Gap-free numbering (ADR 0005): the counter row is locked by the UPDATE until the
 * surrounding transaction ends, and a rollback also rolls the number back.
 */
@Injectable()
export class PrismaDocumentNumbers implements DocumentNumberGenerator {
  constructor(private readonly tx: PrismaTxHost) {}

  async next(type: DocumentType): Promise<string> {
    const counter = await this.tx.client.documentCounter.upsert({
      where: { type },
      create: { type, value: 1 },
      update: { value: { increment: 1 } },
    });
    return `${type}-${String(counter.value).padStart(6, '0')}`;
  }
}
