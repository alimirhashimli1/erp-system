import type { SubmitBid } from '@procurestack/shared';
import { DomainError } from '../../../common/domain-error';
import {
  assertCanBid,
  assertCanPublish,
  type Bid,
  decideAward,
  evaluate,
  isSealed,
  type RfxEvent,
} from './rfx';
import { simulateBid } from './supplier-simulator';

const NOW = new Date('2026-10-01T12:00:00Z');
const TODAY = '2026-10-01';

const DE = { id: 's-de', code: 'SUP-DE', name: 'Rhein GmbH', countryCode: 'DE' };
const CN = { id: 's-cn', code: 'SUP-CN', name: 'Shenzhen Co', countryCode: 'CN' };

const rfx = (overrides: Partial<RfxEvent> = {}): RfxEvent => ({
  id: 'rfx-1',
  number: 'RFX-000001',
  type: 'RFQ',
  title: 'Bolts',
  status: 'PUBLISHED',
  buyerId: 'bea',
  buyerName: 'Bea',
  responseDeadline: new Date('2026-10-08T12:00:00Z'),
  publishedAt: NOW,
  closedAt: null,
  evaluatedAt: null,
  awardedAt: null,
  awardJustification: null,
  version: 2,
  createdAt: NOW,
  lines: [
    {
      id: 'l1',
      lineNo: 1,
      prLineId: 'pl1',
      prNumber: 'PR-000001',
      itemId: 'i1',
      sku: 'BOLT',
      description: 'Bolt',
      uom: 'EA',
      quantity: 10_000,
      awardedBidLineId: null,
    },
  ],
  invitations: [
    { supplier: DE, status: 'INVITED', respondedAt: null },
    { supplier: CN, status: 'INVITED', respondedAt: null },
  ],
  bids: [],
  ...overrides,
});

const bid = (supplier: typeof DE, overrides: Partial<Bid> = {}): Bid => ({
  id: `bid-${supplier.id}`,
  supplier,
  incoterm: 'DAP',
  leadTimeDays: 10,
  validUntil: '2026-12-31',
  originChargesCents: 0,
  freightCents: 0,
  insuranceCents: 0,
  destinationHandlingCents: 0,
  dutyRateBps: 0,
  source: 'MANUAL',
  submittedAt: NOW,
  lines: [{ id: `bl-${supplier.id}`, rfxLineId: 'l1', unitPriceCents: 12 }],
  ...overrides,
});

const submit = (overrides: Partial<SubmitBid> = {}): SubmitBid => ({
  supplierId: DE.id,
  incoterm: 'DAP',
  leadTimeDays: 10,
  validUntil: '2026-12-31',
  originChargesCents: 0,
  freightCents: 0,
  insuranceCents: 0,
  destinationHandlingCents: 0,
  dutyRateBps: 0,
  lines: [{ rfxLineId: 'l1', unitPriceCents: 12 }],
  ...overrides,
});

const codeOf = (fn: () => unknown) => {
  try {
    fn();
    return undefined;
  } catch (e) {
    return e instanceof DomainError ? e.code : 'NOT_A_DOMAIN_ERROR';
  }
};

describe('publishing', () => {
  it('needs competition: two suppliers for an RFQ, one is enough for an RFI', () => {
    const one = rfx({ status: 'DRAFT', invitations: [rfx().invitations[0]!] });
    expect(
      codeOf(() => {
        assertCanPublish(one, NOW);
      }),
    ).toBe('RFX_TOO_FEW_SUPPLIERS');
    expect(
      codeOf(() => {
        assertCanPublish({ ...one, type: 'RFI' }, NOW);
      }),
    ).toBeUndefined();
  });

  it('needs a deadline in the future', () => {
    const past = rfx({ status: 'DRAFT', responseDeadline: new Date('2026-09-30T00:00:00Z') });
    expect(
      codeOf(() => {
        assertCanPublish(past, NOW);
      }),
    ).toBe('RFX_DEADLINE_PASSED');
  });
});

describe('bidding', () => {
  it('accepts bids from invited suppliers while published and before the deadline', () => {
    expect(
      codeOf(() => {
        assertCanBid(rfx(), submit(), NOW);
      }),
    ).toBeUndefined();
  });

  it.each([
    ['late bid', rfx(), submit(), new Date('2026-10-09T00:00:00Z'), 'RFX_LATE_BID'],
    ['uninvited', rfx(), submit({ supplierId: 'stranger' }), NOW, 'RFX_SUPPLIER_NOT_INVITED'],
    ['RFI', rfx({ type: 'RFI' }), submit(), NOW, 'RFX_RFI_NO_PRICES'],
    ['closed', rfx({ status: 'CLOSED' }), submit(), NOW, 'RFX_NOT_OPEN'],
    [
      'foreign line',
      rfx(),
      submit({ lines: [{ rfxLineId: 'other', unitPriceCents: 1 }] }),
      NOW,
      'RFX_UNKNOWN_LINE',
    ],
  ])('rejects a %s', (_, event, input, now, code) => {
    expect(
      codeOf(() => {
        assertCanBid(event, input, now);
      }),
    ).toBe(code);
  });

  it('keeps bids sealed until the event closes', () => {
    expect(isSealed(rfx())).toBe(true);
    expect(isSealed(rfx({ status: 'CLOSED' }))).toBe(false);
  });
});

describe('evaluation on landed cost', () => {
  // DE: 10,000 × €0.12 delivered (DAP) = €1,200, nothing extra, no duty (EU).
  // CN: 10,000 × €0.09 FOB = €900 + €150 freight + €5 insurance + 4.5 % duty on €1,055
  //     (€47.48) + €250 handling = €1,352.48 → cheaper unit price, dearer landed.
  const evaluated = rfx({
    status: 'CLOSED',
    bids: [
      bid(DE),
      bid(CN, {
        incoterm: 'FOB',
        leadTimeDays: 45,
        freightCents: 15_000,
        insuranceCents: 500,
        dutyRateBps: 450,
        destinationHandlingCents: 25_000,
        lines: [{ id: 'bl-s-cn', rfxLineId: 'l1', unitPriceCents: 9 }],
      }),
    ],
  });

  it('ranks the delivered EU bid first although its unit price is higher', () => {
    const [line] = evaluate(evaluated, TODAY).lines;
    expect(line!.offers.map((o) => [o.supplier.code, o.landedCents, o.rank])).toEqual([
      ['SUP-DE', 120_000, 1],
      ['SUP-CN', 135_248, 2],
    ]);
    expect(line!.offers[1]).toMatchObject({ goodsCents: 90_000, extrasCents: 45_248 });
    expect(line!.offers[0]!.landedPerUnitCents).toBe(12);
  });

  it('ignores a quoted duty for EU suppliers (customs union)', () => {
    const withDuty = rfx({ status: 'CLOSED', bids: [bid(DE, { dutyRateBps: 1_000 })] });
    expect(evaluate(withDuty, TODAY).lines[0]!.offers[0]!.landedCents).toBe(120_000);
  });

  it('requires a justification to award to a non-best offer', () => {
    const e = { ...evaluated, status: 'EVALUATED' as const };
    const toCn = { awards: [{ rfxLineId: 'l1', bidLineId: 'bl-s-cn' }] };
    expect(codeOf(() => decideAward(e, toCn, TODAY))).toBe('RFX_AWARD_JUSTIFICATION_REQUIRED');
    const ok = decideAward(
      e,
      { ...toCn, justification: 'Dual-sourcing strategy for resilience' },
      TODAY,
    );
    expect(ok.deviations).toEqual([{ rfxLineId: 'l1', chosenRank: 2 }]);
    expect(
      decideAward(e, { awards: [{ rfxLineId: 'l1', bidLineId: 'bl-s-de' }] }, TODAY),
    ).toMatchObject({ deviations: [], awards: [{ prLineId: 'pl1' }] });
  });

  it('refuses to award expired bids and RFIs', () => {
    const e = rfx({ status: 'EVALUATED', bids: [bid(DE, { validUntil: '2026-09-30' })] });
    const award = { awards: [{ rfxLineId: 'l1', bidLineId: 'bl-s-de' }] };
    expect(codeOf(() => decideAward(e, award, TODAY))).toBe('RFX_BID_EXPIRED');
    expect(codeOf(() => decideAward({ ...e, type: 'RFI' }, award, TODAY))).toBe(
      'RFX_RFI_NOT_AWARDABLE',
    );
  });
});

describe('supplier simulator', () => {
  const input = {
    rfxId: 'rfx-1',
    supplierId: 's-cn',
    countryCode: 'CN',
    today: TODAY,
    lines: [{ rfxLineId: 'l1', quantity: 100, standardPriceCents: 1_000 }],
  };

  it('is deterministic per event and supplier (safe job retries)', () => {
    expect(simulateBid(input)).toEqual(simulateBid(input));
  });

  it('quotes FOB with buyer-paid freight from overseas, DAP from the EU', () => {
    const results = ['a', 'b', 'c', 'd', 'e'].map((s) => simulateBid({ ...input, supplierId: s }));
    const cn = results.find((r) => r !== null);
    expect(cn).toMatchObject({ incoterm: 'FOB', dutyRateBps: 450 });
    expect(cn!.freightCents).toBeGreaterThan(0);
    const eu = ['a', 'b', 'c', 'd', 'e']
      .map((s) => simulateBid({ ...input, supplierId: s, countryCode: 'PL' }))
      .find((r) => r !== null);
    expect(eu).toMatchObject({ incoterm: 'DAP', freightCents: 0, dutyRateBps: 0 });
  });
});
