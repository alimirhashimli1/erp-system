import { Inject, Injectable } from '@nestjs/common';
import { type PostGoodsReceipt, toMilli } from '@procurestack/shared';
import { CLOCK, type Clock } from '../../../common/clock';
import {
  DOCUMENT_NUMBERS,
  type DocumentNumberGenerator,
} from '../../../common/document-number.port';
import { notFound } from '../../../common/domain-error';
import { UNIT_OF_WORK, type UnitOfWork } from '../../../common/unit-of-work';
import { AuditService } from '../../audit/audit.service';
import {
  PURCHASE_ORDER_REPOSITORY,
  type PurchaseOrderRepository,
} from '../../purchasing/application/ports';
import { assertPoTransition, statusAfterReceipt } from '../../purchasing/domain/purchase-order';
import { checkReceipt, type GoodsReceipt } from '../domain/goods-receipt';
import {
  GOODS_RECEIPT_REPOSITORY,
  type GoodsReceiptRepository,
} from '../infrastructure/prisma-goods-receipt.repository';

@Injectable()
export class ReceivingService {
  constructor(
    @Inject(GOODS_RECEIPT_REPOSITORY) private readonly receipts: GoodsReceiptRepository,
    @Inject(PURCHASE_ORDER_REPOSITORY) private readonly orders: PurchaseOrderRepository,
    @Inject(DOCUMENT_NUMBERS) private readonly numbers: DocumentNumberGenerator,
    @Inject(UNIT_OF_WORK) private readonly uow: UnitOfWork,
    @Inject(CLOCK) private readonly clock: Clock,
    private readonly audit: AuditService,
  ) {}

  list(poId?: string): Promise<GoodsReceipt[]> {
    return this.receipts.list(poId ? { poId } : {});
  }

  async get(id: string): Promise<GoodsReceipt> {
    const gr = await this.receipts.findById(id);
    if (!gr) throw notFound('Goods receipt');
    return gr;
  }

  /** Posts a receipt and moves the PO to PARTIALLY_RECEIVED / RECEIVED in one transaction. */
  async post(actorId: string, input: PostGoodsReceipt): Promise<GoodsReceipt> {
    const po = await this.orders.findById(input.poId);
    if (!po) throw notFound('Purchase order');
    const lines = checkReceipt(po, actorId, input);

    const accepted = new Map(lines.map((l) => [l.poLineId, toMilli(l.acceptedQuantity)]));
    const anyAccepted = lines.some((l) => l.acceptedQuantity > 0);
    const nextStatus = anyAccepted
      ? statusAfterReceipt(
          po.lines.map((pl) => ({
            quantity: pl.quantity,
            receivedQuantity: (toMilli(pl.receivedQuantity) + (accepted.get(pl.id) ?? 0)) / 1000,
          })),
        )
      : po.status; // everything rejected: the order is still fully open
    if (nextStatus !== po.status) assertPoTransition(po.status, nextStatus);

    const id = await this.uow.run(async () => {
      const grId = await this.receipts.create({
        number: await this.numbers.next('GR'),
        poId: po.id,
        receivedById: actorId,
        deliveryNote: input.deliveryNote,
        receivedAt: this.clock.now(),
        lines,
      });
      await this.orders.addReceivedQuantities(
        lines
          .filter((l) => l.acceptedQuantity > 0)
          .map((l) => ({ poLineId: l.poLineId, quantity: l.acceptedQuantity })),
      );
      // Version bump even if the status is unchanged: serializes concurrent receipts.
      await this.orders.transition(po.id, po.version, { status: nextStatus });
      await this.audit.record({
        actorId,
        action: 'GR_POSTED',
        entityType: 'GoodsReceipt',
        entityId: grId,
        after: { poId: po.id, deliveryNote: input.deliveryNote, lines },
        metadata: { poStatus: { before: po.status, after: nextStatus } },
      });
      return grId;
    });
    return this.get(id);
  }
}
