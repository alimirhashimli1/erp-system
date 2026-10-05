import type { PostGoodsReceipt } from '@procurestack/shared';
import { DomainError } from '../../../common/domain-error';
import type { PurchaseOrder } from '../../purchasing/domain/purchase-order';
import { checkReceipt } from './goods-receipt';

const po = (overrides: Partial<PurchaseOrder> = {}): PurchaseOrder => ({
  id: 'po',
  number: 'PO-000001',
  status: 'ISSUED',
  supplier: { id: 's', code: 'S', name: 'S', countryCode: 'DE' },
  buyerId: 'bea',
  buyerName: 'Bea',
  rfxId: 'r',
  rfxNumber: 'RFX-1',
  incoterm: 'DAP',
  namedPlace: 'Hamburg',
  leadTimeDays: 10,
  totalCents: 1000,
  expectedDeliveryDate: null,
  issuedAt: null,
  acknowledgedAt: null,
  closedAt: null,
  cancelReason: null,
  version: 2,
  createdAt: new Date(),
  requesterIds: [],
  lines: [
    {
      id: 'l1',
      lineNo: 1,
      prLineId: 'p',
      prNumber: 'PR-1',
      approvedUnitPriceCents: 100,
      rfxBidLineId: 'b',
      itemId: 'i',
      sku: 'STEEL',
      description: 'Steel',
      uom: 'KG',
      quantity: 2.3,
      unitPriceCents: 100,
      lineTotalCents: 230,
      receivedQuantity: 1.2,
      invoicedQuantity: 0,
    },
  ],
  ...overrides,
});

const input = (received: number, rejected = 0, reason?: string): PostGoodsReceipt => ({
  poId: 'po',
  deliveryNote: 'DN-1',
  lines: [
    {
      poLineId: 'l1',
      receivedQuantity: received,
      rejectedQuantity: rejected,
      ...(reason ? { rejectionReason: reason } : {}),
    },
  ],
});

const codeOf = (fn: () => unknown) => {
  try {
    fn();
    return undefined;
  } catch (e) {
    return e instanceof DomainError ? e.code : 'NOT_A_DOMAIN_ERROR';
  }
};

describe('checkReceipt', () => {
  it('accepts received minus rejected, exactly (no float drift)', () => {
    const [line] = checkReceipt(po(), 'walt', input(1.2, 0.1, 'dented'));
    expect(line).toMatchObject({ acceptedQuantity: 1.1, rejectionReason: 'dented' });
  });

  it('allows completing the open quantity to the gram', () => {
    expect(codeOf(() => checkReceipt(po(), 'walt', input(1.1)))).toBeUndefined();
  });

  it('refuses over-delivery but lets the excess be rejected', () => {
    expect(codeOf(() => checkReceipt(po(), 'walt', input(1.5)))).toBe('GR_OVER_DELIVERY');
    expect(
      codeOf(() => checkReceipt(po(), 'walt', input(1.5, 0.4, 'over-delivery'))),
    ).toBeUndefined();
  });

  it('keeps purchasing and receiving apart (SoD)', () => {
    expect(codeOf(() => checkReceipt(po(), 'bea', input(1)))).toBe('GR_SOD_BUYER_RECEIVER');
  });

  it('only receives against issued, open POs', () => {
    expect(codeOf(() => checkReceipt(po({ status: 'DRAFT' }), 'walt', input(1)))).toBe(
      'GR_PO_NOT_OPEN',
    );
    expect(codeOf(() => checkReceipt(po({ status: 'CLOSED' }), 'walt', input(1)))).toBe(
      'GR_PO_NOT_OPEN',
    );
  });

  it('rejects lines from other POs', () => {
    const foreign = {
      ...input(1),
      lines: [{ poLineId: 'x', receivedQuantity: 1, rejectedQuantity: 0 }],
    };
    expect(codeOf(() => checkReceipt(po(), 'walt', foreign))).toBe('GR_UNKNOWN_LINE');
  });
});
