import { Injectable } from '@nestjs/common';
import type { RfxStatus, SourcingStatus, SubmitBid } from '@procurestack/shared';
import { staleWrite } from '../../../common/domain-error';
import { centsFromDb, quantityFromDb } from '../../../common/money';
import { Prisma } from '../../../generated/prisma/client';
import { PrismaTxHost } from '../../../infrastructure/prisma/prisma-tx-host';
import type { NewRfx, PrLineForSourcing, RfxPatch, RfxRepository } from '../application/ports';
import type { RfxEvent } from '../domain/rfx';

const LIST_LIMIT = 200;
const supplierSelect = { id: true, code: true, name: true, countryCode: true } as const;

const include = {
  buyer: { select: { fullName: true } },
  lines: {
    orderBy: { lineNo: 'asc' },
    include: {
      item: { select: { sku: true, description: true } },
      prLine: { select: { requisition: { select: { number: true } } } },
    },
  },
  invitations: { include: { supplier: { select: supplierSelect } } },
  bids: {
    orderBy: { submittedAt: 'asc' },
    include: { supplier: { select: supplierSelect }, lines: true },
  },
} satisfies Prisma.RfxEventInclude;

type Row = Prisma.RfxEventGetPayload<{ include: typeof include }>;

const isoDate = (d: Date) => d.toISOString().slice(0, 10);

const toDomain = (r: Row): RfxEvent => ({
  id: r.id,
  number: r.number,
  type: r.type,
  title: r.title,
  status: r.status,
  buyerId: r.buyerId,
  buyerName: r.buyer.fullName,
  responseDeadline: r.responseDeadline,
  publishedAt: r.publishedAt,
  closedAt: r.closedAt,
  evaluatedAt: r.evaluatedAt,
  awardedAt: r.awardedAt,
  awardJustification: r.awardJustification,
  version: r.version,
  createdAt: r.createdAt,
  lines: r.lines.map((l) => ({
    id: l.id,
    lineNo: l.lineNo,
    prLineId: l.prLineId,
    prNumber: l.prLine.requisition.number,
    itemId: l.itemId,
    sku: l.item.sku,
    description: l.item.description,
    uom: l.uom,
    quantity: quantityFromDb(l.quantity),
    awardedBidLineId: l.awardedBidLineId,
  })),
  invitations: r.invitations.map((i) => ({
    supplier: i.supplier,
    status: i.status,
    respondedAt: i.respondedAt,
  })),
  bids: r.bids.map((b) => ({
    id: b.id,
    supplier: b.supplier,
    incoterm: b.incoterm,
    leadTimeDays: b.leadTimeDays,
    validUntil: isoDate(b.validUntil),
    originChargesCents: centsFromDb(b.originChargesCents),
    freightCents: centsFromDb(b.freightCents),
    insuranceCents: centsFromDb(b.insuranceCents),
    destinationHandlingCents: centsFromDb(b.destinationHandlingCents),
    dutyRateBps: b.dutyRateBps,
    source: b.source,
    submittedAt: b.submittedAt,
    lines: b.lines.map((l) => ({
      id: l.id,
      rfxLineId: l.rfxLineId,
      unitPriceCents: centsFromDb(l.unitPriceCents),
    })),
  })),
});

const prLineInclude = {
  item: { select: { sku: true } },
  requisition: { select: { number: true, status: true, needByDate: true } },
} satisfies Prisma.PrLineInclude;

const toPrLine = (
  l: Prisma.PrLineGetPayload<{ include: typeof prLineInclude }>,
): PrLineForSourcing => ({
  prLineId: l.id,
  requisitionId: l.requisitionId,
  prNumber: l.requisition.number,
  prStatus: l.requisition.status,
  sourcingStatus: l.sourcingStatus,
  lineNo: l.lineNo,
  itemId: l.itemId,
  sku: l.item.sku,
  description: l.description,
  uom: l.uom,
  quantity: quantityFromDb(l.quantity),
  unitPriceCents: centsFromDb(l.unitPriceCents),
  needByDate: isoDate(l.requisition.needByDate),
});

@Injectable()
export class PrismaRfxRepository implements RfxRepository {
  constructor(private readonly tx: PrismaTxHost) {}

  async findById(id: string): Promise<RfxEvent | null> {
    const row = await this.tx.client.rfxEvent.findUnique({ where: { id }, include });
    return row ? toDomain(row) : null;
  }

  async list(filter: { status?: RfxStatus }): Promise<RfxEvent[]> {
    const rows = await this.tx.client.rfxEvent.findMany({
      where: filter,
      include,
      orderBy: { createdAt: 'desc' },
      take: LIST_LIMIT,
    });
    return rows.map(toDomain);
  }

  async openPrLines(): Promise<PrLineForSourcing[]> {
    const rows = await this.tx.client.prLine.findMany({
      where: { sourcingStatus: 'OPEN', requisition: { status: 'APPROVED' } },
      include: prLineInclude,
      orderBy: [{ requisition: { needByDate: 'asc' } }, { lineNo: 'asc' }],
      take: LIST_LIMIT,
    });
    return rows.map(toPrLine);
  }

  async findPrLines(ids: string[]): Promise<PrLineForSourcing[]> {
    const rows = await this.tx.client.prLine.findMany({
      where: { id: { in: ids } },
      include: prLineInclude,
    });
    return rows.map(toPrLine);
  }

  async claimPrLines(ids: string[]): Promise<boolean> {
    // Conditional UPDATE = compare-and-set: two buyers racing for the same line can't both win.
    const { count } = await this.tx.client.prLine.updateMany({
      where: { id: { in: ids }, sourcingStatus: 'OPEN', requisition: { status: 'APPROVED' } },
      data: { sourcingStatus: 'IN_SOURCING' },
    });
    return count === ids.length;
  }

  async setPrLineStatus(ids: string[], status: SourcingStatus): Promise<void> {
    if (ids.length === 0) return;
    await this.tx.client.prLine.updateMany({
      where: { id: { in: ids } },
      data: { sourcingStatus: status },
    });
  }

  async create(rfx: NewRfx): Promise<string> {
    const row = await this.tx.client.rfxEvent.create({
      data: {
        number: rfx.number,
        type: rfx.type,
        title: rfx.title,
        buyerId: rfx.buyerId,
        responseDeadline: rfx.responseDeadline,
        lines: {
          create: rfx.lines.map((l, i) => ({
            lineNo: i + 1,
            prLineId: l.prLineId,
            itemId: l.itemId,
            uom: l.uom,
            quantity: new Prisma.Decimal(l.quantity.toString()),
          })),
        },
        invitations: { create: rfx.supplierIds.map((supplierId) => ({ supplierId })) },
      },
      select: { id: true },
    });
    return row.id;
  }

  async transition(id: string, expectedVersion: number, patch: RfxPatch): Promise<void> {
    const { count } = await this.tx.client.rfxEvent.updateMany({
      where: { id, version: expectedVersion },
      data: { ...patch, version: { increment: 1 } },
    });
    if (count === 0) throw staleWrite('RFx');
  }

  async saveBid(rfxId: string, bid: SubmitBid, source: 'MANUAL' | 'SIMULATED', at: Date) {
    const data = {
      incoterm: bid.incoterm,
      leadTimeDays: bid.leadTimeDays,
      validUntil: new Date(`${bid.validUntil}T00:00:00.000Z`),
      originChargesCents: BigInt(bid.originChargesCents),
      freightCents: BigInt(bid.freightCents),
      insuranceCents: BigInt(bid.insuranceCents),
      destinationHandlingCents: BigInt(bid.destinationHandlingCents),
      dutyRateBps: bid.dutyRateBps,
      source,
      submittedAt: at,
    };
    const lines = bid.lines.map((l) => ({
      rfxLineId: l.rfxLineId,
      unitPriceCents: BigInt(l.unitPriceCents),
    }));
    // A revised bid replaces the previous one entirely (lines included).
    await this.tx.client.rfxBid.upsert({
      where: { rfxId_supplierId: { rfxId, supplierId: bid.supplierId } },
      create: { rfxId, supplierId: bid.supplierId, ...data, lines: { create: lines } },
      update: { ...data, lines: { deleteMany: {}, create: lines } },
    });
    await this.tx.client.rfxInvitation.update({
      where: { rfxId_supplierId: { rfxId, supplierId: bid.supplierId } },
      data: { status: 'RESPONDED', respondedAt: at },
    });
  }

  async declineInvitation(rfxId: string, supplierId: string, at: Date): Promise<void> {
    await this.tx.client.rfxInvitation.update({
      where: { rfxId_supplierId: { rfxId, supplierId } },
      data: { status: 'DECLINED', respondedAt: at },
    });
  }

  async setAwards(awards: { rfxLineId: string; bidLineId: string }[]): Promise<void> {
    for (const a of awards) {
      await this.tx.client.rfxLine.update({
        where: { id: a.rfxLineId },
        data: { awardedBidLineId: a.bidLineId },
      });
    }
  }
}
