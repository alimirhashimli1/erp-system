import { z } from 'zod';
import { CentsSchema } from '../common/money';
import { IncotermSchema } from '../logistics/incoterms';
import { UomSchema } from '../master-data/master-data.schemas';

export const PO_STATUSES = [
  'DRAFT',
  'ISSUED',
  'ACKNOWLEDGED',
  'PARTIALLY_RECEIVED',
  'RECEIVED',
  'CLOSED',
  'CANCELLED',
] as const;
export const PoStatusSchema = z.enum(PO_STATUSES);
export type PoStatus = z.infer<typeof PoStatusSchema>;

/** PO value may exceed the approved PR estimate by at most this much (basis points). */
export const PO_BUDGET_TOLERANCE_BPS = 1_000; // 10 %

// ---- inputs ----

export const CreatePosFromRfxSchema = z.object({
  /** Incoterm "named place", e.g. "Hamburg plant, gate 3" — where delivery happens. */
  namedPlace: z.string().trim().min(2).max(200),
});
export type CreatePosFromRfx = z.infer<typeof CreatePosFromRfxSchema>;

export const AcknowledgePoSchema = z.object({
  /** Supplier's confirmed delivery date from the order confirmation. */
  confirmedDeliveryDate: z.iso.date(),
});
export type AcknowledgePo = z.infer<typeof AcknowledgePoSchema>;

export const CancelPoSchema = z.object({ reason: z.string().trim().min(5).max(500) });
export type CancelPo = z.infer<typeof CancelPoSchema>;

export const PoListQuerySchema = z.object({ status: PoStatusSchema.optional() });

// ---- outputs ----

export const PoLineSchema = z.object({
  id: z.uuid(),
  lineNo: z.number().int(),
  prLineId: z.uuid(),
  prNumber: z.string(),
  itemId: z.uuid(),
  sku: z.string(),
  description: z.string(),
  uom: UomSchema,
  quantity: z.number(),
  unitPriceCents: CentsSchema,
  lineTotalCents: CentsSchema,
  /** Accepted quantity received so far (goods receipts minus rejects). */
  receivedQuantity: z.number(),
  invoicedQuantity: z.number(),
});
export type PoLine = z.infer<typeof PoLineSchema>;

export const PurchaseOrderSummarySchema = z.object({
  id: z.uuid(),
  number: z.string(),
  status: PoStatusSchema,
  supplier: z.object({ id: z.uuid(), code: z.string(), name: z.string(), countryCode: z.string() }),
  totalCents: CentsSchema,
  incoterm: IncotermSchema,
  namedPlace: z.string(),
  expectedDeliveryDate: z.iso.date().nullable(),
  createdAt: z.iso.datetime(),
});
export type PurchaseOrderSummary = z.infer<typeof PurchaseOrderSummarySchema>;
export const PurchaseOrderSummaryListSchema = z.array(PurchaseOrderSummarySchema);

export const PurchaseOrderSchema = PurchaseOrderSummarySchema.extend({
  rfx: z.object({ id: z.uuid(), number: z.string() }),
  buyer: z.object({ id: z.uuid(), fullName: z.string() }),
  leadTimeDays: z.number().int(),
  version: z.number().int(),
  issuedAt: z.iso.datetime().nullable(),
  acknowledgedAt: z.iso.datetime().nullable(),
  closedAt: z.iso.datetime().nullable(),
  cancelReason: z.string().nullable(),
  lines: z.array(PoLineSchema),
});
export type PurchaseOrder = z.infer<typeof PurchaseOrderSchema>;
export const PurchaseOrderListSchema = z.array(PurchaseOrderSchema);
