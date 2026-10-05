import { z } from 'zod';
import { NonNegativeQuantitySchema, toMilli } from '../common/money';
import { UomSchema } from '../master-data/master-data.schemas';

export const GrLineInputSchema = z
  .object({
    poLineId: z.uuid(),
    /** What physically arrived (per delivery note / count). */
    receivedQuantity: NonNegativeQuantitySchema,
    /** Damaged / wrong / failed inspection — sent back, not accepted into stock. */
    rejectedQuantity: NonNegativeQuantitySchema.default(0),
    rejectionReason: z.string().trim().max(300).optional(),
  })
  .refine((l) => toMilli(l.rejectedQuantity) <= toMilli(l.receivedQuantity), {
    message: 'Cannot reject more than was received',
    path: ['rejectedQuantity'],
  })
  .refine((l) => l.rejectedQuantity === 0 || (l.rejectionReason?.length ?? 0) > 0, {
    message: 'Say why goods were rejected',
    path: ['rejectionReason'],
  });

export const PostGoodsReceiptSchema = z.object({
  poId: z.uuid(),
  /** Supplier's delivery-note number: the paper trail the receipt is checked against. */
  deliveryNote: z.string().trim().min(1).max(100),
  lines: z
    .array(GrLineInputSchema)
    .min(1)
    .refine((ls) => new Set(ls.map((l) => l.poLineId)).size === ls.length, 'Duplicate PO line')
    .refine((ls) => ls.some((l) => l.receivedQuantity > 0), 'Nothing was received'),
});
export type PostGoodsReceipt = z.infer<typeof PostGoodsReceiptSchema>;
export type PostGoodsReceiptInput = z.input<typeof PostGoodsReceiptSchema>;

export const GoodsReceiptQuerySchema = z.object({ poId: z.uuid().optional() });

export const GoodsReceiptSchema = z.object({
  id: z.uuid(),
  number: z.string(),
  po: z.object({ id: z.uuid(), number: z.string() }),
  supplier: z.object({ id: z.uuid(), name: z.string() }),
  receivedBy: z.object({ id: z.uuid(), fullName: z.string() }),
  receivedAt: z.iso.datetime(),
  deliveryNote: z.string(),
  lines: z.array(
    z.object({
      id: z.uuid(),
      poLineId: z.uuid(),
      lineNo: z.number().int(),
      sku: z.string(),
      description: z.string(),
      uom: UomSchema,
      receivedQuantity: z.number(),
      rejectedQuantity: z.number(),
      acceptedQuantity: z.number(),
      rejectionReason: z.string().nullable(),
    }),
  ),
});
export type GoodsReceipt = z.infer<typeof GoodsReceiptSchema>;
export const GoodsReceiptListSchema = z.array(GoodsReceiptSchema);
