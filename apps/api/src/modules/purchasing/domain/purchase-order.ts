import {
  applyBps,
  type Incoterm,
  lineTotalCents,
  PO_BUDGET_TOLERANCE_BPS,
  type PoStatus,
  toMilli,
  type Uom,
} from '@procurestack/shared';
import { assertTransition, DomainError } from '../../../common/domain-error';

/*
 * Purchase order domain — pure functions, unit-tested in purchase-order.spec.ts.
 * A PO is the legally binding promise to pay; issuing one is the moment money is committed.
 */

export interface SupplierRef {
  id: string;
  code: string;
  name: string;
  countryCode: string;
}

export interface PoLine {
  id: string;
  lineNo: number;
  prLineId: string;
  prNumber: string;
  /** The requester's approved estimate — the budget this line was approved against. */
  approvedUnitPriceCents: number;
  rfxBidLineId: string;
  itemId: string;
  sku: string;
  description: string;
  uom: Uom;
  quantity: number;
  unitPriceCents: number;
  lineTotalCents: number;
  receivedQuantity: number;
  invoicedQuantity: number;
}

export interface PurchaseOrder {
  id: string;
  number: string;
  status: PoStatus;
  supplier: SupplierRef;
  buyerId: string;
  buyerName: string;
  rfxId: string;
  rfxNumber: string;
  incoterm: Incoterm;
  namedPlace: string;
  leadTimeDays: number;
  totalCents: number;
  expectedDeliveryDate: string | null;
  issuedAt: Date | null;
  acknowledgedAt: Date | null;
  closedAt: Date | null;
  cancelReason: string | null;
  version: number;
  createdAt: Date;
  lines: PoLine[];
  /** Requesters of the PRs behind this PO (for segregation of duties). */
  requesterIds: string[];
}

// ---- state machine ----

export const PO_TRANSITIONS: Readonly<Record<PoStatus, readonly PoStatus[]>> = {
  DRAFT: ['ISSUED', 'CANCELLED'],
  ISSUED: ['ACKNOWLEDGED', 'PARTIALLY_RECEIVED', 'RECEIVED', 'CANCELLED'],
  ACKNOWLEDGED: ['PARTIALLY_RECEIVED', 'RECEIVED', 'CANCELLED'],
  PARTIALLY_RECEIVED: ['RECEIVED', 'CLOSED'],
  RECEIVED: ['CLOSED'],
  CLOSED: [],
  CANCELLED: [],
};

export const assertPoTransition = (from: PoStatus, to: PoStatus) => {
  assertTransition(PO_TRANSITIONS, from, to, 'Purchase order');
};

// ---- creating POs from an award ----

/** An awarded RFx line, joined with what the PO needs from the PR and the winning bid. */
export interface AwardedLine {
  prLineId: string;
  sourcingStatus: 'OPEN' | 'IN_SOURCING' | 'AWARDED' | 'ORDERED';
  itemId: string;
  description: string;
  uom: Uom;
  quantity: number;
  bidLineId: string;
  unitPriceCents: number;
  supplierId: string;
  incoterm: Incoterm;
  leadTimeDays: number;
}

export interface PoDraft {
  supplierId: string;
  incoterm: Incoterm;
  leadTimeDays: number;
  totalCents: number;
  lines: {
    lineNo: number;
    prLineId: string;
    rfxBidLineId: string;
    itemId: string;
    description: string;
    uom: Uom;
    quantity: number;
    unitPriceCents: number;
    lineTotalCents: number;
  }[];
}

/** One PO per winning supplier, covering that supplier's not-yet-ordered awarded lines. */
export function planPurchaseOrders(awarded: AwardedLine[]): PoDraft[] {
  const pending = awarded.filter((l) => l.sourcingStatus === 'AWARDED');
  if (pending.length === 0) {
    throw new DomainError(
      'conflict',
      'PO_NOTHING_TO_ORDER',
      'Every awarded line is already on a PO',
    );
  }
  // The bid's terms (Incoterm, lead time) are the same for all lines of one supplier.
  const bySupplier = new Map<string, { terms: AwardedLine; lines: AwardedLine[] }>();
  for (const l of pending) {
    const group = bySupplier.get(l.supplierId) ?? { terms: l, lines: [] };
    group.lines.push(l);
    bySupplier.set(l.supplierId, group);
  }

  return [...bySupplier.values()].map(({ terms: first, lines }) => {
    const poLines = lines.map((l, i) => ({
      lineNo: i + 1,
      prLineId: l.prLineId,
      rfxBidLineId: l.bidLineId,
      itemId: l.itemId,
      description: l.description,
      uom: l.uom,
      quantity: l.quantity,
      unitPriceCents: l.unitPriceCents,
      lineTotalCents: lineTotalCents(l.quantity, l.unitPriceCents),
    }));
    return {
      supplierId: first.supplierId,
      incoterm: first.incoterm,
      leadTimeDays: first.leadTimeDays,
      totalCents: poLines.reduce((s, l) => s + l.lineTotalCents, 0),
      lines: poLines,
    };
  });
}

// ---- issuing ----

/** Value the PRs were approved for (quantity × the requester's estimate). */
export const approvedBudgetCents = (po: Pick<PurchaseOrder, 'lines'>) =>
  po.lines.reduce((s, l) => s + lineTotalCents(l.quantity, l.approvedUnitPriceCents), 0);

export function assertCanIssue(po: PurchaseOrder, actorId: string): void {
  assertPoTransition(po.status, 'ISSUED');
  // SoD: whoever asked for the goods must not also commit the money with the supplier.
  if (po.requesterIds.includes(actorId)) {
    throw new DomainError(
      'forbidden',
      'PO_SOD_REQUESTER_ISSUER',
      'You requested some of these goods — another buyer must issue the PO',
    );
  }
  // Approval was given for an amount; a much dearer PO needs a fresh approval.
  const budget = approvedBudgetCents(po);
  const ceiling = budget + applyBps(budget, PO_BUDGET_TOLERANCE_BPS);
  if (po.totalCents > ceiling) {
    throw new DomainError(
      'rule',
      'PO_EXCEEDS_APPROVED_BUDGET',
      `PO total exceeds the approved requisition value by more than ${String(PO_BUDGET_TOLERANCE_BPS / 100)} % — raise a new requisition for the difference`,
    );
  }
}

export const expectedDeliveryDate = (issuedOn: string, leadTimeDays: number): string =>
  new Date(Date.parse(`${issuedOn}T00:00:00Z`) + leadTimeDays * 86_400_000)
    .toISOString()
    .slice(0, 10);

// ---- cancelling / closing ----

export function assertCanCancel(po: PurchaseOrder): void {
  assertPoTransition(po.status, 'CANCELLED');
  if (po.lines.some((l) => l.receivedQuantity > 0)) {
    throw new DomainError('conflict', 'PO_HAS_RECEIPTS', 'Goods were already received on this PO');
  }
}

/** After a goods receipt: fully received when every line's accepted quantity is complete. */
export function statusAfterReceipt(
  lines: Pick<PoLine, 'quantity' | 'receivedQuantity'>[],
): PoStatus {
  const complete = lines.every((l) => toMilli(l.receivedQuantity) >= toMilli(l.quantity));
  return complete ? 'RECEIVED' : 'PARTIALLY_RECEIVED';
}
