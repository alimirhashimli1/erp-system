import { Injectable } from '@nestjs/common';
import { quantityFromDb } from '../../../common/money';
import { Prisma } from '../../../generated/prisma/client';
import { PrismaTxHost } from '../../../infrastructure/prisma/prisma-tx-host';
import type { AcceptedLine, GoodsReceipt } from '../domain/goods-receipt';

/** Port: create + read goods receipts. Rows are immutable once written (DB trigger). */
export interface GoodsReceiptRepository {
  create(gr: {
    number: string;
    poId: string;
    receivedById: string;
    deliveryNote: string;
    receivedAt: Date;
    lines: AcceptedLine[];
  }): Promise<string>;
  findById(id: string): Promise<GoodsReceipt | null>;
  list(filter: { poId?: string }): Promise<GoodsReceipt[]>;
}

export const GOODS_RECEIPT_REPOSITORY = Symbol('GOODS_RECEIPT_REPOSITORY');

const include = {
  po: { select: { number: true, supplier: { select: { id: true, name: true } } } },
  receivedBy: { select: { fullName: true } },
  lines: {
    include: {
      poLine: {
        select: { lineNo: true, description: true, uom: true, item: { select: { sku: true } } },
      },
    },
  },
} satisfies Prisma.GoodsReceiptInclude;

type Row = Prisma.GoodsReceiptGetPayload<{ include: typeof include }>;

const dec = (n: number) => new Prisma.Decimal(n.toString());

const toDomain = (r: Row): GoodsReceipt => ({
  id: r.id,
  number: r.number,
  poId: r.poId,
  poNumber: r.po.number,
  supplier: r.po.supplier,
  receivedById: r.receivedById,
  receivedByName: r.receivedBy.fullName,
  receivedAt: r.receivedAt,
  deliveryNote: r.deliveryNote,
  lines: r.lines
    .map((l) => ({
      id: l.id,
      poLineId: l.poLineId,
      lineNo: l.poLine.lineNo,
      sku: l.poLine.item.sku,
      description: l.poLine.description,
      uom: l.poLine.uom,
      receivedQuantity: quantityFromDb(l.receivedQuantity),
      rejectedQuantity: quantityFromDb(l.rejectedQuantity),
      acceptedQuantity: quantityFromDb(l.acceptedQuantity),
      rejectionReason: l.rejectionReason,
    }))
    .sort((a, b) => a.lineNo - b.lineNo),
});

@Injectable()
export class PrismaGoodsReceiptRepository implements GoodsReceiptRepository {
  constructor(private readonly tx: PrismaTxHost) {}

  async create(gr: Parameters<GoodsReceiptRepository['create']>[0]): Promise<string> {
    const row = await this.tx.client.goodsReceipt.create({
      data: {
        number: gr.number,
        poId: gr.poId,
        receivedById: gr.receivedById,
        deliveryNote: gr.deliveryNote,
        receivedAt: gr.receivedAt,
        lines: {
          create: gr.lines.map((l) => ({
            poLineId: l.poLineId,
            receivedQuantity: dec(l.receivedQuantity),
            rejectedQuantity: dec(l.rejectedQuantity),
            acceptedQuantity: dec(l.acceptedQuantity),
            rejectionReason: l.rejectionReason,
          })),
        },
      },
      select: { id: true },
    });
    return row.id;
  }

  async findById(id: string): Promise<GoodsReceipt | null> {
    const row = await this.tx.client.goodsReceipt.findUnique({ where: { id }, include });
    return row ? toDomain(row) : null;
  }

  async list(filter: { poId?: string }): Promise<GoodsReceipt[]> {
    const rows = await this.tx.client.goodsReceipt.findMany({
      where: filter,
      include,
      orderBy: { receivedAt: 'desc' },
      take: 200,
    });
    return rows.map(toDomain);
  }
}
