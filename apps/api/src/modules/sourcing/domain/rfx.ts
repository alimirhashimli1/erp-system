import {
  type Award,
  type Incoterm,
  isEuCountry,
  landedCost,
  lineTotalCents,
  type Offer,
  type RfxEvaluation,
  type RfxStatus,
  type RfxType,
  type SubmitBid,
  toMilli,
  type Uom,
} from '@procurestack/shared';
import { assertTransition, DomainError } from '../../../common/domain-error';

/*
 * Sourcing (RFx) domain — pure functions, unit-tested in rfx.spec.ts.
 * Core ideas: competition (min. suppliers), sealed bids, deadlines, and award on
 * total landed cost with a documented reason for any deviation.
 */

export interface SupplierInfo {
  id: string;
  code: string;
  name: string;
  countryCode: string;
}

export interface RfxLine {
  id: string;
  lineNo: number;
  prLineId: string;
  prNumber: string;
  itemId: string;
  sku: string;
  description: string;
  uom: Uom;
  quantity: number;
  awardedBidLineId: string | null;
}

export interface Invitation {
  supplier: SupplierInfo;
  status: 'INVITED' | 'RESPONDED' | 'DECLINED';
  respondedAt: Date | null;
}

export interface Bid {
  id: string;
  supplier: SupplierInfo;
  incoterm: Incoterm;
  leadTimeDays: number;
  validUntil: string;
  originChargesCents: number;
  freightCents: number;
  insuranceCents: number;
  destinationHandlingCents: number;
  dutyRateBps: number;
  source: 'MANUAL' | 'SIMULATED';
  submittedAt: Date;
  lines: { id: string; rfxLineId: string; unitPriceCents: number }[];
}

export interface RfxEvent {
  id: string;
  number: string;
  type: RfxType;
  title: string;
  status: RfxStatus;
  buyerId: string;
  buyerName: string;
  responseDeadline: Date;
  publishedAt: Date | null;
  closedAt: Date | null;
  evaluatedAt: Date | null;
  awardedAt: Date | null;
  awardJustification: string | null;
  version: number;
  createdAt: Date;
  lines: RfxLine[];
  invitations: Invitation[];
  bids: Bid[];
}

// ---- state machine ----

export const RFX_TRANSITIONS: Readonly<Record<RfxStatus, readonly RfxStatus[]>> = {
  DRAFT: ['PUBLISHED', 'CANCELLED'],
  PUBLISHED: ['CLOSED', 'CANCELLED'],
  CLOSED: ['EVALUATED', 'CANCELLED'],
  EVALUATED: ['AWARDED', 'CANCELLED'],
  AWARDED: [],
  CANCELLED: [],
};

export const assertRfxTransition = (from: RfxStatus, to: RfxStatus) => {
  assertTransition(RFX_TRANSITIONS, from, to, 'RFx');
};

/** Bids stay sealed until the event closes, so nobody can leak a rival's price. */
export const isSealed = (rfx: Pick<RfxEvent, 'status'>) =>
  rfx.status === 'DRAFT' || rfx.status === 'PUBLISHED';

/** Competition rule: priced events need at least two invited suppliers. */
export const minSuppliers = (type: RfxType) => (type === 'RFI' ? 1 : 2);

const rule = (code: string, message: string) => new DomainError('rule', code, message);

export function assertCanPublish(rfx: RfxEvent, now: Date): void {
  assertRfxTransition(rfx.status, 'PUBLISHED');
  const min = minSuppliers(rfx.type);
  if (rfx.invitations.length < min) {
    throw rule('RFX_TOO_FEW_SUPPLIERS', `An ${rfx.type} needs at least ${String(min)} suppliers`);
  }
  if (rfx.responseDeadline <= now) {
    throw rule('RFX_DEADLINE_PASSED', 'The response deadline must be in the future');
  }
}

export function assertCanBid(rfx: RfxEvent, bid: SubmitBid, now: Date): void {
  if (rfx.type === 'RFI') {
    throw rule('RFX_RFI_NO_PRICES', 'An RFI collects information only — no priced bids');
  }
  if (rfx.status !== 'PUBLISHED') {
    throw new DomainError('conflict', 'RFX_NOT_OPEN', 'This event is not accepting bids');
  }
  if (now > rfx.responseDeadline) {
    throw rule('RFX_LATE_BID', 'The response deadline has passed — late bids are not accepted');
  }
  const invitation = rfx.invitations.find((i) => i.supplier.id === bid.supplierId);
  if (!invitation || invitation.status === 'DECLINED') {
    throw rule('RFX_SUPPLIER_NOT_INVITED', 'Only invited, non-declined suppliers can bid');
  }
  const lineIds = new Set(rfx.lines.map((l) => l.id));
  if (bid.lines.some((l) => !lineIds.has(l.rfxLineId))) {
    throw rule('RFX_UNKNOWN_LINE', 'A bid line does not belong to this event');
  }
}

// ---- evaluation ----

/**
 * Ranks every offer per line by landed cost (ADR: compare total cost, not unit price).
 * Bid-level extras (freight, insurance, duty, handling) are computed once per bid with
 * the shared `landedCost()` and allocated to its lines in proportion to goods value.
 */
export function evaluate(rfx: RfxEvent, today: string): RfxEvaluation {
  const offersByLine = new Map<string, Omit<Offer, 'rank'>[]>(rfx.lines.map((l) => [l.id, []]));
  const lineById = new Map(rfx.lines.map((l) => [l.id, l]));

  for (const bid of rfx.bids) {
    const priced = bid.lines.flatMap((bl) => {
      const line = lineById.get(bl.rfxLineId);
      return line ? [{ bl, line, goods: lineTotalCents(line.quantity, bl.unitPriceCents) }] : [];
    });
    const goodsCents = priced.reduce((sum, p) => sum + p.goods, 0);
    const landed = landedCost({
      incoterm: bid.incoterm,
      goodsCents,
      originChargesCents: bid.originChargesCents,
      freightCents: bid.freightCents,
      insuranceCents: bid.insuranceCents,
      destinationHandlingCents: bid.destinationHandlingCents,
      // EU customs union: no import duty on intra-EU supplies, whatever was quoted.
      dutyRateBps: isEuCountry(bid.supplier.countryCode) ? 0 : bid.dutyRateBps,
    });
    const extras = landed.totalCents - goodsCents;

    for (const { bl, line, goods } of priced) {
      const share =
        goodsCents > 0
          ? Math.round((extras * goods) / goodsCents)
          : Math.round(extras / priced.length);
      const landedCents = goods + share;
      offersByLine.get(line.id)?.push({
        bidId: bid.id,
        bidLineId: bl.id,
        supplier: bid.supplier,
        incoterm: bid.incoterm,
        leadTimeDays: bid.leadTimeDays,
        unitPriceCents: bl.unitPriceCents,
        goodsCents: goods,
        extrasCents: share,
        landedCents,
        landedPerUnitCents: Math.round((landedCents * 1000) / toMilli(line.quantity)),
        expired: bid.validUntil < today,
      });
    }
  }

  return {
    lines: rfx.lines.map((line) => ({
      rfxLineId: line.id,
      offers: [...(offersByLine.get(line.id) ?? [])]
        // Cheapest landed first; faster delivery breaks ties.
        .sort((a, b) => a.landedCents - b.landedCents || a.leadTimeDays - b.leadTimeDays)
        .map((o, i) => ({ ...o, rank: i + 1 })),
    })),
  };
}

// ---- award ----

export interface AwardDecision {
  awards: { rfxLineId: string; bidLineId: string; prLineId: string }[];
  /** Lines awarded to an offer other than rank 1 (needs justification). */
  deviations: { rfxLineId: string; chosenRank: number }[];
}

export function decideAward(rfx: RfxEvent, input: Award, today: string): AwardDecision {
  if (rfx.type === 'RFI') {
    throw rule('RFX_RFI_NOT_AWARDABLE', 'An RFI cannot be awarded — run an RFQ/RFP next');
  }
  assertRfxTransition(rfx.status, 'AWARDED');
  const evaluation = evaluate(rfx, today);
  const awards: AwardDecision['awards'] = [];
  const deviations: AwardDecision['deviations'] = [];

  for (const a of input.awards) {
    const line = rfx.lines.find((l) => l.id === a.rfxLineId);
    const offer = evaluation.lines
      .find((l) => l.rfxLineId === a.rfxLineId)
      ?.offers.find((o) => o.bidLineId === a.bidLineId);
    if (!line || !offer) {
      throw rule(
        'RFX_AWARD_UNKNOWN_OFFER',
        'Award must reference an offer on a line of this event',
      );
    }
    if (offer.expired) {
      throw rule('RFX_BID_EXPIRED', `${offer.supplier.name}'s bid validity has expired`);
    }
    if (offer.rank !== 1) deviations.push({ rfxLineId: line.id, chosenRank: offer.rank });
    awards.push({ rfxLineId: line.id, bidLineId: offer.bidLineId, prLineId: line.prLineId });
  }

  if (deviations.length > 0 && (input.justification?.length ?? 0) < 10) {
    throw rule(
      'RFX_AWARD_JUSTIFICATION_REQUIRED',
      'Awarding to an offer that is not the lowest landed cost needs a written justification',
    );
  }
  return { awards, deviations };
}
