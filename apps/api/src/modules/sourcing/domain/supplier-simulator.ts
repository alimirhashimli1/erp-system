import { isEuCountry, type SubmitBid } from '@procurestack/shared';

/*
 * DEMO ONLY (RFX_SIMULATE_SUPPLIERS): fabricates plausible supplier bids so a single
 * learner can click through sourcing. Deterministic per (event, supplier) so a retried
 * job produces the same bid. The shapes teach a pattern: EU suppliers quote delivered
 * (DAP, freight in price, no duty), Asian suppliers quote FOB (cheaper goods, but buyer
 * pays ocean freight, insurance and duty), US suppliers quote FCA with air freight.
 */

export interface SimulationInput {
  rfxId: string;
  supplierId: string;
  countryCode: string;
  today: string;
  lines: { rfxLineId: string; quantity: number; standardPriceCents: number }[];
}

/** mulberry32 seeded from a string: tiny, fast, good enough for demo data. */
function seededRandom(seed: string): () => number {
  let h = 1779033703;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
  return () => {
    h = (h + 0x6d2b79f5) | 0;
    let t = Math.imul(h ^ (h >>> 15), 1 | h);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const addDays = (isoDate: string, days: number) =>
  new Date(Date.parse(`${isoDate}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);

interface Profile {
  incoterm: SubmitBid['incoterm'];
  priceFactor: [number, number];
  leadDays: [number, number];
  /** Share of goods value for buyer-paid freight / insurance. */
  freightShare: number;
  insuranceShare: number;
  dutyBps: number;
  handlingCents: number;
}

const profileFor = (country: string): Profile => {
  if (isEuCountry(country)) {
    return {
      incoterm: 'DAP',
      priceFactor: [0.95, 1.15],
      leadDays: [5, 15],
      freightShare: 0,
      insuranceShare: 0,
      dutyBps: 0,
      handlingCents: 5_000,
    };
  }
  if (country === 'US') {
    return {
      incoterm: 'FCA',
      priceFactor: [0.9, 1.1],
      leadDays: [7, 14],
      freightShare: 0.12,
      insuranceShare: 0.004,
      dutyBps: 200,
      handlingCents: 15_000,
    };
  }
  // Default: overseas sea freight (CN, IN, …)
  return {
    incoterm: 'FOB',
    priceFactor: [0.7, 0.9],
    leadDays: [35, 60],
    freightShare: 0.08,
    insuranceShare: 0.005,
    dutyBps: 450,
    handlingCents: 25_000,
  };
};

/** Returns a bid, or `null` when this supplier declines (about 1 in 10). */
export function simulateBid(input: SimulationInput): SubmitBid | null {
  const rnd = seededRandom(`${input.rfxId}|${input.supplierId}`);
  if (rnd() < 0.1) return null;

  const p = profileFor(input.countryCode);
  const between = ([lo, hi]: [number, number]) => lo + rnd() * (hi - lo);
  const lines = input.lines.map((l) => ({
    rfxLineId: l.rfxLineId,
    unitPriceCents: Math.max(1, Math.round(l.standardPriceCents * between(p.priceFactor))),
  }));
  const goods = lines.reduce(
    (sum, l, i) => sum + l.unitPriceCents * (input.lines[i]?.quantity ?? 0),
    0,
  );

  return {
    supplierId: input.supplierId,
    incoterm: p.incoterm,
    leadTimeDays: Math.round(between(p.leadDays)),
    validUntil: addDays(input.today, 30),
    originChargesCents: 0,
    freightCents: Math.round(goods * p.freightShare),
    insuranceCents: Math.round(goods * p.insuranceShare),
    destinationHandlingCents: p.handlingCents,
    dutyRateBps: p.dutyBps,
    lines,
  };
}
