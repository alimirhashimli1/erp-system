import { z } from 'zod';
import { CentsSchema } from '../common/money';
import { IncotermSchema } from '../logistics/incoterms';
import { UomSchema } from '../master-data/master-data.schemas';

/**
 * RFI = information only (no prices, never awarded) · RFP = solution + price ·
 * RFQ = known spec, price is the question.
 */
export const RFX_TYPES = ['RFI', 'RFP', 'RFQ'] as const;
export const RfxTypeSchema = z.enum(RFX_TYPES);
export type RfxType = z.infer<typeof RfxTypeSchema>;

export const RFX_STATUSES = [
  'DRAFT',
  'PUBLISHED',
  'CLOSED',
  'EVALUATED',
  'AWARDED',
  'CANCELLED',
] as const;
export const RfxStatusSchema = z.enum(RFX_STATUSES);
export type RfxStatus = z.infer<typeof RfxStatusSchema>;

export const InvitationStatusSchema = z.enum(['INVITED', 'RESPONDED', 'DECLINED']);

/** Sourcing backlog: approved PR lines not yet in sourcing. */
export const SOURCING_STATUSES = ['OPEN', 'IN_SOURCING', 'AWARDED', 'ORDERED'] as const;
export const SourcingStatusSchema = z.enum(SOURCING_STATUSES);
export type SourcingStatus = z.infer<typeof SourcingStatusSchema>;

const uniqueIds = (ids: string[]) => new Set(ids).size === ids.length;

// ---- inputs ----

export const CreateRfxSchema = z.object({
  type: RfxTypeSchema,
  title: z.string().trim().min(3).max(200),
  responseDeadline: z.iso.datetime({ offset: true }),
  prLineIds: z.array(z.uuid()).min(1).max(50).refine(uniqueIds, 'Duplicate PR line'),
  supplierIds: z.array(z.uuid()).min(1).max(20).refine(uniqueIds, 'Duplicate supplier'),
});
export type CreateRfx = z.infer<typeof CreateRfxSchema>;

/**
 * One supplier's bid. Shipment-level costs (freight, insurance…) are quoted once per
 * bid under its Incoterm; evaluation allocates them to lines by goods value.
 */
export const SubmitBidSchema = z.object({
  supplierId: z.uuid(),
  incoterm: IncotermSchema,
  leadTimeDays: z.number().int().min(0).max(365),
  validUntil: z.iso.date(),
  originChargesCents: CentsSchema.default(0),
  freightCents: CentsSchema.default(0),
  insuranceCents: CentsSchema.default(0),
  destinationHandlingCents: CentsSchema.default(0),
  /** Import duty for this origin (basis points). Ignored for EU suppliers (customs union). */
  dutyRateBps: z.number().int().min(0).max(100_000).default(0),
  lines: z
    .array(z.object({ rfxLineId: z.uuid(), unitPriceCents: CentsSchema }))
    .min(1)
    .refine((ls) => uniqueIds(ls.map((l) => l.rfxLineId)), 'Duplicate line'),
});
export type SubmitBid = z.infer<typeof SubmitBidSchema>;
export type SubmitBidInput = z.input<typeof SubmitBidSchema>;

export const AwardSchema = z.object({
  awards: z
    .array(z.object({ rfxLineId: z.uuid(), bidLineId: z.uuid() }))
    .min(1)
    .refine((as) => uniqueIds(as.map((a) => a.rfxLineId)), 'A line can be awarded only once'),
  /** Required when any award does not go to the best landed-cost offer. */
  justification: z.string().trim().max(2000).optional(),
});
export type Award = z.infer<typeof AwardSchema>;

// ---- outputs ----

const SupplierRef = z.object({
  id: z.uuid(),
  code: z.string(),
  name: z.string(),
  countryCode: z.string(),
});

export const OpenPrLineSchema = z.object({
  prLineId: z.uuid(),
  requisitionId: z.uuid(),
  prNumber: z.string(),
  lineNo: z.number().int(),
  itemId: z.uuid(),
  sku: z.string(),
  description: z.string(),
  uom: UomSchema,
  quantity: z.number(),
  estimatedUnitPriceCents: CentsSchema,
  needByDate: z.iso.date(),
});
export type OpenPrLine = z.infer<typeof OpenPrLineSchema>;
export const OpenPrLineListSchema = z.array(OpenPrLineSchema);

export const RfxLineSchema = z.object({
  id: z.uuid(),
  lineNo: z.number().int(),
  prLineId: z.uuid(),
  prNumber: z.string(),
  itemId: z.uuid(),
  sku: z.string(),
  description: z.string(),
  uom: UomSchema,
  quantity: z.number(),
  awardedBidLineId: z.uuid().nullable(),
});

export const BidSchema = z.object({
  id: z.uuid(),
  supplier: SupplierRef,
  incoterm: IncotermSchema,
  leadTimeDays: z.number().int(),
  validUntil: z.iso.date(),
  originChargesCents: CentsSchema,
  freightCents: CentsSchema,
  insuranceCents: CentsSchema,
  destinationHandlingCents: CentsSchema,
  dutyRateBps: z.number().int(),
  source: z.enum(['MANUAL', 'SIMULATED']),
  submittedAt: z.iso.datetime(),
  lines: z.array(z.object({ id: z.uuid(), rfxLineId: z.uuid(), unitPriceCents: CentsSchema })),
});
export type Bid = z.infer<typeof BidSchema>;

export const OfferSchema = z.object({
  bidId: z.uuid(),
  bidLineId: z.uuid(),
  supplier: SupplierRef,
  incoterm: IncotermSchema,
  leadTimeDays: z.number().int(),
  unitPriceCents: CentsSchema,
  goodsCents: CentsSchema,
  /** Bid-level freight/insurance/duty/handling share allocated to this line by value. */
  extrasCents: CentsSchema,
  landedCents: CentsSchema,
  landedPerUnitCents: CentsSchema,
  /** 1 = lowest landed cost for this line. */
  rank: z.number().int(),
  expired: z.boolean(),
});
export type Offer = z.infer<typeof OfferSchema>;

export const RfxEvaluationSchema = z.object({
  lines: z.array(z.object({ rfxLineId: z.uuid(), offers: z.array(OfferSchema) })),
});
export type RfxEvaluation = z.infer<typeof RfxEvaluationSchema>;

export const RfxSummarySchema = z.object({
  id: z.uuid(),
  number: z.string(),
  type: RfxTypeSchema,
  title: z.string(),
  status: RfxStatusSchema,
  buyer: z.object({ id: z.uuid(), fullName: z.string() }),
  responseDeadline: z.iso.datetime(),
  invitedCount: z.number().int(),
  respondedCount: z.number().int(),
  createdAt: z.iso.datetime(),
});
export type RfxSummary = z.infer<typeof RfxSummarySchema>;
export const RfxSummaryListSchema = z.array(RfxSummarySchema);

export const RfxSchema = RfxSummarySchema.extend({
  version: z.number().int(),
  publishedAt: z.iso.datetime().nullable(),
  closedAt: z.iso.datetime().nullable(),
  evaluatedAt: z.iso.datetime().nullable(),
  awardedAt: z.iso.datetime().nullable(),
  awardJustification: z.string().nullable(),
  /** True while bids are sealed (before closing): bid contents are withheld. */
  sealed: z.boolean(),
  lines: z.array(RfxLineSchema),
  invitations: z.array(
    z.object({
      supplier: SupplierRef,
      status: InvitationStatusSchema,
      respondedAt: z.iso.datetime().nullable(),
    }),
  ),
  bids: z.array(BidSchema),
  evaluation: RfxEvaluationSchema.nullable(),
});
export type Rfx = z.infer<typeof RfxSchema>;
