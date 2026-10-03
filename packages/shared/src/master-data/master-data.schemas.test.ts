import { describe, expect, it } from 'vitest';
import { CreateItemSchema, CreateSupplierSchema, UpdateItemSchema } from './master-data.schemas';

describe('master data schemas', () => {
  it('normalizes codes and country to upper case', () => {
    const s = CreateSupplierSchema.parse({
      code: ' sup-01 ',
      name: 'Acme',
      countryCode: 'de',
      email: 'sales@acme.example',
    });
    expect(s).toMatchObject({ code: 'SUP-01', countryCode: 'DE' });
  });

  it('rejects malformed codes and negative prices', () => {
    const r = CreateItemSchema.safeParse({
      sku: 'a b',
      description: 'x',
      uom: 'EA',
      category: 'c',
      standardPriceCents: -1,
    });
    expect(r.success).toBe(false);
    expect(r.error?.issues.map((i) => i.path[0])).toEqual(['sku', 'standardPriceCents']);
  });

  it('does not allow changing an item unit of measure', () => {
    // Changing the UoM would silently reinterpret every historical quantity.
    expect(UpdateItemSchema.parse({ uom: 'KG' })).not.toHaveProperty('uom');
  });
});
