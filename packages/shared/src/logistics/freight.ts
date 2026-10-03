import { z } from 'zod';

/**
 * Freight modes compared on the three axes procurement trades off: cost, lead time and
 * CO₂e. Figures are ILLUSTRATIVE averages for teaching (order of magnitude in line with
 * GLEC-framework defaults), not quotes — real rates swing with lane, season and capacity.
 */
export const FREIGHT_MODES = ['SEA', 'RAIL', 'ROAD', 'AIR'] as const;
export const FreightModeSchema = z.enum(FREIGHT_MODES);
export type FreightMode = z.infer<typeof FreightModeSchema>;

export interface FreightModeProfile {
  mode: FreightMode;
  label: string;
  /** Cost per chargeable tonne-km, in hundredths of a cent (0.0001 €). */
  costPerTkm: number;
  /** Fixed cost per shipment (booking, terminal handling at both ends), cents. */
  fixedCents: number;
  /** Average door-to-door speed while moving, km per day. */
  kmPerDay: number;
  /** Days spent in terminals, customs, consolidation. */
  handlingDays: number;
  /** Grams CO₂e per tonne-km (well-to-wheel). */
  co2GramsPerTkm: number;
  /**
   * Volumetric conversion, kg per m³: carriers bill max(actual, volume × factor) — light,
   * bulky goods pay for the space they take (air 1:6000 cm³/kg ≈ 167 kg/m³).
   */
  volumetricKgPerM3: number;
}

export const FREIGHT_PROFILES: Readonly<Record<FreightMode, FreightModeProfile>> = {
  SEA: {
    mode: 'SEA',
    label: 'Ocean (container)',
    costPerTkm: 20,
    fixedCents: 60_000,
    kmPerDay: 650,
    handlingDays: 8,
    co2GramsPerTkm: 10,
    volumetricKgPerM3: 1000,
  },
  RAIL: {
    mode: 'RAIL',
    label: 'Rail',
    costPerTkm: 400,
    fixedCents: 35_000,
    kmPerDay: 450,
    handlingDays: 4,
    co2GramsPerTkm: 22,
    volumetricKgPerM3: 333,
  },
  ROAD: {
    mode: 'ROAD',
    label: 'Road (truck)',
    costPerTkm: 900,
    fixedCents: 15_000,
    kmPerDay: 650,
    handlingDays: 1,
    co2GramsPerTkm: 80,
    volumetricKgPerM3: 333,
  },
  AIR: {
    mode: 'AIR',
    label: 'Air freight',
    costPerTkm: 6000,
    fixedCents: 25_000,
    kmPerDay: 8000,
    handlingDays: 2,
    co2GramsPerTkm: 600,
    volumetricKgPerM3: 167,
  },
};

export const ShipmentSchema = z.object({
  weightKg: z.number().positive().max(10_000_000),
  volumeM3: z.number().min(0).max(100_000).default(0),
  distanceKm: z.number().positive().max(40_000),
});
export type Shipment = z.input<typeof ShipmentSchema>;

export interface FreightEstimate {
  mode: FreightMode;
  chargeableKg: number;
  costCents: number;
  transitDays: number;
  co2Kg: number;
}

export function estimateFreight(mode: FreightMode, shipment: Shipment): FreightEstimate {
  const s = ShipmentSchema.parse(shipment);
  const p = FREIGHT_PROFILES[mode];
  const chargeableKg = Math.max(s.weightKg, s.volumeM3 * p.volumetricKgPerM3);
  const tonneKm = (chargeableKg / 1000) * s.distanceKm;
  return {
    mode,
    chargeableKg: Math.round(chargeableKg),
    costCents: p.fixedCents + Math.round((tonneKm * p.costPerTkm) / 100),
    transitDays: Math.ceil(s.distanceKm / p.kmPerDay) + p.handlingDays,
    // Emissions follow the real weight moved, not the billing weight.
    co2Kg: Math.round(((s.weightKg / 1000) * s.distanceKm * p.co2GramsPerTkm) / 1000),
  };
}

export const compareFreightModes = (shipment: Shipment): FreightEstimate[] =>
  FREIGHT_MODES.map((m) => estimateFreight(m, shipment));
