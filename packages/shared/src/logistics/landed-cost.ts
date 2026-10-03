import { z } from 'zod';
import { applyBps, CentsSchema } from '../common/money';
import { INCOTERM_RULES, type Incoterm, IncotermSchema } from './incoterms';

/*
 * Landed cost = everything the BUYER pays to get goods onto its own floor:
 *   goods + origin charges + main carriage + insurance + import duty + destination handling.
 * Which of those the buyer pays depends on the Incoterm — under CIF the freight is
 * already inside the supplier's price, under FOB it is a separate bill. Comparing two
 * quotes on unit price alone ignores exactly that, which is why sourcing compares
 * landed cost.
 */

export const LandedCostInputSchema = z.object({
  incoterm: IncotermSchema,
  /** Supplier's price × quantity, as quoted under that Incoterm. */
  goodsCents: CentsSchema,
  /** Export packing/clearance/loading at origin (buyer pays only under EXW). */
  originChargesCents: CentsSchema.default(0),
  /** Main-carriage cost if the buyer has to buy it (E/F terms). */
  freightCents: CentsSchema.default(0),
  /** Cargo insurance if the buyer has to buy it. */
  insuranceCents: CentsSchema.default(0),
  /** Import duty rate in basis points (250 = 2.5 %). Zero for intra-EU supplies. */
  dutyRateBps: z.number().int().min(0).max(100_000).default(0),
  /** Unloading + terminal handling + customs brokerage at destination. */
  destinationHandlingCents: CentsSchema.default(0),
});
export type LandedCostInput = z.input<typeof LandedCostInputSchema>;

export interface LandedCostBreakdown {
  incoterm: Incoterm;
  goodsCents: number;
  originChargesCents: number;
  freightCents: number;
  insuranceCents: number;
  /** Basis for duty: EU customs value is CIF at the EU border (goods + freight + insurance). */
  customsValueCents: number;
  dutyCents: number;
  destinationHandlingCents: number;
  totalCents: number;
  /** Which components are already inside the supplier's price under this rule. */
  includedInPrice: ('originCharges' | 'freight' | 'insurance' | 'duty' | 'unloading')[];
}

export function landedCost(input: LandedCostInput): LandedCostBreakdown {
  const i = LandedCostInputSchema.parse(input);
  const seller = INCOTERM_RULES[i.incoterm].sellerPays;
  const buyerPaysOrigin = INCOTERM_RULES[i.incoterm].group === 'E';
  // Under D-terms the seller bears transit risk, so the buyer has nothing to insure.
  const buyerInsures = !seller.insurance && INCOTERM_RULES[i.incoterm].group !== 'D';

  const originChargesCents = buyerPaysOrigin ? i.originChargesCents : 0;
  const freightCents = seller.mainCarriage ? 0 : i.freightCents;
  const insuranceCents = buyerInsures ? i.insuranceCents : 0;
  // Freight/insurance bought by the seller are already inside goodsCents.
  const customsValueCents = i.goodsCents + originChargesCents + freightCents + insuranceCents;
  const dutyCents = seller.importClearanceAndDuties
    ? 0
    : applyBps(customsValueCents, i.dutyRateBps);
  const destinationHandlingCents = seller.unloadingAtDestination ? 0 : i.destinationHandlingCents;

  const includedInPrice: LandedCostBreakdown['includedInPrice'] = [];
  if (!buyerPaysOrigin) includedInPrice.push('originCharges');
  if (seller.mainCarriage) includedInPrice.push('freight');
  if (seller.insurance) includedInPrice.push('insurance');
  if (seller.importClearanceAndDuties) includedInPrice.push('duty');
  if (seller.unloadingAtDestination) includedInPrice.push('unloading');

  return {
    incoterm: i.incoterm,
    goodsCents: i.goodsCents,
    originChargesCents,
    freightCents,
    insuranceCents,
    customsValueCents,
    dutyCents,
    destinationHandlingCents,
    totalCents:
      i.goodsCents +
      originChargesCents +
      freightCents +
      insuranceCents +
      dutyCents +
      destinationHandlingCents,
    includedInPrice,
  };
}
