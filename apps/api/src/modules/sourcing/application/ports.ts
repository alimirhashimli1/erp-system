import type {
  PrStatus,
  RfxStatus,
  RfxType,
  SourcingStatus,
  SubmitBid,
  Uom,
} from '@procurestack/shared';
import type { RfxEvent } from '../domain/rfx';

/** A PR line as sourcing sees it (the sourcing backlog). */
export interface PrLineForSourcing {
  prLineId: string;
  requisitionId: string;
  prNumber: string;
  prStatus: PrStatus;
  sourcingStatus: SourcingStatus;
  lineNo: number;
  itemId: string;
  sku: string;
  description: string;
  uom: Uom;
  quantity: number;
  unitPriceCents: number;
  needByDate: string;
}

export interface NewRfx {
  number: string;
  type: RfxType;
  title: string;
  buyerId: string;
  responseDeadline: Date;
  lines: { prLineId: string; itemId: string; quantity: number; uom: Uom }[];
  supplierIds: string[];
}

export interface RfxPatch {
  status: RfxStatus;
  publishedAt?: Date;
  closedAt?: Date;
  evaluatedAt?: Date;
  awardedAt?: Date;
  awardJustification?: string | null;
}

export interface RfxRepository {
  findById(id: string): Promise<RfxEvent | null>;
  list(filter: { status?: RfxStatus }): Promise<RfxEvent[]>;
  /** Approved PR lines nobody is sourcing yet. */
  openPrLines(): Promise<PrLineForSourcing[]>;
  findPrLines(ids: string[]): Promise<PrLineForSourcing[]>;
  /** Atomically OPEN → IN_SOURCING; false if another event claimed one first. */
  claimPrLines(ids: string[]): Promise<boolean>;
  setPrLineStatus(ids: string[], status: SourcingStatus): Promise<void>;
  create(rfx: NewRfx): Promise<string>;
  /** Version-checked update (409 on a stale version), see ADR 0006. */
  transition(id: string, expectedVersion: number, patch: RfxPatch): Promise<void>;
  /** Inserts or replaces the supplier's bid and marks the invitation RESPONDED. */
  saveBid(rfxId: string, bid: SubmitBid, source: 'MANUAL' | 'SIMULATED', at: Date): Promise<void>;
  declineInvitation(rfxId: string, supplierId: string, at: Date): Promise<void>;
  setAwards(awards: { rfxLineId: string; bidLineId: string }[]): Promise<void>;
}

export const RFX_REPOSITORY = Symbol('RFX_REPOSITORY');
