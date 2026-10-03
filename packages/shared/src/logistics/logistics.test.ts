import { describe, expect, it } from 'vitest';
import { compareFreightModes, estimateFreight } from './freight';
import { INCOTERM_RULES, INCOTERMS, isEuCountry } from './incoterms';
import { landedCost } from './landed-cost';

const extras = {
  originChargesCents: 20_000, // €200 export handling
  freightCents: 150_000, // €1,500 ocean freight
  insuranceCents: 10_000, // €100
  dutyRateBps: 400, // 4 %
  destinationHandlingCents: 30_000, // €300
};

describe('Incoterms 2020 table', () => {
  it('covers all 11 rules, 4 of them sea-only', () => {
    expect(INCOTERMS).toHaveLength(11);
    expect(INCOTERMS.filter((c) => INCOTERM_RULES[c].mode === 'SEA')).toEqual([
      'FAS',
      'FOB',
      'CFR',
      'CIF',
    ]);
  });

  it('only CIP and CIF oblige the seller to insure; only DDP clears import', () => {
    expect(INCOTERMS.filter((c) => INCOTERM_RULES[c].sellerPays.insurance)).toEqual(['CIP', 'CIF']);
    expect(INCOTERMS.filter((c) => INCOTERM_RULES[c].sellerPays.importClearanceAndDuties)).toEqual([
      'DDP',
    ]);
  });

  it('knows the EU customs union', () => {
    expect(isEuCountry('pl')).toBe(true);
    expect(isEuCountry('CN')).toBe(false);
  });
});

describe('landedCost', () => {
  it('FOB: buyer adds freight, insurance and duty on the CIF customs value', () => {
    const r = landedCost({ incoterm: 'FOB', goodsCents: 1_000_000, ...extras });
    expect(r.customsValueCents).toBe(1_160_000); // goods + freight + insurance
    expect(r.dutyCents).toBe(46_400); // 4 % of €11,600
    expect(r.totalCents).toBe(1_000_000 + 150_000 + 10_000 + 46_400 + 30_000);
    expect(r.originChargesCents).toBe(0); // FOB: seller loads and clears export
  });

  it('CIF: freight and insurance are inside the price, not added again', () => {
    const r = landedCost({ incoterm: 'CIF', goodsCents: 1_160_000, ...extras });
    expect(r).toMatchObject({ freightCents: 0, insuranceCents: 0, dutyCents: 46_400 });
    expect(r.includedInPrice).toEqual(['originCharges', 'freight', 'insurance']);
  });

  it('EXW: buyer also pays origin charges', () => {
    const r = landedCost({ incoterm: 'EXW', goodsCents: 1_000_000, ...extras });
    expect(r.originChargesCents).toBe(20_000);
    expect(r.customsValueCents).toBe(1_180_000);
  });

  it('DDP: the seller pays everything up to unloading', () => {
    const r = landedCost({ incoterm: 'DDP', goodsCents: 1_300_000, ...extras });
    expect(r).toMatchObject({ freightCents: 0, insuranceCents: 0, dutyCents: 0 });
    expect(r.totalCents).toBe(1_300_000 + 30_000); // buyer still unloads
  });

  it('DPU: the seller unloads; DAP: the buyer does', () => {
    expect(
      landedCost({ incoterm: 'DPU', goodsCents: 100, ...extras }).destinationHandlingCents,
    ).toBe(0);
    expect(
      landedCost({ incoterm: 'DAP', goodsCents: 100, ...extras }).destinationHandlingCents,
    ).toBe(30_000);
  });

  it('shows why unit price misleads: the cheaper FOB quote can land dearer than CIF', () => {
    const fob = landedCost({ incoterm: 'FOB', goodsCents: 1_000_000, ...extras });
    const cif = landedCost({ incoterm: 'CIF', goodsCents: 1_120_000, ...extras });
    expect(cif.totalCents).toBeLessThan(fob.totalCents);
  });
});

describe('freight modes', () => {
  const shipment = { weightKg: 2000, volumeM3: 4, distanceKm: 9000 };

  it('bills light, bulky air cargo by volume', () => {
    const air = estimateFreight('AIR', shipment);
    expect(air.chargeableKg).toBe(2000); // 4 m³ × 167 = 668 kg < 2000 kg actual
    expect(estimateFreight('AIR', { ...shipment, volumeM3: 20 }).chargeableKg).toBe(3340);
  });

  it('trades cost and speed against CO₂', () => {
    const [sea, , , air] = compareFreightModes(shipment);
    expect(sea!.costCents).toBeLessThan(air!.costCents);
    expect(sea!.transitDays).toBeGreaterThan(air!.transitDays);
    expect(air!.co2Kg / sea!.co2Kg).toBe(60); // 600 vs 10 g/tkm
  });
});
