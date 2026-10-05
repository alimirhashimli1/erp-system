import { type PostGoodsReceipt, toMilli, type Uom } from '@procurestack/shared';
import { DomainError } from '../../../common/domain-error';
import type { PurchaseOrder } from '../../purchasing/domain/purchase-order';

/*
 * Goods receipt (GR) rules — pure, unit-tested in goods-receipt.spec.ts.
 * The GR is the "second way" of the 3-way match: proof that goods actually arrived.
 */

export interface GoodsReceipt {
  id: string;
  number: string;
  poId: string;
  poNumber: string;
  supplier: { id: string; name: string };
  receivedById: string;
  receivedByName: string;
  receivedAt: Date;
  deliveryNote: string;
  lines: {
    id: string;
    poLineId: string;
    lineNo: number;
    sku: string;
    description: string;
    uom: Uom;
    receivedQuantity: number;
    rejectedQuantity: number;
    acceptedQuantity: number;
    rejectionReason: string | null;
  }[];
}

export interface AcceptedLine {
  poLineId: string;
  receivedQuantity: number;
  rejectedQuantity: number;
  acceptedQuantity: number;
  rejectionReason: string | null;
}

const OPEN_FOR_RECEIPT = ['ISSUED', 'ACKNOWLEDGED', 'PARTIALLY_RECEIVED'];

/** Thousandths → number, avoiding float subtraction drift (e.g. 2.3 − 0.1). */
const fromMilli = (milli: number) => milli / 1000;

export function checkReceipt(
  po: PurchaseOrder,
  actorId: string,
  input: PostGoodsReceipt,
): AcceptedLine[] {
  if (!OPEN_FOR_RECEIPT.includes(po.status)) {
    throw new DomainError(
      'conflict',
      'GR_PO_NOT_OPEN',
      `A ${po.status} purchase order can't be received`,
    );
  }
  // SoD: the buyer who placed the order must not confirm its delivery.
  if (po.buyerId === actorId) {
    throw new DomainError(
      'forbidden',
      'GR_SOD_BUYER_RECEIVER',
      'You placed this order — someone else must confirm receipt',
    );
  }
  return input.lines.map((l) => {
    const poLine = po.lines.find((pl) => pl.id === l.poLineId);
    if (!poLine) {
      throw new DomainError(
        'rule',
        'GR_UNKNOWN_LINE',
        'A receipt line is not on this purchase order',
      );
    }
    const accepted = toMilli(l.receivedQuantity) - toMilli(l.rejectedQuantity);
    // Over-delivery isn't silently accepted: reject the excess (or order more).
    if (toMilli(poLine.receivedQuantity) + accepted > toMilli(poLine.quantity)) {
      const open = fromMilli(toMilli(poLine.quantity) - toMilli(poLine.receivedQuantity));
      throw new DomainError(
        'rule',
        'GR_OVER_DELIVERY',
        `Line ${String(poLine.lineNo)}: only ${String(open)} ${poLine.uom} still open — reject the excess`,
      );
    }
    return {
      poLineId: l.poLineId,
      receivedQuantity: l.receivedQuantity,
      rejectedQuantity: l.rejectedQuantity,
      acceptedQuantity: fromMilli(accepted),
      rejectionReason: l.rejectionReason ?? null,
    };
  });
}
