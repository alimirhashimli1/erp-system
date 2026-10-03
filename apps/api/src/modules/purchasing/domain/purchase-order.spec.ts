import { DomainError } from '../../../common/domain-error';
import {
  type AwardedLine,
  assertCanCancel,
  assertCanIssue,
  expectedDeliveryDate,
  planPurchaseOrders,
  type PoLine,
  type PurchaseOrder,
  statusAfterReceipt,
} from './purchase-order';

const codeOf = (fn: () => unknown) => {
  try {
    fn();
    return undefined;
  } catch (e) {
    return e instanceof DomainError ? e.code : 'NOT_A_DOMAIN_ERROR';
  }
};

const awarded = (overrides: Partial<AwardedLine>): AwardedLine => ({
  prLineId: 'pl',
  sourcingStatus: 'AWARDED',
  itemId: 'i',
  description: 'Bolt',
  uom: 'EA',
  quantity: 1000,
  bidLineId: 'bl',
  unitPriceCents: 12,
  supplierId: 'de',
  incoterm: 'DAP',
  leadTimeDays: 10,
  ...overrides,
});

const line = (overrides: Partial<PoLine> = {}): PoLine => ({
  id: 'l1',
  lineNo: 1,
  prLineId: 'pl1',
  prNumber: 'PR-000001',
  approvedUnitPriceCents: 100,
  rfxBidLineId: 'bl1',
  itemId: 'i1',
  sku: 'X',
  description: 'X',
  uom: 'EA',
  quantity: 10,
  unitPriceCents: 100,
  lineTotalCents: 1000,
  receivedQuantity: 0,
  invoicedQuantity: 0,
  ...overrides,
});

const po = (overrides: Partial<PurchaseOrder> = {}): PurchaseOrder => ({
  id: 'po',
  number: 'PO-000001',
  status: 'DRAFT',
  supplier: { id: 'de', code: 'DE', name: 'DE', countryCode: 'DE' },
  buyerId: 'bea',
  buyerName: 'Bea',
  rfxId: 'rfx',
  rfxNumber: 'RFX-000001',
  incoterm: 'DAP',
  namedPlace: 'Hamburg',
  leadTimeDays: 10,
  totalCents: 1000,
  expectedDeliveryDate: null,
  issuedAt: null,
  acknowledgedAt: null,
  closedAt: null,
  cancelReason: null,
  version: 1,
  createdAt: new Date(),
  lines: [line()],
  requesterIds: ['rita'],
  ...overrides,
});

describe('planPurchaseOrders', () => {
  it('creates one PO per winning supplier and prices lines in exact cents', () => {
    const drafts = planPurchaseOrders([
      awarded({ prLineId: 'a', supplierId: 'de', quantity: 2.5, unitPriceCents: 333 }),
      awarded({ prLineId: 'b', supplierId: 'cn', incoterm: 'FOB', leadTimeDays: 45 }),
      awarded({ prLineId: 'c', supplierId: 'de' }),
    ]);
    expect(drafts.map((d) => [d.supplierId, d.lines.map((l) => l.prLineId), d.totalCents])).toEqual(
      [
        ['de', ['a', 'c'], 833 + 12_000], // 2.5 × 3.33 = 8.325 → 8.33
        ['cn', ['b'], 12_000],
      ],
    );
    expect(drafts[1]).toMatchObject({ incoterm: 'FOB', leadTimeDays: 45 });
  });

  it('skips lines already ordered and refuses when nothing is left', () => {
    expect(
      planPurchaseOrders([awarded({}), awarded({ prLineId: 'x', sourcingStatus: 'ORDERED' })]),
    ).toHaveLength(1);
    expect(codeOf(() => planPurchaseOrders([awarded({ sourcingStatus: 'ORDERED' })]))).toBe(
      'PO_NOTHING_TO_ORDER',
    );
  });
});

describe('issuing', () => {
  it('lets a different buyer issue within budget', () => {
    expect(
      codeOf(() => {
        assertCanIssue(po(), 'bea');
      }),
    ).toBeUndefined();
  });

  it('blocks the requester from issuing their own goods (SoD)', () => {
    expect(
      codeOf(() => {
        assertCanIssue(po(), 'rita');
      }),
    ).toBe('PO_SOD_REQUESTER_ISSUER');
  });

  it('allows up to 10 % over the approved estimate, not more', () => {
    expect(
      codeOf(() => {
        assertCanIssue(po({ totalCents: 1100 }), 'bea');
      }),
    ).toBeUndefined();
    expect(
      codeOf(() => {
        assertCanIssue(po({ totalCents: 1101 }), 'bea');
      }),
    ).toBe('PO_EXCEEDS_APPROVED_BUDGET');
  });

  it('only issues drafts', () => {
    expect(
      codeOf(() => {
        assertCanIssue(po({ status: 'ISSUED' }), 'bea');
      }),
    ).toBe('INVALID_TRANSITION');
  });

  it('derives the expected delivery date from the lead time', () => {
    expect(expectedDeliveryDate('2026-12-28', 10)).toBe('2027-01-07');
  });
});

describe('cancel and receipt status', () => {
  it('cannot cancel once goods arrived', () => {
    const received = po({ status: 'ISSUED', lines: [line({ receivedQuantity: 1 })] });
    expect(
      codeOf(() => {
        assertCanCancel(received);
      }),
    ).toBe('PO_HAS_RECEIPTS');
    expect(
      codeOf(() => {
        assertCanCancel(po({ status: 'ISSUED' }));
      }),
    ).toBeUndefined();
  });

  it('is fully received only when every line is complete', () => {
    expect(
      statusAfterReceipt([
        { quantity: 10, receivedQuantity: 10 },
        { quantity: 2.5, receivedQuantity: 2.5 },
      ]),
    ).toBe('RECEIVED');
    expect(
      statusAfterReceipt([
        { quantity: 10, receivedQuantity: 10 },
        { quantity: 2.5, receivedQuantity: 2.499 },
      ]),
    ).toBe('PARTIALLY_RECEIVED');
  });
});
