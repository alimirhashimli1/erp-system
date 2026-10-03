import { z } from 'zod';
import { CentsSchema } from '../common/money';

/** Units of measure. Quantities on every document are expressed in the item's UoM. */
export const UOMS = ['EA', 'KG', 'M', 'L', 'BOX'] as const;
export const UomSchema = z.enum(UOMS);
export type Uom = z.infer<typeof UomSchema>;
export const UOM_LABELS: Record<Uom, string> = {
  EA: 'each',
  KG: 'kilogram',
  M: 'metre',
  L: 'litre',
  BOX: 'box',
};

const Code = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z0-9-]{2,20}$/, '2–20 characters: A–Z, 0–9 or "-"');
const Name = z.string().trim().min(1).max(200);
const CountryCode = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z]{2}$/, 'ISO 3166 alpha-2, e.g. DE');

// ---- Supplier ----
export const SupplierSchema = z.object({
  id: z.uuid(),
  code: z.string(),
  name: z.string(),
  countryCode: z.string(),
  email: z.string(),
  isActive: z.boolean(),
});
export type Supplier = z.infer<typeof SupplierSchema>;

export const CreateSupplierSchema = z.object({
  code: Code,
  name: Name,
  countryCode: CountryCode,
  email: z.email().max(254),
});
export type CreateSupplierInput = z.input<typeof CreateSupplierSchema>;
export const UpdateSupplierSchema = CreateSupplierSchema.omit({ code: true })
  .extend({ isActive: z.boolean() })
  .partial();
export type CreateSupplier = z.infer<typeof CreateSupplierSchema>;
export type UpdateSupplier = z.infer<typeof UpdateSupplierSchema>;

// ---- Item ----
export const ItemSchema = z.object({
  id: z.uuid(),
  sku: z.string(),
  description: z.string(),
  uom: UomSchema,
  category: z.string(),
  /** Reference price used to pre-fill requisition estimates. */
  standardPriceCents: CentsSchema,
  isActive: z.boolean(),
});
export type Item = z.infer<typeof ItemSchema>;

export const CreateItemSchema = z.object({
  sku: Code,
  description: Name,
  uom: UomSchema,
  category: z.string().trim().min(1).max(60),
  standardPriceCents: CentsSchema,
});
export type CreateItemInput = z.input<typeof CreateItemSchema>;
export const UpdateItemSchema = CreateItemSchema.omit({ sku: true, uom: true })
  .extend({ isActive: z.boolean() })
  .partial();
export type CreateItem = z.infer<typeof CreateItemSchema>;
export type UpdateItem = z.infer<typeof UpdateItemSchema>;

// ---- Cost center ----
export const CostCenterSchema = z.object({
  id: z.uuid(),
  code: z.string(),
  name: z.string(),
  isActive: z.boolean(),
});
export type CostCenter = z.infer<typeof CostCenterSchema>;

export const CreateCostCenterSchema = z.object({ code: Code, name: Name });
export type CreateCostCenterInput = z.input<typeof CreateCostCenterSchema>;
export const UpdateCostCenterSchema = CreateCostCenterSchema.omit({ code: true })
  .extend({ isActive: z.boolean() })
  .partial();
export type CreateCostCenter = z.infer<typeof CreateCostCenterSchema>;
export type UpdateCostCenter = z.infer<typeof UpdateCostCenterSchema>;

/** `?q=` searches code/name; inactive records are hidden unless asked for. */
export const MasterDataQuerySchema = z.object({
  q: z.string().trim().max(100).optional(),
  includeInactive: z.stringbool().optional(),
});
export type MasterDataQuery = z.infer<typeof MasterDataQuerySchema>;

export const SupplierListSchema = z.array(SupplierSchema);
export const ItemListSchema = z.array(ItemSchema);
export const CostCenterListSchema = z.array(CostCenterSchema);
