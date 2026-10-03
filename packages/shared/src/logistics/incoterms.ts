import { z } from 'zod';

/**
 * Incoterms® 2020 — ICC rules that define where risk passes from seller to buyer and who
 * pays which leg of the journey. They say nothing about ownership or payment terms.
 * (Rule names are ICC's; descriptions here are a teaching summary, not the official text.)
 */
export const INCOTERMS = [
  'EXW',
  'FCA',
  'CPT',
  'CIP',
  'DAP',
  'DPU',
  'DDP',
  'FAS',
  'FOB',
  'CFR',
  'CIF',
] as const;
export const IncotermSchema = z.enum(INCOTERMS);
export type Incoterm = z.infer<typeof IncotermSchema>;

export interface IncotermRule {
  code: Incoterm;
  name: string;
  /** E = buyer collects, F = buyer pays main carriage, C = seller pays it, D = seller delivers. */
  group: 'E' | 'F' | 'C' | 'D';
  /** Sea-only rules need a port/ship; "any" works for containers and multimodal. */
  mode: 'ANY' | 'SEA';
  /** Where risk of loss/damage passes to the buyer. */
  riskTransfer: string;
  /** Cost items borne by the SELLER (everything else is the buyer's). */
  sellerPays: {
    exportClearance: boolean;
    mainCarriage: boolean;
    /** Contractual duty to insure for the buyer's benefit (only CIP, CIF). */
    insurance: boolean;
    unloadingAtDestination: boolean;
    importClearanceAndDuties: boolean;
  };
  note: string;
}

const pays = (
  exportClearance: boolean,
  mainCarriage: boolean,
  insurance: boolean,
  unloadingAtDestination: boolean,
  importClearanceAndDuties: boolean,
) => ({
  exportClearance,
  mainCarriage,
  insurance,
  unloadingAtDestination,
  importClearanceAndDuties,
});

export const INCOTERM_RULES: Readonly<Record<Incoterm, IncotermRule>> = {
  EXW: {
    code: 'EXW',
    name: 'Ex Works',
    group: 'E',
    mode: 'ANY',
    riskTransfer: "Goods made available at the seller's premises, not loaded",
    sellerPays: pays(false, false, false, false, false),
    note: 'Maximum buyer burden — the buyer even handles export clearance in the seller’s country, which is often impractical. FCA is usually the better choice.',
  },
  FCA: {
    code: 'FCA',
    name: 'Free Carrier',
    group: 'F',
    mode: 'ANY',
    riskTransfer: 'Handed to the carrier nominated by the buyer (at seller premises: loaded)',
    sellerPays: pays(true, false, false, false, false),
    note: 'The workhorse for containerised and road freight; the container-friendly replacement for FOB.',
  },
  CPT: {
    code: 'CPT',
    name: 'Carriage Paid To',
    group: 'C',
    mode: 'ANY',
    riskTransfer: 'Handed to the first carrier — even though the seller pays carriage onwards',
    sellerPays: pays(true, true, false, false, false),
    note: 'C-terms split risk and cost: the buyer carries transit risk on a journey the seller paid for, so the buyer should insure.',
  },
  CIP: {
    code: 'CIP',
    name: 'Carriage and Insurance Paid To',
    group: 'C',
    mode: 'ANY',
    riskTransfer: 'Handed to the first carrier',
    sellerPays: pays(true, true, true, false, false),
    note: 'Like CPT plus seller-bought insurance; 2020 raised the minimum to all-risks cover (ICC A, 110 %).',
  },
  DAP: {
    code: 'DAP',
    name: 'Delivered At Place',
    group: 'D',
    mode: 'ANY',
    riskTransfer: 'Ready for unloading at the named destination',
    sellerPays: pays(true, true, false, false, false),
    note: 'Seller bears transit risk (and usually insures for its own sake); buyer unloads and clears import.',
  },
  DPU: {
    code: 'DPU',
    name: 'Delivered at Place Unloaded',
    group: 'D',
    mode: 'ANY',
    riskTransfer: 'Unloaded at the named destination',
    sellerPays: pays(true, true, false, true, false),
    note: 'The only rule where the seller unloads (replaced DAT in 2020).',
  },
  DDP: {
    code: 'DDP',
    name: 'Delivered Duty Paid',
    group: 'D',
    mode: 'ANY',
    riskTransfer: 'Ready for unloading at destination, import-cleared',
    sellerPays: pays(true, true, false, false, true),
    note: 'Maximum seller burden incl. import VAT/duties in the buyer’s country — the seller needs a local tax presence.',
  },
  FAS: {
    code: 'FAS',
    name: 'Free Alongside Ship',
    group: 'F',
    mode: 'SEA',
    riskTransfer: 'Placed alongside the vessel at the port of shipment',
    sellerPays: pays(true, false, false, false, false),
    note: 'Bulk/breakbulk cargo (grain, steel coils), not containers.',
  },
  FOB: {
    code: 'FOB',
    name: 'Free On Board',
    group: 'F',
    mode: 'SEA',
    riskTransfer: 'On board the vessel at the port of shipment',
    sellerPays: pays(true, false, false, false, false),
    note: 'Classic but misused for containers (handed over at a terminal, not on board) — use FCA there.',
  },
  CFR: {
    code: 'CFR',
    name: 'Cost and Freight',
    group: 'C',
    mode: 'SEA',
    riskTransfer: 'On board the vessel at the port of shipment',
    sellerPays: pays(true, true, false, false, false),
    note: 'Seller pays ocean freight; buyer has the transit risk from loading.',
  },
  CIF: {
    code: 'CIF',
    name: 'Cost, Insurance and Freight',
    group: 'C',
    mode: 'SEA',
    riskTransfer: 'On board the vessel at the port of shipment',
    sellerPays: pays(true, true, true, false, false),
    note: 'CFR plus seller-bought insurance at the minimum ICC C cover (CIP requires more).',
  },
};

/** EU member states (customs union): no import duty between them. */
export const EU_COUNTRIES = [
  'AT',
  'BE',
  'BG',
  'HR',
  'CY',
  'CZ',
  'DK',
  'EE',
  'FI',
  'FR',
  'DE',
  'GR',
  'HU',
  'IE',
  'IT',
  'LV',
  'LT',
  'LU',
  'MT',
  'NL',
  'PL',
  'PT',
  'RO',
  'SK',
  'SI',
  'ES',
  'SE',
] as const;

export const isEuCountry = (countryCode: string): boolean =>
  (EU_COUNTRIES as readonly string[]).includes(countryCode.toUpperCase());
