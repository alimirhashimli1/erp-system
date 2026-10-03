import { Injectable } from '@nestjs/common';
import type { PoStatus } from '@procurestack/shared';
import { DomainError, staleWrite } from '../../../common/domain-error';
import { centsFromDb, quantityFromDb } from '../../../common/money';
import { Prisma } from '../../../generated/prisma/client';
import { PrismaTxHost } from '../../../infrastructure/prisma/prisma-tx-host';
import type { PoPatch, PurchaseOrderRepository } from '../application/ports';
import type { AwardedLine, PoDraft, PurchaseOrder } from '../domain/purchase-order';

const LIST_LIMIT = 200;

const include = {
  supplier: { select: { id: true, code: true, name: true, countryCode: true } },
  buyer: { select: { fullName: true } },
  rfx: { select: { number: true } },
  lines: {
    orderBy: { lineNo: 'asc' },
    include: {
      item: { select: { sku: true } },
      prLine: {
        select: {
          unitPriceCents: true,
          requisition: { select: { number: true, requesterId: true } },
        },
      },
    },
  },
} satisfies Prisma.PurchaseOrderInclude;

type Row = Prisma.PurchaseOrderGetPayload<{ include: typeof include }>;

const toDecimal = (n: number) => new Prisma.Decimal(n.toString());

const toDomain = (r: Row): PurchaseOrder => ({
  id: r.id,
  number: r.number,
  status: r.status,
  supplier: r.supplier,
  buyerId: r.buyerId,
  buyerName: r.buyer.fullName,
  rfxId: r.rfxId,
  rfxNumber: r.rfx.number,
  incoterm: r.incoterm,
  namedPlace: r.namedPlace,
  leadTimeDays: r.leadTimeDays,
  totalCents: centsFromDb(r.totalCents),
  expectedDeliveryDate: r.expectedDeliveryDate?.toISOString().slice(0, 10) ?? null,
  issuedAt: r.issuedAt,
  acknowledgedAt: r.acknowledgedAt,
  closedAt: r.closedAt,
  cancelReason: r.cancelReason,
  version: r.version,
  createdAt: r.createdAt,
  lines: r.lines.map((l) => ({
    id: l.id,
    lineNo: l.lineNo,
    prLineId: l.prLineId,
    prNumber: l.prLine.requisition.number,
    approvedUnitPriceCents: centsFromDb(l.prLine.unitPriceCents),
    rfxBidLineId: l.rfxBidLineId,
    itemId: l.itemId,
    sku: l.item.sku,
    description: l.description,
    uom: l.uom,
    quantity: quantityFromDb(l.quantity),
    unitPriceCents: centsFromDb(l.unitPriceCents),
    lineTotalCents: centsFromDb(l.lineTotalCents),
    receivedQuantity: quantityFromDb(l.receivedQuantity),
    invoicedQuantity: quantityFromDb(l.invoicedQuantity),
  })),
  requesterIds: [...new Set(r.lines.map((l) => l.prLine.requisition.requesterId))],
});

@Injectable()
export class PrismaPurchaseOrderRepository implements PurchaseOrderRepository {
  constructor(private readonly tx: PrismaTxHost) {}

  async findById(id: string): Promise<PurchaseOrder | null> {
    const row = await this.tx.client.purchaseOrder.findUnique({ where: { id }, include });
    return row ? toDomain(row) : null;
  }

  async list(filter: { status?: PoStatus }): Promise<PurchaseOrder[]> {
    const rows = await this.tx.client.purchaseOrder.findMany({
      where: filter,
      include,
      orderBy: { createdAt: 'desc' },
      take: LIST_LIMIT,
    });
    return rows.map(toDomain);
  }

  async awardedLines(rfxId: string): Promise<AwardedLine[]> {
    const rows = await this.tx.client.rfxLine.findMany({
      where: { rfxId, awardedBidLineId: { not: null } },
      orderBy: { lineNo: 'asc' },
      include: {
        prLine: { select: { sourcingStatus: true, description: true } },
        awardedBidLine: { include: { bid: true } },
      },
    });
    return rows.flatMap((r) => {
      const bl = r.awardedBidLine;
      if (!bl) return [];
      return [
        {
          prLineId: r.prLineId,
          sourcingStatus: r.prLine.sourcingStatus,
          itemId: r.itemId,
          description: r.prLine.description,
          uom: r.uom,
          quantity: quantityFromDb(r.quantity),
          bidLineId: bl.id,
          unitPriceCents: centsFromDb(bl.unitPriceCents),
          supplierId: bl.bid.supplierId,
          incoterm: bl.bid.incoterm,
          leadTimeDays: bl.bid.leadTimeDays,
        },
      ];
    });
  }

  async create(
    d: PoDraft & { number: string; buyerId: string; rfxId: string; namedPlace: string },
  ): Promise<string> {
    try {
      const row = await this.tx.client.purchaseOrder.create({
        data: {
          number: d.number,
          supplierId: d.supplierId,
          buyerId: d.buyerId,
          rfxId: d.rfxId,
          incoterm: d.incoterm,
          namedPlace: d.namedPlace,
          leadTimeDays: d.leadTimeDays,
          totalCents: BigInt(d.totalCents),
          lines: {
            create: d.lines.map((l) => ({
              lineNo: l.lineNo,
              prLineId: l.prLineId,
              activePrLineId: l.prLineId,
              rfxBidLineId: l.rfxBidLineId,
              itemId: l.itemId,
              description: l.description,
              uom: l.uom,
              quantity: toDecimal(l.quantity),
              unitPriceCents: BigInt(l.unitPriceCents),
              lineTotalCents: BigInt(l.lineTotalCents),
            })),
          },
        },
        select: { id: true },
      });
      return row.id;
    } catch (e) {
      // Unique activePrLineId / rfxBidLineId: someone ordered these lines a moment ago.
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new DomainError('conflict', 'PO_ALREADY_ORDERED', 'These lines are already on a PO');
      }
      throw e;
    }
  }

  async transition(id: string, expectedVersion: number, patch: PoPatch): Promise<void> {
    const { expectedDeliveryDate, ...rest } = patch;
    const { count } = await this.tx.client.purchaseOrder.updateMany({
      where: { id, version: expectedVersion },
      data: {
        ...rest,
        ...(expectedDeliveryDate
          ? { expectedDeliveryDate: new Date(`${expectedDeliveryDate}T00:00:00.000Z`) }
          : {}),
        version: { increment: 1 },
      },
    });
    if (count === 0) throw staleWrite('Purchase order');
  }

  async releaseLines(poId: string): Promise<void> {
    await this.tx.client.poLine.updateMany({ where: { poId }, data: { activePrLineId: null } });
  }

  async addReceivedQuantities(lines: { poLineId: string; quantity: number }[]): Promise<void> {
    for (const l of lines) {
      await this.tx.client.poLine.update({
        where: { id: l.poLineId },
        data: { receivedQuantity: { increment: toDecimal(l.quantity) } },
      });
    }
  }

  async addInvoicedQuantities(lines: { poLineId: string; quantity: number }[]): Promise<void> {
    for (const l of lines) {
      await this.tx.client.poLine.update({
        where: { id: l.poLineId },
        data: { invoicedQuantity: { increment: toDecimal(l.quantity) } },
      });
    }
  }
}
