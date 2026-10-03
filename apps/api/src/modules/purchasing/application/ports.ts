import type { PoStatus } from '@procurestack/shared';
import type { AwardedLine, PoDraft, PurchaseOrder } from '../domain/purchase-order';

export interface PoPatch {
  status: PoStatus;
  issuedAt?: Date;
  expectedDeliveryDate?: string;
  acknowledgedAt?: Date;
  closedAt?: Date;
  cancelReason?: string;
}

export interface PurchaseOrderRepository {
  findById(id: string): Promise<PurchaseOrder | null>;
  list(filter: { status?: PoStatus }): Promise<PurchaseOrder[]>;
  /** Awarded lines of an RFx with the winning bid's terms. */
  awardedLines(rfxId: string): Promise<AwardedLine[]>;
  /** 409 if a PR line / bid line is already on a live PO (unique constraints). */
  create(
    draft: PoDraft & { number: string; buyerId: string; rfxId: string; namedPlace: string },
  ): Promise<string>;
  transition(id: string, expectedVersion: number, patch: PoPatch): Promise<void>;
  /** On cancel: frees the PR lines so they can be re-ordered. */
  releaseLines(poId: string): Promise<void>;
  /** Adds accepted goods-receipt quantities to PO lines (DB check: never above ordered). */
  addReceivedQuantities(lines: { poLineId: string; quantity: number }[]): Promise<void>;
  addInvoicedQuantities(lines: { poLineId: string; quantity: number }[]): Promise<void>;
}

export const PURCHASE_ORDER_REPOSITORY = Symbol('PURCHASE_ORDER_REPOSITORY');
